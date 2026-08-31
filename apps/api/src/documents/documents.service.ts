import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import {
  applyOperation,
  createSnapshot,
  extractSection,
  findNode,
  restoreDocument,
  type DocumentOperation,
} from '@delayance/document-engine';
import {
  createEmptyDocument,
  documentSchema,
  generateNodeId,
  type Document,
  type SectionNode,
} from '@delayance/document-model';
import { documentToPlainText, exportDocx, importDocx } from '@delayance/docx-engine';
import type { ProjectRole } from '@delayance/shared-types';
import { DatabaseService } from '../database/database.service';
import {
  comments,
  documentTemplates,
  documentVersions,
  documents,
  sectionAssignments,
} from '../database/schema';
import { AuditService } from '../rbac/audit.service';
import { canComment, canEditContent } from '../rbac/roles';
import { StorageService } from '../storage/storage.service';
import { TemplatesService } from '../templates/templates.service';
import { DOCUMENT_EXTRACT_QUEUE, JobsService } from '../jobs/jobs.service';

function asDocument(content: unknown): Document {
  return documentSchema.parse(content) as Document;
}

@Injectable()
export class DocumentsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
    private readonly templates: TemplatesService,
    private readonly storage: StorageService,
    private readonly jobs: JobsService,
  ) {}

  list(projectId: string) {
    return this.database.db
      .select({
        id: documents.id,
        projectId: documents.projectId,
        title: documents.title,
        templateId: documents.templateId,
        status: documents.status,
        createdAt: documents.createdAt,
        updatedAt: documents.updatedAt,
      })
      .from(documents)
      .where(eq(documents.projectId, projectId))
      .orderBy(desc(documents.updatedAt));
  }

  async get(projectId: string, documentId: string) {
    const doc = await this.database.db.query.documents.findFirst({
      where: and(eq(documents.id, documentId), eq(documents.projectId, projectId)),
    });
    if (!doc) throw new NotFoundException('Document not found');
    return doc;
  }

  async create(
    projectId: string,
    userId: string,
    input: { title: string; templateId?: string },
  ) {
    const template = input.templateId
      ? await this.database.db.query.documentTemplates.findFirst({
          where: eq(documentTemplates.id, input.templateId),
        })
      : await this.templates.getDefault();

    const content = createEmptyDocument(input.title);
    if (template?.definition) {
      content.template = template.definition;
    }

    // A newly-created document is immediately a DOCX-backed document. The empty JSON
    // model remains only until the clean-break migration drops legacy columns.
    const exported = await exportDocx(content, {
      includeTocField: false,
      includePageNumberFields: true,
    });
    const fileHash = createHash('sha256').update(exported.buffer).digest('hex');
    const documentId = generateNodeId();
    const fileKey = `documents/${documentId}/files/${fileHash}.docx`;
    if (!(await this.storage.objectExists(fileKey))) {
      await this.storage.putObjectAtKey({
        projectId,
        userId,
        objectKey: fileKey,
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        body: exported.buffer,
      });
    }

    const [row] = await this.database.db
      .insert(documents)
      .values({
        id: documentId,
        projectId,
        title: input.title,
        templateId: template?.id ?? null,
        content,
        searchText: documentToPlainText(content).slice(0, 100_000),
        fileKey,
        fileFormat: 'docx',
        fileSize: exported.buffer.length,
        fileHash,
        currentVersion: 1,
        analysisStatus: 'pending',
        status: 'draft',
      })
      .returning();

    if (!row) throw new Error('Failed to create document');

    await this.saveVersion(row.id, content, userId, 'Initial version', 'document.created', {
      versionNumber: 1,
      fileKey,
      fileHash,
      fileSize: exported.buffer.length,
    });
    await this.audit.record({
      actorId: userId,
      action: 'document.created',
      entityType: 'document',
      entityId: row.id,
    });
    await this.jobs.createAndEnqueue({
      type: 'document.extract',
      queue: DOCUMENT_EXTRACT_QUEUE,
      projectId,
      documentId: row.id,
      userId,
      payload: { documentId: row.id, projectId, fileKey, fileHash, version: 1 },
    });
    return row;
  }

  async updateMeta(
    projectId: string,
    documentId: string,
    userId: string,
    role: ProjectRole,
    input: { title?: string; status?: 'draft' | 'in_review' | 'approved' },
  ) {
    if (!canEditContent(role)) throw new ForbiddenException('Cannot edit document');
    await this.get(projectId, documentId);
    const [row] = await this.database.db
      .update(documents)
      .set({
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        updatedAt: new Date(),
      })
      .where(eq(documents.id, documentId))
      .returning();
    await this.audit.record({
      actorId: userId,
      action: 'document.meta_updated',
      entityType: 'document',
      entityId: documentId,
    });
    return row;
  }

  async patchContent(
    projectId: string,
    documentId: string,
    userId: string,
    role: ProjectRole,
    input: {
      content: unknown;
      createVersion?: boolean;
      versionName?: string;
      versionReason?: string;
    },
  ) {
    if (!canEditContent(role)) throw new ForbiddenException('Cannot edit document');
    const parsed = documentSchema.safeParse(input.content);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid document content',
        details: parsed.error.flatten(),
      });
    }
    const content = parsed.data as Document;
    const existing = await this.get(projectId, documentId);

    if (role === 'contributor' || role === 'editor' || role === 'owner') {
      // locked section check for contributors: reject if content unlocks locked sections without owner
      // Owners/editors can edit locked content
    }

    const [row] = await this.database.db
      .update(documents)
      .set({
        content,
        title: content.title || existing.title,
        searchText: documentToPlainText(content).slice(0, 100_000),
        updatedAt: new Date(),
      })
      .where(eq(documents.id, documentId))
      .returning();

    if (input.createVersion !== false) {
      await this.saveVersion(
        documentId,
        content,
        userId,
        input.versionName,
        input.versionReason ?? 'autosave',
      );
    }

    await this.audit.record({
      actorId: userId,
      action: 'document.content_saved',
      entityType: 'document',
      entityId: documentId,
    });
    return row;
  }

  async importOfficeFile(
    projectId: string,
    userId: string,
    role: ProjectRole,
    input: { title: string; buffer: Buffer },
  ) {
    if (!canEditContent(role)) throw new ForbiddenException('Cannot import document');
    const created = await this.create(projectId, userId, { title: input.title });
    return this.replaceOfficeFile(projectId, created.id, userId, role, input.buffer, 'docx.import');
  }

  async replaceOfficeFile(
    projectId: string,
    documentId: string,
    userId: string,
    role: ProjectRole,
    buffer: Buffer,
    reason: string,
  ) {
    if (!canEditContent(role)) throw new ForbiddenException('Cannot edit document');
    if (buffer.length === 0 || buffer.length > 100 * 1024 * 1024) {
      throw new BadRequestException('Invalid DOCX file size');
    }
    const existing = await this.get(projectId, documentId);
    const fileHash = createHash('sha256').update(buffer).digest('hex');
    if (fileHash === existing.fileHash) return existing;
    const fileKey = `documents/${documentId}/files/${fileHash}.docx`;
    if (!(await this.storage.objectExists(fileKey))) {
      await this.storage.putObjectAtKey({
        projectId,
        userId,
        objectKey: fileKey,
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        body: buffer,
      });
    }
    const version = existing.currentVersion + 1;
    const [row] = await this.database.db
      .update(documents)
      .set({
        fileKey,
        fileFormat: 'docx',
        fileSize: buffer.length,
        fileHash,
        currentVersion: version,
        analysisStatus: 'pending',
        analysisError: null,
        updatedAt: new Date(),
      })
      .where(eq(documents.id, documentId))
      .returning();
    await this.saveVersion(documentId, asDocument(existing.content), userId, undefined, reason, {
      versionNumber: version,
      fileKey,
      fileHash,
      fileSize: buffer.length,
    });
    await this.jobs.createAndEnqueue({
      type: 'document.extract',
      queue: DOCUMENT_EXTRACT_QUEUE,
      projectId,
      documentId,
      userId,
      payload: { documentId, projectId, fileKey, fileHash, version },
    });
    return row!;
  }

  async applyOp(
    projectId: string,
    documentId: string,
    userId: string,
    role: ProjectRole,
    operation: DocumentOperation,
    force?: boolean,
  ) {
    if (!canEditContent(role)) throw new ForbiddenException('Cannot edit document');
    const existing = await this.get(projectId, documentId);
    const content = existing.content;

    if (role !== 'owner' && this.opTouchesLocked(content, operation)) {
      throw new ForbiddenException('Cannot modify locked section');
    }

    const result = applyOperation(content, {
      ...operation,
      ...(operation.type === 'delete' ? { force: force ?? operation.force } : {}),
    } as DocumentOperation);

    if (!result.ok) {
      throw new BadRequestException({
        message: result.error ?? 'Operation failed',
        details: { warnings: result.warnings },
      });
    }

    const [row] = await this.database.db
      .update(documents)
      .set({
        content: result.document,
        searchText: documentToPlainText(result.document).slice(0, 100_000),
        updatedAt: new Date(),
      })
      .where(eq(documents.id, documentId))
      .returning();

    await this.saveVersion(documentId, result.document, userId, undefined, 'structural_op');
    await this.audit.record({
      actorId: userId,
      action: 'document.operation',
      entityType: 'document',
      entityId: documentId,
      metadata: { type: operation.type },
    });

    return { document: row, warnings: result.warnings };
  }

  async listVersions(projectId: string, documentId: string, limit = 50, offset = 0) {
    await this.get(projectId, documentId);
    return this.database.db
      .select({
        id: documentVersions.id,
        documentId: documentVersions.documentId,
        name: documentVersions.name,
        reason: documentVersions.reason,
        createdBy: documentVersions.createdBy,
        createdAt: documentVersions.createdAt,
      })
      .from(documentVersions)
      .where(eq(documentVersions.documentId, documentId))
      .orderBy(desc(documentVersions.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async getVersion(projectId: string, documentId: string, versionId: string) {
    await this.get(projectId, documentId);
    const version = await this.database.db.query.documentVersions.findFirst({
      where: and(
        eq(documentVersions.id, versionId),
        eq(documentVersions.documentId, documentId),
      ),
    });
    if (!version) throw new NotFoundException('Version not found');
    return version;
  }

  async restoreVersion(
    projectId: string,
    documentId: string,
    versionId: string,
    userId: string,
    role: ProjectRole,
  ) {
    if (!canEditContent(role)) throw new ForbiddenException('Cannot restore version');
    const version = await this.getVersion(projectId, documentId, versionId);
    const snapshot = createSnapshot(version.snapshot, {
      name: version.name ?? undefined,
      reason: 'restore-source',
    });
    const restored = restoreDocument(snapshot);
    const [row] = await this.database.db
      .update(documents)
      .set({
        content: restored,
        searchText: documentToPlainText(restored).slice(0, 100_000),
        updatedAt: new Date(),
      })
      .where(eq(documents.id, documentId))
      .returning();
    await this.saveVersion(documentId, restored, userId, `Restored ${versionId}`, 'restore');
    return row;
  }

  listComments(projectId: string, documentId: string) {
    return this.get(projectId, documentId).then(() =>
      this.database.db
        .select()
        .from(comments)
        .where(eq(comments.documentId, documentId))
        .orderBy(desc(comments.createdAt)),
    );
  }

  async createComment(
    projectId: string,
    documentId: string,
    userId: string,
    role: ProjectRole,
    input: { anchorNodeId: string; body: string; parentId?: string },
  ) {
    if (!canComment(role)) throw new ForbiddenException('Cannot comment');
    await this.get(projectId, documentId);
    const [row] = await this.database.db
      .insert(comments)
      .values({
        documentId,
        authorId: userId,
        anchorNodeId: input.anchorNodeId,
        body: input.body,
        parentId: input.parentId,
      })
      .returning();
    return row;
  }

  async resolveComment(
    projectId: string,
    documentId: string,
    commentId: string,
    role: ProjectRole,
  ) {
    if (!canComment(role)) throw new ForbiddenException('Cannot resolve comments');
    await this.get(projectId, documentId);
    const [row] = await this.database.db
      .update(comments)
      .set({ resolvedAt: new Date() })
      .where(and(eq(comments.id, commentId), eq(comments.documentId, documentId)))
      .returning();
    if (!row) throw new NotFoundException('Comment not found');
    return row;
  }

  listAssignments(projectId: string, documentId: string) {
    return this.get(projectId, documentId).then(() =>
      this.database.db
        .select()
        .from(sectionAssignments)
        .where(eq(sectionAssignments.documentId, documentId)),
    );
  }

  async upsertAssignment(
    projectId: string,
    documentId: string,
    userId: string,
    role: ProjectRole,
    input: {
      sectionId: string;
      assigneeId?: string | null;
      status:
        | 'not_started'
        | 'notes'
        | 'draft'
        | 'needs_review'
        | 'approved'
        | 'locked';
    },
  ) {
    if (!canEditContent(role)) throw new ForbiddenException('Cannot assign sections');
    const doc = await this.get(projectId, documentId);

    const existing = await this.database.db.query.sectionAssignments.findFirst({
      where: and(
        eq(sectionAssignments.documentId, documentId),
        eq(sectionAssignments.sectionId, input.sectionId),
      ),
    });

    let assignment;
    if (existing) {
      [assignment] = await this.database.db
        .update(sectionAssignments)
        .set({
          status: input.status,
          assigneeId: input.assigneeId === undefined ? existing.assigneeId : input.assigneeId,
          updatedAt: new Date(),
        })
        .where(eq(sectionAssignments.id, existing.id))
        .returning();
    } else {
      [assignment] = await this.database.db
        .insert(sectionAssignments)
        .values({
          documentId,
          sectionId: input.sectionId,
          assigneeId: input.assigneeId ?? null,
          status: input.status,
        })
        .returning();
    }

    // Mirror lock into document content
    const content = structuredClone(doc.content);
    const loc = findNode(content, input.sectionId);
    if (loc && loc.node.type === 'section') {
      loc.node.locked = input.status === 'locked';
      await this.database.db
        .update(documents)
        .set({ content, updatedAt: new Date() })
        .where(eq(documents.id, documentId));
    }

    await this.audit.record({
      actorId: userId,
      action: 'section.assignment_upserted',
      entityType: 'document',
      entityId: documentId,
      metadata: { sectionId: input.sectionId, status: input.status },
    });

    return assignment;
  }

  async exportSectionDocx(
    projectId: string,
    documentId: string,
    sectionId: string,
    userId: string,
  ) {
    const doc = await this.get(projectId, documentId);
    const content = asDocument(doc.content);
    const section = extractSection(content, sectionId);
    if (!section) throw new NotFoundException('Section not found');

    const mini: Document = {
      id: generateNodeId(),
      title: `${doc.title} — section`,
      template: content.template,
      children: [section],
    };
    const exported = await exportDocx(mini, {
      includeTocField: false,
      includePageNumberFields: true,
    });
    const stored = await this.storage.putObject({
      projectId,
      userId,
      keyPrefix: `projects/${projectId}/section-exports`,
      filename: `section-${sectionId}.docx`,
      contentType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      body: exported.buffer,
    });
    const url = await this.storage.getSignedDownloadUrl(stored.objectKey);
    return { storedObjectId: stored.id, downloadUrl: url, report: exported.compatibilityReport };
  }

  async importSectionDocx(
    projectId: string,
    documentId: string,
    sectionId: string,
    userId: string,
    role: ProjectRole,
    buffer: Buffer,
  ) {
    if (!canEditContent(role)) throw new ForbiddenException();
    const doc = await this.get(projectId, documentId);
    const content = asDocument(doc.content);
    const existing = extractSection(content, sectionId);
    if (!existing) throw new NotFoundException('Section not found');
    if (existing.locked && role !== 'owner') {
      throw new ForbiddenException('Section is locked');
    }

    const imported = await importDocx(buffer, { mode: 'normalize' });
    const incoming = imported.document.children.find((c) => c.type === 'section') as
      | SectionNode
      | undefined;
    const replacement: SectionNode = incoming
      ? { ...incoming, id: sectionId, locked: existing.locked }
      : {
          id: sectionId,
          type: 'section',
          locked: existing.locked,
          children: imported.document.children,
        };

    const result = applyOperation(content, {
      type: 'replace',
      targetId: sectionId,
      node: replacement,
    });
    if (!result.ok) {
      throw new BadRequestException(result.error ?? 'Failed to replace section');
    }

    return this.patchContent(projectId, documentId, userId, role, {
      content: result.document,
      createVersion: true,
      versionReason: 'section.docx.import',
    });
  }

  private async saveVersion(
    documentId: string,
    content: Document,
    userId: string,
    name?: string,
    reason?: string,
    file?: { versionNumber: number; fileKey: string; fileHash: string; fileSize: number },
  ) {
    const snap = createSnapshot(content, { name, reason });
    await this.database.db.insert(documentVersions).values({
      documentId,
      snapshot: snap.document,
      name: name ?? null,
      reason: reason ?? null,
      createdBy: userId,
      ...(file ?? {}),
    });
  }

  private opTouchesLocked(doc: Document, op: DocumentOperation): boolean {
    const ids: string[] = [];
    if (op.type === 'delete' || op.type === 'replace') ids.push(op.targetId);
    if (op.type === 'moveSection') ids.push(op.sectionId);
    if (op.type === 'promoteHeading' || op.type === 'demoteHeading') ids.push(op.headingId);
    if (op.type === 'insert' && op.parentId) ids.push(op.parentId);

    for (const id of ids) {
      if (this.isInLockedSection(doc, id)) return true;
    }
    return false;
  }

  private isInLockedSection(doc: Document, nodeId: string): boolean {
    const walk = (
      nodes: Document['children'],
      lockedAncestor: boolean,
    ): boolean => {
      for (const node of nodes) {
        const locked =
          lockedAncestor || (node.type === 'section' && Boolean(node.locked));
        if (node.id === nodeId) return locked;
        if (node.type === 'section' || node.type === 'appendix') {
          if (walk(node.children, locked)) return true;
        }
      }
      return false;
    };
    return walk(doc.children, false);
  }
}

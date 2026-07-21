import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import {
  applyNormalize,
  previewNormalize,
  documentToMarkdown,
  documentToPlainText,
  documentToHtml,
} from '@delayance/docx-engine';
import { documentSchema, type Document } from '@delayance/document-model';
import type { ProjectRole } from '@delayance/shared-types';
import { DatabaseService } from '../database/database.service';
import {
  documentExports,
  documentImports,
  documents,
  storedObjects,
} from '../database/schema';
import {
  DOCX_EXPORT_QUEUE,
  DOCX_IMPORT_QUEUE,
  JobsService,
  PDF_EXPORT_QUEUE,
} from '../jobs/jobs.service';
import { canEditContent } from '../rbac/roles';
import { StorageService } from '../storage/storage.service';
import { DocumentsService } from '../documents/documents.service';

function asDocument(content: unknown): Document {
  return documentSchema.parse(content) as Document;
}

@Injectable()
export class InterchangeService {
  constructor(
    private readonly database: DatabaseService,
    private readonly storage: StorageService,
    private readonly jobs: JobsService,
    private readonly documents: DocumentsService,
  ) {}

  async uploadFile(input: {
    projectId: string;
    userId: string;
    filename: string;
    contentType: string;
    buffer: Buffer;
  }) {
    return this.storage.putObject({
      projectId: input.projectId,
      userId: input.userId,
      keyPrefix: `projects/${input.projectId}/uploads`,
      filename: input.filename,
      contentType: input.contentType || 'application/octet-stream',
      body: input.buffer,
    });
  }

  async startImport(input: {
    projectId: string;
    userId: string;
    role: ProjectRole;
    fileId: string;
    mode: 'preserve' | 'normalize';
    documentId?: string;
  }) {
    if (!canEditContent(input.role)) throw new ForbiddenException();
    const file = await this.database.db.query.storedObjects.findFirst({
      where: and(
        eq(storedObjects.id, input.fileId),
        eq(storedObjects.projectId, input.projectId),
      ),
    });
    if (!file) throw new NotFoundException('File not found');

    const [imp] = await this.database.db
      .insert(documentImports)
      .values({
        projectId: input.projectId,
        documentId: input.documentId ?? null,
        sourceObjectId: file.id,
        mode: input.mode,
        status: 'queued',
        createdBy: input.userId,
      })
      .returning();
    if (!imp) throw new Error('Failed to create import');

    const job = await this.jobs.createAndEnqueue({
      type: 'docx.import',
      queue: DOCX_IMPORT_QUEUE,
      projectId: input.projectId,
      documentId: input.documentId ?? null,
      userId: input.userId,
      payload: {
        importId: imp.id,
        objectKey: file.objectKey,
        mode: input.mode,
      },
    });

    return { import: imp, job };
  }

  async getImport(projectId: string, importId: string) {
    const row = await this.database.db.query.documentImports.findFirst({
      where: and(
        eq(documentImports.id, importId),
        eq(documentImports.projectId, projectId),
      ),
    });
    if (!row) throw new NotFoundException('Import not found');
    return row;
  }

  async applyImport(input: {
    projectId: string;
    importId: string;
    userId: string;
    role: ProjectRole;
    title?: string;
  }) {
    if (!canEditContent(input.role)) throw new ForbiddenException();
    const imp = await this.getImport(input.projectId, input.importId);
    if (!imp.previewContent) {
      throw new BadRequestException('Import preview not ready');
    }
    const content = asDocument(imp.previewContent);
    if (input.title) content.title = input.title;

    let doc;
    if (imp.documentId) {
      doc = await this.documents.patchContent(
        input.projectId,
        imp.documentId,
        input.userId,
        input.role,
        {
          content,
          createVersion: true,
          versionReason: 'docx.import.apply',
        },
      );
    } else {
      doc = await this.documents.create(input.projectId, input.userId, {
        title: content.title || input.title || 'Imported document',
      });
      doc = await this.documents.patchContent(
        input.projectId,
        doc.id,
        input.userId,
        input.role,
        {
          content: { ...content, id: doc.id, title: doc.title },
          createVersion: true,
          versionReason: 'docx.import.apply',
        },
      );
    }

    if (!doc) throw new Error('Failed to apply import');

    await this.database.db
      .update(documentImports)
      .set({ status: 'applied', documentId: doc.id })
      .where(eq(documentImports.id, imp.id));

    return doc;
  }

  async startExport(input: {
    projectId: string;
    documentId: string;
    userId: string;
    role: ProjectRole;
    format: 'docx' | 'pdf' | 'markdown' | 'html' | 'plain';
  }) {
    const doc = await this.documents.get(input.projectId, input.documentId);
    const content = asDocument(doc.content);

    if (input.format === 'markdown' || input.format === 'html' || input.format === 'plain') {
      const text =
        input.format === 'markdown'
          ? documentToMarkdown(content)
          : input.format === 'html'
            ? documentToHtml(content)
            : documentToPlainText(content);
      const contentType =
        input.format === 'html' ? 'text/html' : 'text/plain; charset=utf-8';
      const ext =
        input.format === 'markdown' ? 'md' : input.format === 'html' ? 'html' : 'txt';
      const stored = await this.storage.putObject({
        projectId: input.projectId,
        userId: input.userId,
        keyPrefix: `projects/${input.projectId}/exports`,
        filename: `${doc.title}.${ext}`,
        contentType,
        body: Buffer.from(text, 'utf8'),
      });
      const [exp] = await this.database.db
        .insert(documentExports)
        .values({
          documentId: doc.id,
          format: input.format,
          storedObjectId: stored.id,
          createdBy: input.userId,
        })
        .returning();
      const url = await this.storage.getSignedDownloadUrl(stored.objectKey);
      return { export: exp, downloadUrl: url, job: null };
    }

    const queue = input.format === 'pdf' ? PDF_EXPORT_QUEUE : DOCX_EXPORT_QUEUE;
    const [exp] = await this.database.db
      .insert(documentExports)
      .values({
        documentId: doc.id,
        format: input.format,
        createdBy: input.userId,
      })
      .returning();
    if (!exp) throw new Error('Failed to create export');

    const job = await this.jobs.createAndEnqueue({
      type: input.format === 'pdf' ? 'pdf.export' : 'docx.export',
      queue,
      projectId: input.projectId,
      documentId: doc.id,
      userId: input.userId,
      payload: {
        exportId: exp.id,
        content,
        title: doc.title,
      },
    });

    return { export: exp, job, downloadUrl: null };
  }

  async listExports(projectId: string, documentId: string) {
    await this.documents.get(projectId, documentId);
    return this.database.db
      .select()
      .from(documentExports)
      .where(eq(documentExports.documentId, documentId))
      .orderBy(desc(documentExports.createdAt));
  }

  async getExportDownload(projectId: string, exportId: string) {
    const exp = await this.database.db.query.documentExports.findFirst({
      where: eq(documentExports.id, exportId),
    });
    if (!exp?.storedObjectId) throw new NotFoundException('Export not ready');
    const doc = await this.database.db.query.documents.findFirst({
      where: and(eq(documents.id, exp.documentId), eq(documents.projectId, projectId)),
    });
    if (!doc) throw new NotFoundException('Document not found');
    const obj = await this.database.db.query.storedObjects.findFirst({
      where: eq(storedObjects.id, exp.storedObjectId),
    });
    if (!obj) throw new NotFoundException('Object not found');
    const url = await this.storage.getSignedDownloadUrl(obj.objectKey);
    return { ...exp, downloadUrl: url };
  }

  cleanupPreview(content: unknown) {
    const doc = asDocument(content);
    return previewNormalize(doc);
  }

  cleanupApply(content: unknown) {
    const doc = asDocument(content);
    return applyNormalize(doc);
  }
}

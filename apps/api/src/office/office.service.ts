import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { createEmptyDocument } from '@delayance/document-model';
import { exportDocx } from '@delayance/docx-engine';
import type { ProjectRole } from '@delayance/shared-types';
import { AppConfigService } from '../config/app-config.service';
import { DatabaseService } from '../database/database.service';
import { documentVersions, documents, officeSessions, projectMembers } from '../database/schema';
import { DOCUMENT_EXTRACT_QUEUE, JobsService } from '../jobs/jobs.service';
import { RedisService } from '../redis/redis.service';
import { canEditContent } from '../rbac/roles';
import { StorageService } from '../storage/storage.service';

const DOCX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export interface WopiSession {
  documentId: string;
  projectId: string;
  userId: string;
  role: ProjectRole;
  permission: 'read' | 'write';
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class OfficeService {
  constructor(
    private readonly config: AppConfigService,
    private readonly database: DatabaseService,
    private readonly storage: StorageService,
    private readonly redis: RedisService,
    private readonly jobs: JobsService,
  ) {}

  async createBrowserSession(input: {
    projectId: string;
    documentId: string;
    userId: string;
    role: ProjectRole;
  }) {
    if (!this.config.env.OFFICE_ENABLED) {
      throw new BadRequestException('LibreOffice integration is disabled');
    }
    const document = await this.requireDocument(input.projectId, input.documentId);
    await this.ensureOfficeFile(document.id, document.projectId, document.title, input.userId, document.content);
    const permission = canEditContent(input.role) ? 'write' : 'read';
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.config.env.WOPI_TOKEN_TTL_SECONDS * 1000);
    await this.database.db.insert(officeSessions).values({
      documentId: document.id,
      userId: input.userId,
      tokenHash: hashToken(token),
      permission,
      expiresAt,
    });

    const wopiSource = new URL(
      `/wopi/files/${document.id}`,
      this.config.env.WOPI_BASE_URL,
    ).toString();
    const actionUrl = await this.resolveEditorActionUrl(permission);
    return {
      actionUrl,
      wopiSource,
      accessToken: token,
      // WOPI specifies this as milliseconds since the Unix epoch.
      accessTokenTtl: expiresAt.getTime(),
      permission,
      document: await this.requireDocument(input.projectId, input.documentId),
    };
  }

  async sessionForToken(documentId: string, token: string): Promise<WopiSession> {
    const session = await this.database.db.query.officeSessions.findFirst({
      where: and(
        eq(officeSessions.documentId, documentId),
        eq(officeSessions.tokenHash, hashToken(token)),
        isNull(officeSessions.revokedAt),
      ),
    });
    if (!session || session.expiresAt <= new Date()) throw new ForbiddenException('Invalid WOPI token');
    const document = await this.database.db.query.documents.findFirst({
      where: eq(documents.id, documentId),
    });
    if (!document) throw new NotFoundException('Document not found');
    const member = await this.database.db.query.projectMembers.findFirst({
      where: and(eq(projectMembers.projectId, document.projectId), eq(projectMembers.userId, session.userId)),
    });
    if (!member) throw new ForbiddenException('Project access revoked');
    const permission = canEditContent(member.role) && session.permission === 'write' ? 'write' : 'read';
    await this.database.db
      .update(officeSessions)
      .set({ lastUsedAt: new Date() })
      .where(eq(officeSessions.id, session.id));
    return {
      documentId,
      projectId: document.projectId,
      userId: session.userId,
      role: member.role,
      permission,
    };
  }

  async checkFileInfo(session: WopiSession) {
    const document = await this.requireDocument(session.projectId, session.documentId);
    if (!document.fileKey || !document.fileSize || !document.fileHash) {
      throw new NotFoundException('Office file has not been created');
    }
    return {
      BaseFileName: this.safeFilename(document.title),
      OwnerId: document.projectId,
      Size: document.fileSize,
      Version: `${document.currentVersion}:${document.fileHash}`,
      LastModifiedTime: document.updatedAt.toISOString(),
      UserId: session.userId,
      UserFriendlyName: session.userId,
      UserCanWrite: session.permission === 'write',
      ReadOnly: session.permission !== 'write',
      SupportsLocks: true,
      SupportsGetLock: true,
      UserCanNotWriteRelative: true,
      PostMessageOrigin: this.config.env.WEB_ORIGIN,
      HideSaveOption: true,
      HideExportOption: true,
      DisableBreadcrumb: true,
      BreadcrumbDocName: '',
      HideUserList: true,
      HideSideBar: true,
      HideSidebar: true,
      HideStatusBar: true,
      HideRuler: true,
      DisableSidebar: true,
      EnableInsertRemoteImage: true,
      UI_Defaults: 'UIMode=compact;ShowSidebar=false;TextSidebar=false;Sidebar=false;ShowProperties=false;ShowMenubar=false;ShowToolbar=false;ShowStatusbar=false;ShowRuler=false;TextMenubar=false;TextStatusbar=false;TextRuler=false;SaveAsMode=group',
    };
  }

  async getAnalysis(projectId: string, documentId: string) {
    const document = await this.requireDocument(projectId, documentId);
    return {
      documentId: document.id,
      currentVersion: document.currentVersion,
      fileHash: document.fileHash,
      analysisVersion: document.analysisVersion,
      analysisStatus: document.analysisStatus,
      analysisError: document.analysisError,
      analysis: document.analysisContent,
      stale: document.analysisVersion !== document.currentVersion,
    };
  }

  async download(projectId: string, documentId: string) {
    const document = await this.requireDocument(projectId, documentId);
    if (!document.fileKey) throw new NotFoundException('Office file has not been created');
    return { filename: this.safeFilename(document.title), file: await this.storage.getObjectBuffer(document.fileKey) };
  }

  async getFile(session: WopiSession) {
    const document = await this.requireDocument(session.projectId, session.documentId);
    if (!document.fileKey) throw new NotFoundException('Office file has not been created');
    return this.storage.getObjectBuffer(document.fileKey);
  }

  async putFile(session: WopiSession, buffer: Buffer, lock: string | undefined) {
    if (session.permission !== 'write') throw new ForbiddenException('Read-only WOPI session');
    if (buffer.length === 0 || buffer.length > 100 * 1024 * 1024) {
      throw new BadRequestException('Invalid office file size');
    }
    await this.assertCompatibleLock(session.documentId, lock ?? '');
    const document = await this.requireDocument(session.projectId, session.documentId);
    const fileHash = createHash('sha256').update(buffer).digest('hex');
    if (fileHash === document.fileHash) {
      return { LastModifiedTime: document.updatedAt.toISOString(), version: document.currentVersion };
    }
    const fileKey = `documents/${document.id}/files/${fileHash}.docx`;
    if (!(await this.storage.objectExists(fileKey))) {
      await this.storage.putObjectAtKey({
        projectId: document.projectId,
        userId: session.userId,
        objectKey: fileKey,
        contentType: DOCX_CONTENT_TYPE,
        body: buffer,
      });
    }
    const version = document.currentVersion + 1;
    await this.database.db.transaction(async (tx) => {
      await tx
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
        .where(eq(documents.id, document.id));
      // `snapshot` is retained only until the destructive clean-break migration removes it.
      await tx.insert(documentVersions).values({
        documentId: document.id,
        snapshot: document.content,
        versionNumber: version,
        fileKey,
        fileHash,
        fileSize: buffer.length,
        reason: 'wopi.save',
        createdBy: session.userId,
      });
    });
    await this.jobs.createAndEnqueue({
      type: 'document.extract',
      queue: DOCUMENT_EXTRACT_QUEUE,
      projectId: document.projectId,
      documentId: document.id,
      userId: session.userId,
      payload: { documentId: document.id, projectId: document.projectId, fileKey, fileHash, version },
    });
    return { LastModifiedTime: new Date().toISOString(), version };
  }

  async lock(documentId: string, requestedLock: string) {
    if (!requestedLock) throw new BadRequestException('X-WOPI-Lock is required');
    const key = this.lockKey(documentId);
    const seconds = this.config.env.WOPI_LOCK_TTL_SECONDS;
    const result = await this.redis.client.eval(
      "local current=redis.call('GET', KEYS[1]); if (not current) or current==ARGV[1] then redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2]); return 1 else return 0 end",
      1,
      key,
      requestedLock,
      String(seconds),
    );
    if (result !== 1) return { ok: false, lock: await this.redis.client.get(key) };
    return { ok: true };
  }

  async unlock(documentId: string, requestedLock: string) {
    const key = this.lockKey(documentId);
    const result = await this.redis.client.eval(
      "local current=redis.call('GET', KEYS[1]); if current==ARGV[1] then redis.call('DEL', KEYS[1]); return 1 else return 0 end",
      1,
      key,
      requestedLock,
    );
    if (result !== 1) return { ok: false, lock: await this.redis.client.get(key) };
    return { ok: true };
  }

  async getLock(documentId: string) {
    return this.redis.client.get(this.lockKey(documentId));
  }

  private async ensureOfficeFile(
    documentId: string,
    projectId: string,
    title: string,
    userId: string,
    legacyContent: unknown,
  ) {
    const existing = await this.database.db.query.documents.findFirst({ where: eq(documents.id, documentId) });
    if (existing?.fileKey) return;
    const content = legacyContent && typeof legacyContent === 'object'
      ? legacyContent as ReturnType<typeof createEmptyDocument>
      : createEmptyDocument(title);
    const exported = await exportDocx(content, { includeTocField: false, includePageNumberFields: true });
    const fileHash = createHash('sha256').update(exported.buffer).digest('hex');
    const fileKey = `documents/${documentId}/files/${fileHash}.docx`;
    if (!(await this.storage.objectExists(fileKey))) {
      await this.storage.putObjectAtKey({ projectId, userId, objectKey: fileKey, contentType: DOCX_CONTENT_TYPE, body: exported.buffer });
    }
    await this.database.db
      .update(documents)
      .set({
        fileKey,
        fileFormat: 'docx',
        fileSize: exported.buffer.length,
        fileHash,
        currentVersion: Math.max(existing?.currentVersion ?? 0, 1),
        analysisStatus: 'pending',
        updatedAt: new Date(),
      })
      .where(eq(documents.id, documentId));
  }

  private async requireDocument(projectId: string, documentId: string) {
    const document = await this.database.db.query.documents.findFirst({
      where: and(eq(documents.id, documentId), eq(documents.projectId, projectId)),
    });
    if (!document) throw new NotFoundException('Document not found');
    return document;
  }

  private async assertCompatibleLock(documentId: string, requestedLock: string) {
    const current = await this.getLock(documentId);
    if (current && current !== requestedLock) throw new ConflictException({ lock: current });
  }

  private async resolveEditorActionUrl(permission: 'read' | 'write') {
    const response = await fetch(this.config.env.OFFICE_DISCOVERY_URL);
    if (!response.ok) throw new BadRequestException('Collabora discovery is unavailable');
    const xml = await response.text();
    const actionName = permission === 'write' ? 'edit' : 'view';
    const action = [...xml.matchAll(/<action\b[^>]*>/g)]
      .map((match) => match[0])
      .find((tag) => new RegExp(`name="${actionName}"`).test(tag) && /ext="docx"/.test(tag));
    const fallback = [...xml.matchAll(/<action\b[^>]*>/g)].map((match) => match[0]).find((tag) => new RegExp(`name="${actionName}"`).test(tag));
    const source = (/(?:urlsrc)="([^"]+)"/.exec(action ?? fallback ?? '')?.[1])?.replace(/&amp;/g, '&');
    if (!source) throw new BadRequestException('Collabora discovery has no Writer action');
    const discovered = new URL(source);
    const browserOrigin = new URL(this.config.env.OFFICE_BROWSER_URL).origin;
    discovered.protocol = new URL(browserOrigin).protocol;
    discovered.host = new URL(browserOrigin).host;
    return discovered.toString();
  }

  private lockKey(documentId: string) {
    return `wopi:lock:${documentId}`;
  }

  private safeFilename(title: string) {
    const base = title.replace(/[\\/:*?"<>|]/g, '_').trim() || 'Document';
    return base.toLowerCase().endsWith('.docx') ? base : `${base}.docx`;
  }
}

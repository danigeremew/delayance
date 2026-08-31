import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import type { ProjectRole } from '@delayance/shared-types';
import { DatabaseService } from '../database/database.service';
import { projectSources, storedObjects } from '../database/schema';
import { JobsService, SOURCE_PROCESS_QUEUE } from '../jobs/jobs.service';
import { canEditContent } from '../rbac/roles';
import { StorageService } from '../storage/storage.service';
import { SearchService } from './search.service';
import { hashEmbed } from './embed.util';

@Injectable()
export class SourcesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly storage: StorageService,
    private readonly jobs: JobsService,
    private readonly searchService: SearchService,
  ) {}

  list(projectId: string) {
    return this.database.db
      .select()
      .from(projectSources)
      .where(eq(projectSources.projectId, projectId))
      .orderBy(desc(projectSources.createdAt));
  }

  async create(input: {
    projectId: string;
    userId: string;
    role: ProjectRole;
    title: string;
    sourceType: string;
    textContent?: string;
    fileId?: string;
    aiMayUse?: boolean;
  }) {
    if (!canEditContent(input.role)) throw new ForbiddenException();
    let text = input.textContent ?? '';
    const storedObjectId = input.fileId ?? null;
    let processStatus = 'ready';

    if (input.fileId) {
      const file = await this.database.db.query.storedObjects.findFirst({
        where: and(
          eq(storedObjects.id, input.fileId),
          eq(storedObjects.projectId, input.projectId),
        ),
      });
      if (!file) throw new NotFoundException('File not found');
      if (!text && file.contentType?.startsWith('text/')) {
        const buf = await this.storage.getObjectBuffer(file.objectKey);
        text = buf.toString('utf8');
      }
      processStatus = 'queued';
    } else if (text) {
      processStatus = 'queued';
    }

    const [row] = await this.database.db
      .insert(projectSources)
      .values({
        projectId: input.projectId,
        title: input.title,
        sourceType: input.sourceType,
        storedObjectId,
        textContent: text,
        aiMayUse: input.aiMayUse ?? true,
        processStatus,
        createdBy: input.userId,
      })
      .returning();

    if (row && processStatus === 'queued') {
      await this.jobs.createAndEnqueue({
        type: 'source.process',
        queue: SOURCE_PROCESS_QUEUE,
        projectId: input.projectId,
        userId: input.userId,
        payload: { sourceId: row.id },
      });
    }

    return row;
  }

  async update(
    projectId: string,
    sourceId: string,
    role: ProjectRole,
    input: { title?: string; outdated?: boolean; aiMayUse?: boolean; textContent?: string },
  ) {
    if (!canEditContent(role)) throw new ForbiddenException();
    const [row] = await this.database.db
      .update(projectSources)
      .set({
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.outdated !== undefined ? { outdated: input.outdated } : {}),
        ...(input.aiMayUse !== undefined ? { aiMayUse: input.aiMayUse } : {}),
        ...(input.textContent !== undefined ? { textContent: input.textContent } : {}),
      })
      .where(and(eq(projectSources.id, sourceId), eq(projectSources.projectId, projectId)))
      .returning();
    if (!row) throw new NotFoundException('Source not found');
    return row;
  }

  async search(projectId: string, q: string, semantic = false) {
    const result = await this.searchService.searchProject(projectId, q, { semantic });
    return {
      hits: result.hits,
      semantic: result.semantic,
      sources: result.hits
        .filter((h) => h.kind === 'source')
        .map((h) => ({
          id: h.id,
          title: h.title,
          textContent: h.snippet,
          sourceType: 'source',
          outdated: false,
          aiMayUse: true,
        })),
    };
  }

  /** Deterministic local embedding for v1 (32 dims) */
  static hashEmbed = hashEmbed;
}

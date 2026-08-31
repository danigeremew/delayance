import { Injectable, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { eq } from 'drizzle-orm';
import { AppConfigService } from '../config/app-config.service';
import { DatabaseService } from '../database/database.service';
import { backgroundJobs } from '../database/schema';

export const HEALTH_PING_QUEUE = 'health.ping';
export const DOCX_IMPORT_QUEUE = 'docx.import';
export const DOCX_EXPORT_QUEUE = 'docx.export';
export const PDF_EXPORT_QUEUE = 'pdf.export';
export const DOCUMENT_CLEANUP_QUEUE = 'document.cleanup';
export const SOURCE_PROCESS_QUEUE = 'source.process';
export const DOCUMENT_EXTRACT_QUEUE = 'document.extract';

@Injectable()
export class JobsService implements OnModuleDestroy {
  private readonly queues: Record<string, Queue>;

  constructor(
    private readonly config: AppConfigService,
    private readonly database: DatabaseService,
  ) {
    const connection = { url: config.env.REDIS_URL };
    this.queues = {
      [HEALTH_PING_QUEUE]: new Queue(HEALTH_PING_QUEUE, { connection }),
      [DOCX_IMPORT_QUEUE]: new Queue(DOCX_IMPORT_QUEUE, { connection }),
      [DOCX_EXPORT_QUEUE]: new Queue(DOCX_EXPORT_QUEUE, { connection }),
      [PDF_EXPORT_QUEUE]: new Queue(PDF_EXPORT_QUEUE, { connection }),
      [DOCUMENT_CLEANUP_QUEUE]: new Queue(DOCUMENT_CLEANUP_QUEUE, { connection }),
      [SOURCE_PROCESS_QUEUE]: new Queue(SOURCE_PROCESS_QUEUE, { connection }),
      [DOCUMENT_EXTRACT_QUEUE]: new Queue(DOCUMENT_EXTRACT_QUEUE, { connection }),
    };
  }

  async enqueuePing() {
    const job = await this.queues[HEALTH_PING_QUEUE]!.add(
      'ping',
      { sentAt: new Date().toISOString() },
      { removeOnComplete: 100, removeOnFail: 100 },
    );
    return { jobId: job.id, queue: HEALTH_PING_QUEUE };
  }

  async createAndEnqueue(input: {
    type: string;
    queue: string;
    projectId?: string | null;
    documentId?: string | null;
    userId?: string | null;
    payload: Record<string, unknown>;
  }) {
    const [row] = await this.database.db
      .insert(backgroundJobs)
      .values({
        type: input.type,
        projectId: input.projectId ?? null,
        documentId: input.documentId ?? null,
        status: 'queued',
        progress: 0,
        result: {},
        createdBy: input.userId ?? null,
      })
      .returning();
    if (!row) throw new Error('Failed to create job');

    const queue = this.queues[input.queue];
    if (!queue) throw new Error(`Unknown queue ${input.queue}`);

    await queue.add(
      input.type,
      { jobId: row.id, ...input.payload },
      { jobId: row.id, removeOnComplete: 100, removeOnFail: 100 },
    );

    return row;
  }

  async getJob(jobId: string) {
    const row = await this.database.db.query.backgroundJobs.findFirst({
      where: eq(backgroundJobs.id, jobId),
    });
    if (!row) throw new NotFoundException('Job not found');
    return row;
  }

  async onModuleDestroy() {
    await Promise.all(Object.values(this.queues).map((q) => q.close()));
  }
}

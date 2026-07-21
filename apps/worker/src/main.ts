import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { Worker } from 'bullmq';
import { Pool } from 'pg';
import {
  CreateBucketCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import { parseEnv } from '@delayance/validation';
import { exportDocx, importDocx, documentToPrintHtml } from '@delayance/docx-engine';
import type { Document } from '@delayance/document-model';

loadEnv({ path: resolve(__dirname, '../../../.env') });
loadEnv();

const env = parseEnv(process.env);
const pool = new Pool({ connectionString: env.DATABASE_URL });

const s3 = new S3Client({
  region: 'us-east-1',
  endpoint: `${env.MINIO_USE_SSL ? 'https' : 'http'}://${env.MINIO_ENDPOINT}:${env.MINIO_PORT}`,
  forcePathStyle: true,
  credentials: {
    accessKeyId: env.MINIO_ACCESS_KEY,
    secretAccessKey: env.MINIO_SECRET_KEY,
  },
});

async function ensureBucket() {
  try {
    await s3.send(new CreateBucketCommand({ Bucket: env.MINIO_BUCKET }));
  } catch {
    // exists
  }
}

async function getObject(key: string): Promise<Buffer> {
  const res = await s3.send(
    new GetObjectCommand({ Bucket: env.MINIO_BUCKET, Key: key }),
  );
  const bytes = await res.Body?.transformToByteArray();
  return Buffer.from(bytes ?? []);
}

async function putObject(key: string, body: Buffer, contentType: string) {
  await s3.send(
    new PutObjectCommand({
      Bucket: env.MINIO_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

async function updateJob(
  jobId: string,
  patch: {
    status?: string;
    progress?: number;
    result?: Record<string, unknown>;
    error?: string | null;
  },
) {
  const sets: string[] = [`updated_at = NOW()`];
  const values: unknown[] = [];
  let i = 1;
  if (patch.status !== undefined) {
    sets.push(`status = $${i++}::job_status`);
    values.push(patch.status);
  }
  if (patch.progress !== undefined) {
    sets.push(`progress = $${i++}`);
    values.push(patch.progress);
  }
  if (patch.result !== undefined) {
    sets.push(`result = $${i++}::jsonb`);
    values.push(JSON.stringify(patch.result));
  }
  if (patch.error !== undefined) {
    sets.push(`error = $${i++}`);
    values.push(patch.error);
  }
  values.push(jobId);
  await pool.query(
    `UPDATE background_jobs SET ${sets.join(', ')} WHERE id = $${i}`,
    values,
  );
}

function hashEmbed(text: string, dims = 32): number[] {
  const vec = new Array(dims).fill(0) as number[];
  for (let i = 0; i < text.length; i++) {
    const idx = text.charCodeAt(i) % dims;
    vec[idx] = (vec[idx] ?? 0) + 1;
  }
  const norm = Math.sqrt(vec.reduce((a, b) => a + b * b, 0)) || 1;
  return vec.map((v) => v / norm);
}

async function renderPdf(html: string): Promise<Buffer> {
  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true });
    await browser.close();
    return Buffer.from(pdf);
  } catch (err) {
    console.warn('[worker] Playwright unavailable, writing HTML fallback', err);
    return Buffer.from(html, 'utf8');
  }
}

const connection = { url: env.REDIS_URL };
const workers: Worker[] = [];

function makeWorker(
  queue: string,
  processor: (data: Record<string, unknown>) => Promise<unknown>,
) {
  const worker = new Worker(
    queue,
    async (job) => {
      const jobId = String(job.data.jobId ?? job.id);
      await updateJob(jobId, { status: 'running', progress: 5 });
      try {
        const result = await processor(job.data as Record<string, unknown>);
        await updateJob(jobId, {
          status: 'completed',
          progress: 100,
          result: (result as Record<string, unknown>) ?? {},
        });
        return result;
      } catch (err) {
        await updateJob(jobId, {
          status: 'failed',
          error: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    },
    { connection },
  );
  worker.on('ready', () => console.log(`[worker] listening on ${queue}`));
  worker.on('failed', (job, err) =>
    console.error(`[worker] ${queue} failed ${job?.id}`, err),
  );
  workers.push(worker);
}

async function main() {
  await ensureBucket();

  makeWorker('health.ping', async (data) => ({
    ok: true,
    processedAt: new Date().toISOString(),
    ...data,
  }));

  makeWorker('docx.import', async (data) => {
    const importId = String(data.importId);
    const objectKey = String(data.objectKey);
    const mode = (data.mode as 'preserve' | 'normalize') ?? 'normalize';
    const buf = await getObject(objectKey);
    const result = await importDocx(buf, { mode });
    await pool.query(
      `UPDATE document_imports
       SET status = 'preview_ready',
           style_map = $1::jsonb,
           report = $2::jsonb,
           preview_content = $3::jsonb
       WHERE id = $4`,
      [
        JSON.stringify(result.styleMap),
        JSON.stringify(result.compatibilityReport),
        JSON.stringify(result.document),
        importId,
      ],
    );
    return {
      importId,
      styleMap: result.styleMap,
      report: result.compatibilityReport,
    };
  });

  makeWorker('docx.export', async (data) => {
    const exportId = String(data.exportId);
    const content = data.content as Document;
    const title = String(data.title ?? 'document');
    const exported = await exportDocx(content, {
      includeTocField: true,
      includePageNumberFields: true,
    });
    const objectKey = `exports/${randomUUID()}-${title}.docx`;
    await putObject(
      objectKey,
      exported.buffer,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    const stored = await pool.query(
      `INSERT INTO stored_objects (bucket, object_key, content_type, size_bytes)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [
        env.MINIO_BUCKET,
        objectKey,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        exported.buffer.length,
      ],
    );
    const storedId = stored.rows[0]?.id as string;
    await pool.query(
      `UPDATE document_exports
       SET stored_object_id = $1, compatibility_report = $2::jsonb
       WHERE id = $3`,
      [storedId, JSON.stringify(exported.compatibilityReport), exportId],
    );
    return { exportId, storedObjectId: storedId, objectKey };
  });

  makeWorker('pdf.export', async (data) => {
    const exportId = String(data.exportId);
    const content = data.content as Document;
    const title = String(data.title ?? 'document');
    const html = documentToPrintHtml(content);
    const pdf = await renderPdf(html);
    const isPdf = pdf.slice(0, 4).toString() === '%PDF';
    const ext = isPdf ? 'pdf' : 'html';
    const contentType = isPdf ? 'application/pdf' : 'text/html';
    const objectKey = `exports/${randomUUID()}-${title}.${ext}`;
    await putObject(objectKey, pdf, contentType);
    const stored = await pool.query(
      `INSERT INTO stored_objects (bucket, object_key, content_type, size_bytes)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [env.MINIO_BUCKET, objectKey, contentType, pdf.length],
    );
    const storedId = stored.rows[0]?.id as string;
    await pool.query(`UPDATE document_exports SET stored_object_id = $1 WHERE id = $2`, [
      storedId,
      exportId,
    ]);
    return { exportId, storedObjectId: storedId, objectKey, format: ext };
  });

  makeWorker('document.cleanup', async (data) => ({
    note: 'cleanup runs synchronously via API; worker reserved',
    ...data,
  }));

  makeWorker('source.process', async (data) => {
    const sourceId = String(data.sourceId);
    await pool.query(
      `UPDATE project_sources SET process_status = 'running', process_error = NULL WHERE id = $1`,
      [sourceId],
    );
    const res = await pool.query(
      `SELECT id, title, text_content, stored_object_id, source_type FROM project_sources WHERE id = $1`,
      [sourceId],
    );
    const row = res.rows[0] as
      | {
          id: string;
          title: string;
          text_content: string;
          stored_object_id: string | null;
          source_type: string;
        }
      | undefined;
    if (!row) throw new Error('Source not found');

    try {
      let text = row.text_content ?? '';
      let warning: string | null = null;

      if (row.stored_object_id) {
        const obj = await pool.query(
          `SELECT object_key, content_type FROM stored_objects WHERE id = $1`,
          [row.stored_object_id],
        );
        const file = obj.rows[0] as
          | { object_key: string; content_type: string }
          | undefined;
        if (file) {
          const buf = await getObject(file.object_key);
          const key = file.object_key.toLowerCase();
          if (
            file.content_type?.includes('text') ||
            key.endsWith('.md') ||
            key.endsWith('.txt')
          ) {
            text = buf.toString('utf8');
          } else if (key.endsWith('.docx') || row.source_type === 'docx') {
            const { documentToPlainText } = await import('@delayance/docx-engine');
            const imported = await importDocx(buf, { mode: 'normalize' });
            text = documentToPlainText(imported.document);
          } else if (key.endsWith('.pdf') || row.source_type === 'pdf') {
            try {
              const pdfParse = (await import('pdf-parse')).default as (b: Buffer) => Promise<{
                text: string;
              }>;
              const parsed = await pdfParse(buf);
              text = parsed.text?.trim() || '';
              if (!text) warning = 'PDF had no extractable text';
            } catch (err) {
              warning = err instanceof Error ? err.message : 'PDF parse failed';
              text = text || `[pdf:${file.object_key}]`;
            }
          } else if (
            file.content_type?.startsWith('image/') ||
            row.source_type === 'image' ||
            /\.(png|jpe?g|gif|webp)$/i.test(key)
          ) {
            text = `[image:${file.object_key}; OCR not available in v1]`;
            warning = 'Image OCR deferred';
          } else if (!text) {
            text = `[binary:${file.object_key}]`;
            warning = 'Unsupported binary type';
          }
        }
      }

      if (!text.trim()) {
        warning = warning ?? 'Empty extraction';
      }

      const embedding = hashEmbed(`${row.title}\n${text}`);
      const literal = `[${embedding.join(',')}]`;
      await pool.query(
        `UPDATE project_sources
         SET text_content = $1,
             embedding = $2::vector,
             process_status = $3,
             process_error = $4
         WHERE id = $5`,
        [text, literal, warning ? 'ready_with_warnings' : 'ready', warning, sourceId],
      );
      return { sourceId, chars: text.length, warning };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await pool.query(
        `UPDATE project_sources SET process_status = 'failed', process_error = $1 WHERE id = $2`,
        [message, sourceId],
      );
      throw err;
    }
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

async function shutdown() {
  await Promise.all(workers.map((w) => w.close()));
  await pool.end();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

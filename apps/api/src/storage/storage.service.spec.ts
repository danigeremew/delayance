import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { envSchema } from '@delayance/validation';
import { StorageService } from './storage.service';
import { StorageController } from './storage.controller';
import { AppConfigService } from '../config/app-config.service';
import { DatabaseService } from '../database/database.service';

let directory: string;
let service: StorageService;
const values = vi.fn();

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'delayance-api-storage-'));
  const config: AppConfigService = {
    env: envSchema.parse({
      DATABASE_URL: 'postgresql://localhost/test',
      REDIS_URL: 'redis://localhost',
      SECRETS_ENCRYPTION_KEY: '0'.repeat(64),
      STORAGE_DIR: directory,
      API_PUBLIC_URL: 'http://localhost:48722',
    }),
  };
  values.mockReturnValue({ returning: async () => [{ id: 'obj-123' }] });
  // Only the insert chain is exercised; no database service is started in this unit test.
  const database = { db: { insert: () => ({ values }) } } as unknown as DatabaseService;
  service = new StorageService(config, database);
  await service.onModuleInit();
});
afterEach(async () => {
  vi.useRealTimers();
  await rm(directory, { recursive: true, force: true });
});

async function store() {
  await service.putObjectAtKey({
    objectKey: 'exports/test.docx',
    contentType: 'application/octet-stream',
    body: Buffer.from('document'),
  });
}
function query(url: string) {
  const params = new URL(url).searchParams;
  return [params.get('token')!, params.get('signature')!] as const;
}

describe('StorageService', () => {
  it('writes uploads and retains their metadata', async () => {
    expect(
      await service.putObject({
        keyPrefix: 'imports',
        filename: '../test.docx',
        contentType: 'application/octet-stream',
        body: Buffer.from('upload'),
        projectId: 'project',
        userId: 'user',
      }),
    ).toEqual({ id: 'obj-123' });
    const metadata = values.mock.calls[0]![0] as { objectKey: string };
    expect(metadata.objectKey).toMatch(/^imports\/[^/]+$/);
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        bucket: 'local',
        projectId: 'project',
        createdBy: 'user',
        sizeBytes: 6,
      }),
    );
    expect((await service.getObjectBuffer(metadata.objectKey)).toString()).toBe('upload');
  });

  it('issues a signed link and serves the same bytes as an attachment', async () => {
    await store();
    const url = await service.getSignedDownloadUrl('exports/test.docx');
    expect(url).toMatch(/^http:\/\/localhost:48722\/storage\/download\?/);
    const response = await new StorageController(service).download(...query(url));
    expect(response.getHeaders()).toMatchObject({
      type: 'application/octet-stream',
      length: 8,
      disposition: expect.stringContaining('attachment;'),
    });
    expect(response.getStream()).toBeDefined();
    expect(await service.download(...query(url))).toEqual({
      body: Buffer.from('document'),
      filename: 'test.docx',
    });
  });

  it('rejects missing, malformed, modified, and expired download capabilities', async () => {
    await store();
    const [token, signature] = query(await service.getSignedDownloadUrl('exports/test.docx', 1));
    await expect(service.download(token, '0'.repeat(64))).rejects.toMatchObject({ status: 403 });
    await expect(service.download(token + 'x', signature)).rejects.toMatchObject({ status: 403 });
    await expect(service.download('', '')).rejects.toMatchObject({ status: 403 });
    await expect(service.download(token, 'malformed')).rejects.toMatchObject({ status: 403 });
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 2000);
    await expect(service.download(token, signature)).rejects.toMatchObject({ status: 403 });
  });

  it('returns 404 for a valid link to a missing file', async () => {
    await expect(
      service.download(...query(await service.getSignedDownloadUrl('missing'))),
    ).rejects.toMatchObject({ status: 404 });
  });
});

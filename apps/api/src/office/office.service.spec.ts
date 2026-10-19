import { describe, expect, it, vi } from 'vitest';
import { OfficeService, type WopiSession } from './office.service';
import type { DatabaseService } from '../database/database.service';
import type { StorageService } from '../storage/storage.service';
import type { RedisService } from '../redis/redis.service';
import type { JobsService } from '../jobs/jobs.service';
import { envSchema, officeSessionRequestSchema } from '@delayance/validation';

const session: WopiSession = {
  documentId: 'document',
  projectId: 'project',
  userId: 'user',
  role: 'editor',
  permission: 'write',
};
function setup(enabled = true) {
  const values = vi.fn().mockResolvedValue(undefined);
  const insert = vi.fn().mockReturnValue({ values });
  const findFirst = vi.fn().mockResolvedValue({
    id: 'document',
    projectId: 'project',
    currentVersion: 3,
    fileHash: 'a'.repeat(64),
    fileKey: 'documents/document/files/hash.docx',
  });
  const service = new OfficeService(
    {
      env: envSchema.parse({
        DATABASE_URL: 'postgresql://localhost/test',
        REDIS_URL: 'redis://localhost',
        SECRETS_ENCRYPTION_KEY: '0'.repeat(64),
        OFFICE_ENABLED: String(enabled),
      }),
    },
    { db: { query: { documents: { findFirst } }, insert } } as unknown as DatabaseService,
    {} as StorageService,
    { client: { get: vi.fn().mockResolvedValue('writer-lock') } } as unknown as RedisService,
    {} as JobsService,
  );
  return { service, insert, values };
}
describe('Wordcraft sessions and save guards', () => {
  it('defaults to Wordcraft and rejects removed or unknown editors', () => {
    expect(officeSessionRequestSchema.parse({})).toEqual({ editor: 'wordcraft' });
    expect(officeSessionRequestSchema.parse({ editor: 'wordcraft' })).toEqual({
      editor: 'wordcraft',
    });
    expect(officeSessionRequestSchema.safeParse({ editor: 'unknown' }).success).toBe(false);
    expect(officeSessionRequestSchema.safeParse({ editor: 'collabora' }).success).toBe(false);
  });
  it('creates a scoped Wordcraft session without editor discovery', async () => {
    const { service, values } = setup();
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('Unexpected discovery'));
    try {
      const result = await service.createBrowserSession({
        projectId: 'project',
        documentId: 'document',
        userId: 'user',
        role: 'viewer',
      });
      expect(result).toMatchObject({
        actionUrl: 'http://localhost:48721/wordcraft/index.html',
        wopiSource: 'http://localhost:48722/wopi/files/document',
        permission: 'read',
      });
      expect(fetch).not.toHaveBeenCalled();
      expect(values).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user',
          documentId: 'document',
          permission: 'read',
          tokenHash: expect.any(String),
        }),
      );
      expect(values.mock.calls[0]![0].tokenHash).not.toBe(result.accessToken);
    } finally {
      fetch.mockRestore();
    }
  });
  it('rejects disabled editing before creating sessions', async () => {
    const { service, insert } = setup(false);
    await expect(
      service.createBrowserSession({
        projectId: 'project',
        documentId: 'document',
        userId: 'user',
        role: 'editor',
      }),
    ).rejects.toThrow('Document editing is disabled');
    expect(insert).not.toHaveBeenCalled();
  });
  it('rejects read-only saves before touching storage', async () => {
    const { service, insert } = setup();
    await expect(
      service.putFile({ ...session, permission: 'read' }, Buffer.from('docx'), 'writer-lock'),
    ).rejects.toThrow('Read-only');
    expect(insert).not.toHaveBeenCalled();
  });
  it('rejects stale snapshots and incompatible editor locks', async () => {
    const { service, insert } = setup();
    await expect(service.putFile(session, Buffer.from('docx'), 'other-lock')).rejects.toThrow();
    await expect(
      service.putFile(session, Buffer.from('docx'), 'writer-lock', `2:${'a'.repeat(64)}`),
    ).rejects.toThrow('saved document changed');
    expect(insert).not.toHaveBeenCalled();
  });
});

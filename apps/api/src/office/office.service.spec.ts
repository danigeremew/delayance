import { describe, expect, it, vi } from 'vitest';
import { OfficeService, type WopiSession } from './office.service';
import type { AppConfigService } from '../config/app-config.service';
import type { DatabaseService } from '../database/database.service';
import type { StorageService } from '../storage/storage.service';
import type { RedisService } from '../redis/redis.service';
import type { JobsService } from '../jobs/jobs.service';
import { officeSessionRequestSchema } from '@delayance/validation';

const session: WopiSession = {
  documentId: 'document',
  projectId: 'project',
  userId: 'user',
  role: 'editor',
  permission: 'write',
};
function setup() {
  const insert = vi.fn();
  const findFirst = vi
    .fn()
    .mockResolvedValue({
      id: 'document',
      projectId: 'project',
      currentVersion: 3,
      fileHash: 'a'.repeat(64),
    });
  const service = new OfficeService(
    {} as AppConfigService,
    { db: { query: { documents: { findFirst } }, insert } } as unknown as DatabaseService,
    {} as StorageService,
    { client: { get: vi.fn().mockResolvedValue('writer-lock') } } as unknown as RedisService,
    {} as JobsService,
  );
  return { service, insert };
}
describe('Office experiment session and save guards', () => {
  it('defaults existing clients to Collabora and accepts only the explicit experiment editor', () => {
    expect(officeSessionRequestSchema.parse({})).toEqual({ editor: 'collabora' });
    expect(officeSessionRequestSchema.parse({ editor: 'wordcraft' })).toEqual({
      editor: 'wordcraft',
    });
    expect(officeSessionRequestSchema.safeParse({ editor: 'unknown' }).success).toBe(false);
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

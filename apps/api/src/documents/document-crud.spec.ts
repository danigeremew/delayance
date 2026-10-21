import { describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { DocumentsService } from './documents.service';
import type { DatabaseService } from '../database/database.service';
import type { AuditService } from '../rbac/audit.service';
import type { TemplatesService } from '../templates/templates.service';
import type { StorageService } from '../storage/storage.service';
import type { JobsService } from '../jobs/jobs.service';
import { createDocumentSchema, updateDocumentMetaSchema } from '../common/dto';

function fixture(found = true) {
  const where = vi
    .fn()
    .mockReturnValue({ returning: vi.fn().mockResolvedValue(found ? [{ id: 'doc' }] : []) });
  const values = vi.fn().mockResolvedValue(undefined);
  const tx = {
    delete: vi.fn().mockReturnValue({ where }),
    insert: vi.fn().mockReturnValue({ values }),
  };
  const transaction = vi.fn().mockImplementation((run) => run(tx));
  const service = new DocumentsService(
    { db: { transaction } } as unknown as DatabaseService,
    {} as AuditService,
    {} as TemplatesService,
    {} as StorageService,
    {} as JobsService,
  );
  return { service, where, values, transaction };
}

describe('document CRUD boundaries', () => {
  it('validates and trims names for creation and rename', () => {
    for (const schema of [createDocumentSchema, updateDocumentMetaSchema]) {
      expect(schema.parse({ title: '  Draft  ' })).toMatchObject({ title: 'Draft' });
      expect(schema.safeParse({ title: '   ' }).success).toBe(false);
      expect(schema.safeParse({ title: 'x'.repeat(501) }).success).toBe(false);
    }
  });
  it('deletes only the requested project document and records the deletion in the same transaction', async () => {
    const f = fixture();
    expect(await f.service.remove('project', 'doc', 'owner', 'owner')).toEqual({ id: 'doc' });
    const query = new PgDialect().sqlToQuery(f.where.mock.calls[0]![0] as SQL);
    expect(query.params).toEqual(['doc', 'project']);
    expect(f.values).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'document.deleted',
        actorId: 'owner',
        entityId: 'doc',
        metadata: { projectId: 'project' },
      }),
    );
    expect(f.transaction).toHaveBeenCalledOnce();
  });
  it('rejects a missing or cross-project document without recording a deletion', async () => {
    const f = fixture(false);
    await expect(f.service.remove('other-project', 'doc', 'editor', 'editor')).rejects.toThrow(
      'Document not found',
    );
    expect(f.values).not.toHaveBeenCalled();
  });
  it('rejects deletion by contributors, reviewers, and viewers before querying the database', async () => {
    const f = fixture();
    for (const role of ['contributor', 'reviewer', 'viewer'] as const) {
      await expect(f.service.remove('project', 'doc', 'user', role)).rejects.toThrow(
        'Editor role required',
      );
    }
    expect(f.transaction).not.toHaveBeenCalled();
  });
  it('rejects malformed imports before creating an empty document', async () => {
    const f = fixture();
    const create = vi.spyOn(f.service, 'create');
    await expect(
      f.service.importOfficeFile('project', 'user', 'editor', {
        title: 'Bad upload',
        buffer: Buffer.from('not a docx'),
      }),
    ).rejects.toThrow('not a readable DOCX');
    expect(create).not.toHaveBeenCalled();
  });
});

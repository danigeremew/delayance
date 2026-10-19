import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectRole } from '@delayance/shared-types';
import type { DatabaseService } from '../database/database.service';
import type { DocumentsService } from '../documents/documents.service';
import type { OfficeService } from '../office/office.service';
import type { AiService } from './ai.service';
import { OfficeAiService } from './office-ai.service';

const hash = 'a'.repeat(64);
const extract = vi.hoisted(() => vi.fn());
vi.mock('@delayance/docx-engine', () => ({ extractDocumentAnalysis: extract }));

function setup() {
  const document = { title: 'Office document', fileHash: hash, currentVersion: 3 };
  const get = vi.fn().mockImplementation(async () => ({ ...document }));
  const completeStructured = vi
    .fn()
    .mockResolvedValue({ answer: 'Draft ready', text: 'New draft' });
  const values = vi.fn().mockImplementation((row) => ({
    returning: async () => [{ id: 'proposal', status: 'pending', ...row }],
  }));
  const insert = vi.fn().mockReturnValue({ values });
  const update = vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
  });
  const db = {
    insert,
    update,
    select: vi
      .fn()
      .mockReturnValue({ from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) }),
  };
  const revision = {
    type: 'office-text',
    action: 'insert',
    text: 'New draft',
    originalText: '',
    fileHash: hash,
    version: 3,
  };
  const proposal = { documentId: 'document', status: 'pending', ops: [revision] };
  const ai = {
    resolveProvider: vi
      .fn()
      .mockResolvedValue({ adapter: { completeStructured }, model: 'gemini-3.8-flash' }),
    resolveIntent: vi.fn().mockResolvedValue({ mode: 'write', needsClarification: false }),
    listChats: vi.fn().mockResolvedValue([{ id: 'chat' }]),
    createChat: vi.fn().mockResolvedValue({ id: 'chat' }),
    getProposal: vi.fn().mockResolvedValue(proposal),
  };
  const sessionForToken = vi
    .fn()
    .mockResolvedValue({ projectId: 'project', userId: 'user', permission: 'write' });
  const office = {
    download: vi.fn().mockImplementation(async () => ({
      file: Buffer.from('fixture'),
      fileHash: document.fileHash,
      version: document.currentVersion,
      title: document.title,
    })),
    sessionForToken,
  };
  const service = new OfficeAiService(
    { db } as unknown as DatabaseService,
    { get } as unknown as DocumentsService,
    office as unknown as OfficeService,
    ai as unknown as AiService,
  );
  const run = (
    mode: 'ask' | 'edit' | 'write' | 'review' | 'auto',
    role: ProjectRole = 'owner',
    selectedText = '',
  ) =>
    service.run('project', 'document', 'user', role, {
      mode,
      selectedText,
      instruction: 'Test instruction',
    });
  return {
    service,
    run,
    document,
    get,
    completeStructured,
    insert,
    values,
    update,
    revision,
    proposal,
    ai,
    sessionForToken,
  };
}

beforeEach(() =>
  extract.mockResolvedValue({ fileHash: hash, plainText: 'Text from saved Wordcraft DOCX' }),
);

describe('Wordcraft AI', () => {
  it('uses saved DOCX text and keeps Write pending without mutating document records', async () => {
    const fixture = setup();
    const result = await fixture.run('write');
    expect(result.externalProviderWarning).toBeNull();
    expect(fixture.completeStructured.mock.calls[0]?.[0][1].content).toContain(
      'Text from saved Wordcraft DOCX',
    );
    expect(result).toMatchObject({
      applied: false,
      proposal: {
        status: 'pending',
        ops: [{ type: 'office-text', action: 'insert', text: 'New draft' }],
      },
    });
    expect(fixture.update).not.toHaveBeenCalled();
  });

  it('uses a consistent file/version snapshot when autosave advances during intent classification', async () => {
    const fixture = setup();
    fixture.ai.resolveIntent.mockImplementation(async () => {
      fixture.document.currentVersion = 4;
      fixture.document.fileHash = 'b'.repeat(64);
      extract.mockResolvedValue({
        fileHash: fixture.document.fileHash,
        plainText: 'Latest saved text',
      });
      return { mode: 'write', needsClarification: false };
    });
    const result = await fixture.run('auto');
    expect(result.proposal).toMatchObject({ ops: [{ version: 4, fileHash: 'b'.repeat(64) }] });
    expect(fixture.completeStructured.mock.calls[0]?.[0][1].content).toContain('Latest saved text');
  });

  it('previews original and replacement text for Edit and requires a selection', async () => {
    const fixture = setup();
    await expect(fixture.run('edit')).rejects.toThrow('Select the text');
    expect((await fixture.run('edit', 'owner', 'Original selection')).proposal).toMatchObject({
      ops: [{ action: 'replace', originalText: 'Original selection' }],
    });
  });

  it.each(['ask', 'review'] as const)('%s cannot apply provider-supplied text', async (mode) => {
    expect((await setup().run(mode)).proposal).toMatchObject({ ops: [] });
  });

  it('enforces permissions after Auto resolves to a mutation or review', async () => {
    const fixture = setup();
    await expect(fixture.run('auto', 'viewer')).rejects.toThrow('Contributor');
    fixture.ai.resolveIntent.mockResolvedValue({ mode: 'review', needsClarification: false });
    await expect(fixture.run('auto', 'viewer')).rejects.toThrow('Reviewer');
    expect(fixture.completeStructured).not.toHaveBeenCalled();
  });

  it('rejects malformed provider output and surfaces safe provider errors', async () => {
    const fixture = setup();
    fixture.completeStructured.mockResolvedValue({ answer: 12, text: {} });
    await expect(fixture.run('write')).rejects.toThrow('invalid text proposal');
    fixture.completeStructured.mockRejectedValue(
      new Error('Gemini request failed (404). Choose another model.'),
    );
    await expect(fixture.run('write')).rejects.toThrow('Choose another model');
    expect(fixture.insert).not.toHaveBeenCalled();
  });

  it('rejects inconsistent snapshots and chats from other documents', async () => {
    const fixture = setup();
    extract.mockResolvedValue({ fileHash: 'b'.repeat(64), plainText: 'Changed' });
    await expect(fixture.run('write')).rejects.toThrow('document changed');
    fixture.ai.listChats.mockResolvedValue([]);
    await expect(
      fixture.service.run('project', 'document', 'user', 'owner', {
        mode: 'ask',
        selectedText: '',
        instruction: 'Question',
        chatId: 'other-chat',
      }),
    ).rejects.toThrow('Chat not found');
  });

  it('requires the same user and a writable WOPI session before accepting', async () => {
    const fixture = setup();
    fixture.sessionForToken.mockResolvedValue({
      projectId: 'project',
      userId: 'other-user',
      permission: 'write',
    });
    await expect(
      fixture.service.authorize('project', 'proposal', 'user', 'owner', 'token'),
    ).rejects.toThrow('writable editor session');
    fixture.sessionForToken.mockResolvedValue({
      projectId: 'project',
      userId: 'user',
      permission: 'read',
    });
    await expect(
      fixture.service.authorize('project', 'proposal', 'user', 'owner', 'token'),
    ).rejects.toThrow('writable editor session');
    expect(fixture.update).not.toHaveBeenCalled();
  });

  it('rejects stale proposals and marks accepted only after saved text is verified', async () => {
    const fixture = setup();
    expect(
      await fixture.service.authorize('project', 'proposal', 'user', 'owner', 'token'),
    ).toEqual(fixture.revision);
    await expect(
      fixture.service.authorize('project', 'proposal', 'user', 'owner', 'token', true),
    ).rejects.toThrow('not saved');
    fixture.document.currentVersion = 4;
    fixture.document.fileHash = 'b'.repeat(64);
    await expect(
      fixture.service.authorize('project', 'proposal', 'user', 'owner', 'token'),
    ).rejects.toThrow('Document changed');
    extract.mockResolvedValue({
      fileHash: fixture.document.fileHash,
      plainText: 'Unrelated change',
    });
    await expect(
      fixture.service.authorize('project', 'proposal', 'user', 'owner', 'token', true),
    ).rejects.toThrow('does not contain');
    extract.mockResolvedValue({ fileHash: fixture.document.fileHash, plainText: 'New draft' });
    expect(
      await fixture.service.authorize('project', 'proposal', 'user', 'owner', 'token', true),
    ).toEqual({ ok: true });
    expect(fixture.update).toHaveBeenCalledOnce();
  });
});

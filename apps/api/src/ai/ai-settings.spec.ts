import { describe, expect, it, vi } from 'vitest';
import { AiService } from './ai.service';
import { AppConfigService } from '../config/app-config.service';
import { DatabaseService } from '../database/database.service';
import { DocumentsService } from '../documents/documents.service';
import { createProjectSchema } from '../common/dto';
import { aiSettingsSchema } from '@delayance/validation';
import { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { decryptSecret, encryptSecret } from '../crypto/secrets';

type Settings = {
  provider: string;
  model: string;
  policy: 'any' | 'local_only';
  encryptedApiKey: string | null;
};
const encryptionKey = 'a'.repeat(64);
function setup(row?: Settings, key = 'server-key', accountKeys = new Map<string, string | null>()) {
  const dialect = new PgDialect();
  const userIdFrom = (where: SQL) => String(dialect.sqlToQuery(where).params[0]);
  let currentRow = row;
  const findFirst = vi.fn().mockImplementation(() => Promise.resolve(currentRow));
  const insert = vi.fn().mockReturnValue({
    values: vi.fn().mockImplementation((_val) => ({
      onConflictDoUpdate: vi.fn().mockImplementation(({ set }) => {
        currentRow = {
          provider: set.provider,
          model: set.model,
          policy: set.policy,
          encryptedApiKey:
            set.encryptedApiKey instanceof SQL
              ? currentRow?.provider === 'gemini'
                ? currentRow.encryptedApiKey
                : null
              : set.encryptedApiKey,
        };
        return Promise.resolve();
      }),
    })),
  });
  const service = new AiService(
    {
      db: {
        query: {
          projectAiSettings: { findFirst },
          users: {
            findFirst: vi.fn().mockImplementation(({ where }) =>
              Promise.resolve({
                encryptedGeminiApiKey: accountKeys.get(userIdFrom(where)) ?? null,
              }),
            ),
          },
        },
        insert,
        update: vi.fn().mockReturnValue({
          set: (values: { encryptedGeminiApiKey: string | null }) => ({
            where: (where: SQL) => {
              accountKeys.set(userIdFrom(where), values.encryptedGeminiApiKey);
              return Promise.resolve();
            },
          }),
        }),
      },
    } as unknown as DatabaseService,
    {
      env: {
        GEMINI_API_KEY: key,
        GEMINI_MODEL: 'gemini-2.5-flash',
        SECRETS_ENCRYPTION_KEY: encryptionKey,
      },
    } as unknown as AppConfigService,
    {} as DocumentsService,
  );
  return service;
}

describe('Gemini project settings', () => {
  it('creates projects without AI setup and rejects old provider payloads', () => {
    expect(createProjectSchema.parse({ name: 'New project' })).toEqual({
      name: 'New project',
      description: '',
    });
    expect(
      createProjectSchema.safeParse({
        name: 'New project',
        ai: { provider: 'ollama', model: 'llama3.2' },
      }).success,
    ).toBe(false);
  });
  it('rejects other providers, endpoints and models in settings', () => {
    for (const input of [
      { provider: 'openai' },
      { baseUrl: 'https://example.test' },
      { model: 'llama3.2' },
    ]) {
      expect(aiSettingsSchema.safeParse(input).success).toBe(false);
    }
    expect(
      aiSettingsSchema.safeParse({ provider: 'gemini', model: 'gemini-2.5-pro' }).success,
    ).toBe(true);
  });
  it('uses server defaults without exposing the key', async () => {
    expect(await setup().getSettings('project')).toEqual({
      projectId: 'project',
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      policy: 'any',
      baseUrl: null,
      hasApiKey: true,
      hasCustomApiKey: false,
      hasAccountApiKey: false,
      keySource: 'server',
    });
  });
  it('ignores legacy models and credentials, preserving local-only policy', async () => {
    const service = setup(
      {
        provider: 'ollama',
        model: 'llama3.2',
        policy: 'local_only',
        encryptedApiKey: 'legacy-key',
      },
      '',
    );
    expect(await service.getSettings('project')).toMatchObject({
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      policy: 'local_only',
      hasApiKey: false,
    });
    await expect(service['resolveProvider']('project')).rejects.toThrow('local AI only');
  });
  it('resolves legacy external projects through Gemini using the server key', async () => {
    const service = setup({
      provider: 'openai',
      model: 'gpt-4o',
      policy: 'any',
      encryptedApiKey: 'invalid-old-key',
    });
    expect(await service['resolveProvider']('project')).toMatchObject({
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      external: true,
    });
  });
  it('fails clearly when no Gemini key is configured', async () => {
    await expect(setup(undefined, '')['resolveProvider']('project')).rejects.toThrow(
      'Set GEMINI_API_KEY',
    );
  });
  it('supports an encrypted project Gemini key without a server key', async () => {
    const service = setup(
      {
        provider: 'gemini',
        model: 'gemini-2.5-pro',
        policy: 'any',
        encryptedApiKey: encryptSecret('project-key', encryptionKey),
      },
      '',
    );
    expect(await service['resolveProvider']('project')).toMatchObject({
      provider: 'gemini',
      model: 'gemini-2.5-pro',
    });
    expect(await service.getSettings('project')).toMatchObject({
      hasApiKey: true,
      hasCustomApiKey: true,
    });
  });
  it('persists an encrypted account key across projects and service reloads, isolated by user', async () => {
    const keys = new Map<string, string | null>();
    const service = setup(undefined, '', keys);
    const saved = await service.putSettings(
      'first-project',
      {
        apiKey: 'personal-test-key',
        apiKeyScope: 'account',
      },
      'writer',
    );
    expect(saved).toMatchObject({
      hasApiKey: true,
      hasAccountApiKey: true,
      hasCustomApiKey: false,
      keySource: 'account',
    });
    expect(JSON.stringify(saved)).not.toContain('personal-test-key');
    expect(keys.get('writer')).not.toBe('personal-test-key');
    expect(decryptSecret(keys.get('writer')!, encryptionKey)).toBe('personal-test-key');

    const reloaded = setup(undefined, '', keys);
    expect(await reloaded.getSettings('another-project', 'writer')).toMatchObject({
      hasApiKey: true,
      keySource: 'account',
    });
    await expect(reloaded.resolveProvider('another-project', 'writer')).resolves.toMatchObject({
      provider: 'gemini',
    });
    expect(await reloaded.getSettings('another-project', 'other-user')).toMatchObject({
      hasApiKey: false,
    });
    await expect(reloaded.resolveProvider('another-project', 'other-user')).rejects.toThrow(
      'Set GEMINI_API_KEY',
    );
    await reloaded.putSettings('another-project', { model: 'gemini-3.8-flash' }, 'writer');
    expect(await reloaded.getSettings('first-project', 'writer')).toMatchObject({
      hasAccountApiKey: true,
    });
    await reloaded.putSettings(
      'another-project',
      { apiKey: null, apiKeyScope: 'account' },
      'writer',
    );
    expect(await service.getSettings('first-project', 'writer')).toMatchObject({
      hasApiKey: false,
    });
  });

  it('preserves project keys on model-only saves and blocks account keys under local-only policy', async () => {
    const row: Settings = {
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      policy: 'local_only',
      encryptedApiKey: encryptSecret('project-key', encryptionKey),
    };
    const service = setup(
      row,
      '',
      new Map([['writer', encryptSecret('account-key', encryptionKey)]]),
    );
    await service.putSettings('project', { model: 'gemini-3.8-flash' }, 'writer');
    expect(await service.getSettings('project', 'writer')).toMatchObject({
      hasAccountApiKey: true,
      hasCustomApiKey: true,
    });
    await expect(service.resolveProvider('project', 'writer')).rejects.toThrow('local AI only');
    await service.putSettings('project', { apiKey: null, apiKeyScope: 'account' }, 'writer');
    expect(await service.getSettings('project', 'writer')).toMatchObject({
      keySource: 'project',
      hasCustomApiKey: true,
      hasAccountApiKey: false,
    });
    await expect(
      service.putSettings('project', { apiKey: 'key', apiKeyScope: 'account' }),
    ).rejects.toThrow('authenticated account');
  });

  it('validates settings before persistence', async () => {
    await expect(setup().putSettings('project', { provider: 'openai' })).rejects.toThrow(
      'Invalid Gemini settings',
    );
  });
  it('saves and encrypts a project Gemini key, verifies AI completes with that key, and clears key when null', async () => {
    const service = setup(undefined, '');
    // Initially no server key and no project key
    expect(await service.getSettings('project')).toMatchObject({
      hasApiKey: false,
      hasCustomApiKey: false,
    });
    await expect(service['resolveProvider']('project')).rejects.toThrow('Set GEMINI_API_KEY');

    // Save custom key
    const updated = await service.putSettings('project', {
      apiKey: 'custom-user-gemini-key',
      model: 'gemini-2.5-flash',
    });
    expect(updated).toMatchObject({
      hasApiKey: true,
      hasCustomApiKey: true,
      model: 'gemini-2.5-flash',
    });
    // Plaintext key is never returned
    expect(updated).not.toHaveProperty('apiKey');
    expect(updated).not.toHaveProperty('encryptedApiKey');

    // Resolve provider succeeds and adapter uses decrypted custom key
    const resolved = await service['resolveProvider']('project');
    expect(resolved.model).toBe('gemini-2.5-flash');
    expect(resolved.provider).toBe('gemini');

    // Mock Gemini API endpoint to verify AI works with configured key
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        candidates: [
          { content: { parts: [{ text: 'Here is AI generated text' }] }, finishReason: 'STOP' },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await resolved.adapter.complete([{ role: 'user', content: 'Draft a summary' }], {
      model: 'gemini-2.5-flash',
    });
    expect(result).toBe('Here is AI generated text');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-goog-api-key': 'custom-user-gemini-key',
        }),
      }),
    );
    vi.unstubAllGlobals();

    // Clear the custom key
    const cleared = await service.putSettings('project', { apiKey: null });
    expect(cleared).toMatchObject({
      hasApiKey: false,
      hasCustomApiKey: false,
    });
    await expect(service['resolveProvider']('project')).rejects.toThrow('Set GEMINI_API_KEY');
  });
});

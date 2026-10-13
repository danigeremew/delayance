import { describe, expect, it, vi } from 'vitest';
import { AiService } from './ai.service';
import { AppConfigService } from '../config/app-config.service';
import { DatabaseService } from '../database/database.service';
import { DocumentsService } from '../documents/documents.service';
import { createProjectSchema } from '../common/dto';
import { aiSettingsSchema } from '@delayance/validation';
import { encryptSecret } from '../crypto/secrets';

type Settings = {
  provider: string;
  model: string;
  policy: 'any' | 'local_only';
  encryptedApiKey: string | null;
};
const encryptionKey = 'a'.repeat(64);
function setup(row?: Settings, key = 'server-key') {
  let currentRow = row;
  const findFirst = vi.fn().mockImplementation(() => Promise.resolve(currentRow));
  const insert = vi.fn().mockReturnValue({
    values: vi.fn().mockImplementation((_val) => ({
      onConflictDoUpdate: vi.fn().mockImplementation(({ set }) => {
        currentRow = {
          provider: set.provider,
          model: set.model,
          policy: set.policy,
          encryptedApiKey: set.encryptedApiKey,
        };
        return Promise.resolve();
      }),
    })),
  });
  const service = new AiService(
    { db: { query: { projectAiSettings: { findFirst } }, insert } } as unknown as DatabaseService,
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

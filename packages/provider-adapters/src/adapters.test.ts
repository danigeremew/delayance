import { describe, expect, it, vi } from 'vitest';
import { OpenAICompatibleAdapter } from './index';

describe('OpenAICompatibleAdapter', () => {
  it('parses structured JSON from completions', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"answer":"hi","ops":[]}' } }],
        }),
      })),
    );

    const adapter = new OpenAICompatibleAdapter('http://example.test/v1', 'key');
    const result = await adapter.completeStructured(
      [{ role: 'user', content: 'hi' }],
      { model: 'test', schemaHint: '{}' },
    );
    expect(result).toEqual({ answer: 'hi', ops: [] });
    vi.unstubAllGlobals();
  });
});

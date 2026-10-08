import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProvider, GeminiAdapter } from './index';

const messages = [{ role: 'user' as const, content: 'Hello' }];
const options = { model: 'gemini-2.5-flash' };
const reply = (text: string) => ({
  candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }],
});
afterEach(() => vi.unstubAllGlobals());

describe('GeminiAdapter', () => {
  it('maps system instructions and conversation roles to the native Gemini API', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json(reply('Hello back')));
    vi.stubGlobal('fetch', fetch);
    const adapter = new GeminiAdapter('test-key');
    expect(
      await adapter.complete(
        [
          { role: 'system', content: 'Be concise' },
          ...messages,
          { role: 'assistant', content: 'Previous reply' },
        ],
        options,
      ),
    ).toBe('Hello back');
    expect(fetch).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
      expect.objectContaining({
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': 'test-key' },
      }),
    );
    expect(JSON.parse(fetch.mock.calls[0]![1].body)).toMatchObject({
      systemInstruction: { parts: [{ text: 'Be concise' }] },
      contents: [
        { role: 'user', parts: [{ text: 'Hello' }] },
        { role: 'model', parts: [{ text: 'Previous reply' }] },
      ],
    });
  });

  it('requests JSON and returns a structured proposal', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json(reply('{"answer":"hi","ops":[]}')));
    vi.stubGlobal('fetch', fetch);
    expect(
      await new GeminiAdapter('key').completeStructured(messages, { ...options, schemaHint: '{}' }),
    ).toEqual({ answer: 'hi', ops: [] });
    expect(JSON.parse(fetch.mock.calls[0]![1].body).generationConfig.responseMimeType).toBe(
      'application/json',
    );
  });

  it.each([
    [{ candidates: [{ content: { parts: [{ text: 42 }] } }] }, 'Invalid Gemini response'],
    [{ promptFeedback: { blockReason: 'SAFETY' } }, 'blocked'],
    [{ candidates: [{ finishReason: 'MAX_TOKENS' }] }, 'did not complete'],
    [{}, 'no text'],
  ])('rejects malformed, blocked, incomplete or empty results', async (body, error) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body)));
    await expect(new GeminiAdapter('key').complete(messages, options)).rejects.toThrow(error);
  });

  it('does not expose provider error bodies or malformed JSON text', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('secret prompt and key', { status: 429 }));
    vi.stubGlobal('fetch', fetch);
    await expect(new GeminiAdapter('key').complete(messages, options)).rejects.toThrow(
      'Gemini request failed (429)',
    );
    fetch.mockResolvedValue(Response.json(reply('secret prompt')));
    await expect(
      new GeminiAdapter('key').completeStructured(messages, { ...options, schemaHint: '{}' }),
    ).rejects.toThrow('Gemini returned invalid JSON');
  });

  it('streams split SSE events, ignores thoughts and handles a final event without a delimiter', async () => {
    const first = {
      candidates: [
        { content: { parts: [{ text: 'private', thought: true }, { text: 'Hello ' }] } },
      ],
    };
    const data = `: comment\r\n\r\ndata: ${JSON.stringify(first)}\r\n\r\ndata: ${JSON.stringify(reply('world'))}`;
    const encoded = new TextEncoder().encode(data);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < encoded.length; i += 7) controller.enqueue(encoded.slice(i, i + 7));
        controller.close();
      },
    });
    const fetch = vi.fn().mockResolvedValue(new Response(body));
    vi.stubGlobal('fetch', fetch);
    const chunks: string[] = [];
    for await (const chunk of new GeminiAdapter('key').stream(messages, options))
      chunks.push(chunk);
    expect(chunks).toEqual(['Hello ', 'world']);
    expect(fetch.mock.calls[0]![0]).toContain(':streamGenerateContent?alt=sse');
  });

  it('rejects other providers, missing keys and non-Gemini model IDs before making requests', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    for (const provider of ['openai', 'ollama', 'openai-compatible', 'anthropic', 'openrouter']) {
      expect(() => createProvider({ provider, apiKey: 'key' })).toThrow('Only Gemini');
    }
    expect(() => createProvider({ provider: 'gemini' })).toThrow('API key required');
    await expect(
      new GeminiAdapter('key').complete(messages, { model: '../other' }),
    ).rejects.toThrow('Gemini model ID');
    expect(fetch).not.toHaveBeenCalled();
  });
});

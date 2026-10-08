import type {
  AiProvider,
  CompleteOptions,
  LlmMessage,
  StructuredCompleteOptions,
} from '@delayance/ai-core';
import { z } from 'zod';

const responseSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z
          .object({
            parts: z.array(
              z.object({ text: z.string().optional(), thought: z.boolean().optional() }),
            ),
          })
          .optional(),
        finishReason: z.string().optional(),
      }),
    )
    .optional(),
  promptFeedback: z.object({ blockReason: z.string().optional() }).optional(),
});

function responseText(value: unknown): string {
  const parsed = responseSchema.safeParse(value);
  if (!parsed.success) throw new Error('Invalid Gemini response');
  const data = parsed.data;
  const candidate = data.candidates?.[0];
  if (data.promptFeedback?.blockReason) throw new Error('Gemini blocked the request');
  if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
    throw new Error('Gemini did not complete the response; try a shorter request');
  }
  return (
    candidate?.content?.parts
      .filter((part) => !part.thought)
      .map((part) => part.text ?? '')
      .join('') ?? ''
  );
}

export class GeminiAdapter implements AiProvider {
  readonly name = 'gemini';
  readonly isLocal = false;

  constructor(private readonly apiKey: string) {
    if (!apiKey.trim()) throw new Error('Gemini API key required');
  }

  private async request(
    messages: LlmMessage[],
    options: CompleteOptions,
    stream = false,
    structured = false,
  ) {
    if (!/^gemini-[a-zA-Z0-9._-]+$/.test(options.model)) {
      throw new Error('Use a Gemini model ID');
    }
    const system = messages.filter((message) => message.role === 'system');
    const method = stream ? 'streamGenerateContent?alt=sse' : 'generateContent';
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${options.model}:${method}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
        body: JSON.stringify({
          ...(system.length
            ? { systemInstruction: { parts: system.map((message) => ({ text: message.content })) } }
            : {}),
          contents: messages
            .filter((message) => message.role !== 'system')
            .map((message) => ({
              role: message.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: message.content }],
            })),
          generationConfig: {
            temperature: options.temperature ?? 0.2,
            maxOutputTokens: options.maxTokens ?? 8192,
            ...(structured ? { responseMimeType: 'application/json' } : {}),
          },
        }),
        signal: AbortSignal.timeout(120_000),
      },
    ).catch(() => {
      throw new Error('Could not reach Gemini');
    });
    // Provider error bodies can contain submitted content; never expose them.
    if (!response.ok) throw new Error(`Gemini request failed (${response.status})`);
    return response;
  }

  async complete(messages: LlmMessage[], options: CompleteOptions): Promise<string> {
    const response = await this.request(messages, options);
    const text = responseText(await response.json());
    if (!text.trim()) throw new Error('Gemini returned no text');
    return text;
  }

  async completeStructured(
    messages: LlmMessage[],
    options: StructuredCompleteOptions,
  ): Promise<unknown> {
    const response = await this.request(
      [
        ...messages,
        { role: 'user', content: `Respond with JSON only matching: ${options.schemaHint}` },
      ],
      options,
      false,
      true,
    );
    const text = responseText(await response.json());
    try {
      return JSON.parse(text);
    } catch {
      throw new Error('Gemini returned invalid JSON');
    }
  }

  async *stream(messages: LlmMessage[], options: CompleteOptions): AsyncIterable<string> {
    const response = await this.request(messages, options, true);
    if (!response.body) throw new Error('Gemini stream response had no body');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let hasText = false;
    function parseEvent(event: string) {
      const payload = event
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .join('\n');
      if (!payload) return '';
      let value: unknown;
      try {
        value = JSON.parse(payload);
      } catch {
        throw new Error('Invalid Gemini stream response');
      }
      return responseText(value);
    }
    try {
      while (true) {
        const { done, value } = await reader.read();
        buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
        let boundary: RegExpExecArray | null;
        while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
          const event = buffer.slice(0, boundary.index);
          buffer = buffer.slice(boundary.index + boundary[0].length);
          const text = parseEvent(event);
          if (text) {
            hasText = true;
            yield text;
          }
        }
        if (done) break;
      }
      if (buffer.trim()) {
        const text = parseEvent(buffer);
        if (text) {
          hasText = true;
          yield text;
        }
      }
      if (!hasText) throw new Error('Gemini returned no text');
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }
}

export function createProvider(input: { provider: string; apiKey?: string | null }): AiProvider {
  if (input.provider !== 'gemini') throw new Error('Only Gemini is supported');
  if (!input.apiKey) throw new Error('Gemini API key required');
  return new GeminiAdapter(input.apiKey);
}

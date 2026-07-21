import type {
  AiProvider,
  CompleteOptions,
  LlmMessage,
  StructuredCompleteOptions,
} from '@delayance/ai-core';

const DEFAULT_OLLAMA_BASE = 'http://127.0.0.1:11434/v1';

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced?.[1]?.trim() ?? text.trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return JSON.parse(raw.slice(start, end + 1));
  }
  return JSON.parse(raw);
}

async function chatCompletions(
  baseUrl: string,
  apiKey: string | undefined,
  messages: LlmMessage[],
  options: CompleteOptions,
): Promise<string> {
  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: options.model,
      temperature: options.temperature ?? 0.2,
      max_tokens: options.maxTokens ?? 2048,
      messages,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LLM request failed (${res.status}): ${body.slice(0, 400)}`);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return data.choices?.[0]?.message?.content ?? '';
}

async function* streamChatCompletions(
  baseUrl: string,
  apiKey: string | undefined,
  messages: LlmMessage[],
  options: CompleteOptions,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: options.model,
      temperature: options.temperature ?? 0.2,
      max_tokens: options.maxTokens ?? 2048,
      stream: true,
      messages,
    }),
    signal,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LLM request failed (${res.status}): ${body.slice(0, 400)}`);
  }
  if (!res.body) {
    throw new Error('LLM stream response had no body');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(':')) continue;
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === '[DONE]') return;
      try {
        const parsed = JSON.parse(payload) as {
          choices?: { delta?: { content?: string }; message?: { content?: string } }[];
        };
        const delta =
          parsed.choices?.[0]?.delta?.content ??
          parsed.choices?.[0]?.message?.content ??
          '';
        if (delta) yield delta;
      } catch {
        // skip malformed SSE chunks
      }
    }
  }
}

export class OpenAICompatibleAdapter implements AiProvider {
  readonly name: string;
  readonly isLocal: boolean;

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string | undefined,
    opts?: { name?: string; isLocal?: boolean },
  ) {
    this.name = opts?.name ?? 'openai-compatible';
    this.isLocal = opts?.isLocal ?? false;
  }

  complete(messages: LlmMessage[], options: CompleteOptions) {
    return chatCompletions(this.baseUrl, this.apiKey, messages, options);
  }

  async *stream(
    messages: LlmMessage[],
    options: CompleteOptions,
  ): AsyncIterable<string> {
    yield* streamChatCompletions(this.baseUrl, this.apiKey, messages, options);
  }

  async completeStructured(
    messages: LlmMessage[],
    options: StructuredCompleteOptions,
  ) {
    const withHint: LlmMessage[] = [
      ...messages,
      {
        role: 'user',
        content: `Respond with JSON only matching: ${options.schemaHint}`,
      },
    ];
    const text = await this.complete(withHint, options);
    return extractJson(text);
  }
}

export class OpenAIAdapter extends OpenAICompatibleAdapter {
  constructor(apiKey: string, baseUrl = 'https://api.openai.com/v1') {
    super(baseUrl, apiKey, { name: 'openai', isLocal: false });
  }
}

export class OllamaAdapter extends OpenAICompatibleAdapter {
  constructor(baseUrl = DEFAULT_OLLAMA_BASE) {
    super(baseUrl, undefined, { name: 'ollama', isLocal: true });
  }
}

export class AnthropicAdapter implements AiProvider {
  readonly name = 'anthropic';
  readonly isLocal = false;
  complete(): Promise<string> {
    return Promise.reject(new Error('Anthropic adapter not configured in v1'));
  }
  completeStructured(): Promise<unknown> {
    return Promise.reject(new Error('Anthropic adapter not configured in v1'));
  }
}

export class GeminiAdapter implements AiProvider {
  readonly name = 'gemini';
  readonly isLocal = false;
  complete(): Promise<string> {
    return Promise.reject(new Error('Gemini adapter not configured in v1'));
  }
  completeStructured(): Promise<unknown> {
    return Promise.reject(new Error('Gemini adapter not configured in v1'));
  }
}

export class OpenRouterAdapter extends OpenAICompatibleAdapter {
  constructor(apiKey: string) {
    super('https://openrouter.ai/api/v1', apiKey, {
      name: 'openrouter',
      isLocal: false,
    });
  }
}

/** Strip OpenAI-compatible `/v1` suffix to get the Ollama native root. */
export function ollamaNativeBase(baseUrl?: string | null): string {
  const raw = (baseUrl?.trim() || DEFAULT_OLLAMA_BASE).replace(/\/$/, '');
  return raw.replace(/\/v1$/i, '');
}

export interface OllamaModelInfo {
  name: string;
  size: number;
  modifiedAt: string | null;
}

/** List models installed in the local Ollama instance (`GET /api/tags`). */
export async function listOllamaModels(
  baseUrl?: string | null,
): Promise<OllamaModelInfo[]> {
  const root = ollamaNativeBase(baseUrl);
  const res = await fetch(`${root}/api/tags`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(
      `Could not reach Ollama at ${root} (${res.status})${body ? `: ${body.slice(0, 200)}` : ''}`,
    );
  }
  const data = (await res.json()) as {
    models?: { name?: string; size?: number; modified_at?: string }[];
  };
  return (data.models ?? [])
    .map((m) => ({
      name: m.name ?? '',
      size: m.size ?? 0,
      modifiedAt: m.modified_at ?? null,
    }))
    .filter((m) => m.name)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function createProvider(input: {
  provider: string;
  apiKey?: string | null;
  baseUrl?: string | null;
}): AiProvider {
  switch (input.provider) {
    case 'openai':
      if (!input.apiKey) throw new Error('OpenAI API key required');
      return new OpenAIAdapter(input.apiKey, input.baseUrl ?? undefined);
    case 'ollama':
      return new OllamaAdapter(input.baseUrl ?? undefined);
    case 'openai-compatible':
      return new OpenAICompatibleAdapter(input.baseUrl ?? 'http://127.0.0.1:1234/v1', input.apiKey ?? undefined, {
        name: 'openai-compatible',
        isLocal: true,
      });
    case 'anthropic':
      return new AnthropicAdapter();
    case 'gemini':
      return new GeminiAdapter();
    case 'openrouter':
      if (!input.apiKey) throw new Error('OpenRouter API key required');
      return new OpenRouterAdapter(input.apiKey);
    default:
      throw new Error(`Unknown provider: ${input.provider}`);
  }
}

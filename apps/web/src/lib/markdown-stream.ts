import { generateNodeId } from '@delayance/document-model';
import type { JSONContent } from '@tiptap/core';

/** Parse markdown-ish text into TipTap block nodes (headings + paragraphs). */
export function markdownToTiptapBlocks(markdown: string): JSONContent[] {
  const text = markdown.replace(/\r\n/g, '\n');
  if (!text.trim()) {
    return [
      {
        type: 'paragraph',
        attrs: { id: generateNodeId() },
        content: [],
      },
    ];
  }

  const blocks: JSONContent[] = [];
  // Split on blank lines but keep a trailing incomplete block
  const parts = text.split(/\n{2,}/);

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i] ?? '';
    const isLast = i === parts.length - 1;
    const lines = part.split('\n');
    const first = (lines[0] ?? '').trimEnd();
    const headingMatch = /^(#{1,6})\s+(.*)$/.exec(first.trim());

    if (headingMatch && (lines.length === 1 || lines.slice(1).every((l) => !l.trim()))) {
      const level = Math.min(6, (headingMatch[1] ?? '#').length);
      const title = headingMatch[2] ?? '';
      blocks.push({
        type: 'heading',
        attrs: { level, id: generateNodeId() },
        content: title ? [{ type: 'text', text: title }] : [],
      });
      continue;
    }

    if (headingMatch) {
      const level = Math.min(6, (headingMatch[1] ?? '#').length);
      const title = headingMatch[2] ?? '';
      blocks.push({
        type: 'heading',
        attrs: { level, id: generateNodeId() },
        content: title ? [{ type: 'text', text: title }] : [],
      });
      const rest = lines.slice(1).join('\n').trim();
      if (rest) {
        blocks.push({
          type: 'paragraph',
          attrs: { id: generateNodeId() },
          content: inlineFromMarkdownLine(rest),
        });
      }
      continue;
    }

    // Incomplete heading start on last block: "# " or "## Tit"
    if (isLast) {
      const partial = /^(#{1,6})(?:\s+(.*))?$/.exec(first.trim());
      if (partial && lines.length === 1) {
        const level = Math.min(6, (partial[1] ?? '#').length);
        const title = partial[2] ?? '';
        blocks.push({
          type: 'heading',
          attrs: { level, id: generateNodeId() },
          content: title ? [{ type: 'text', text: title }] : [],
        });
        continue;
      }
    }

    const body = lines.join('\n');
    if (body.length || isLast) {
      blocks.push({
        type: 'paragraph',
        attrs: { id: generateNodeId() },
        content: paragraphContentFromText(body),
      });
    }
  }

  return blocks.length
    ? blocks
    : [{ type: 'paragraph', attrs: { id: generateNodeId() }, content: [] }];
}

function paragraphContentFromText(body: string): JSONContent[] {
  if (!body) return [];
  const lines = body.split('\n');
  const content: JSONContent[] = [];
  lines.forEach((line, idx) => {
    content.push(...inlineFromMarkdownLine(line));
    if (idx < lines.length - 1) content.push({ type: 'hardBreak' });
  });
  return content.length ? content : [];
}

function inlineFromMarkdownLine(line: string): JSONContent[] {
  if (!line) return [];
  // Light inline: **bold**, *italic*, skip raw markers when complete
  const out: JSONContent[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|__[^_]+__|_[^_]+_)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    if (m.index > last) {
      out.push({ type: 'text', text: line.slice(last, m.index) });
    }
    const token = m[0]!;
    if (token.startsWith('**') || token.startsWith('__')) {
      out.push({
        type: 'text',
        text: token.slice(2, -2),
        marks: [{ type: 'bold' }],
      });
    } else {
      out.push({
        type: 'text',
        text: token.slice(1, -1),
        marks: [{ type: 'italic' }],
      });
    }
    last = m.index + token.length;
  }
  if (last < line.length) out.push({ type: 'text', text: line.slice(last) });
  return out.length ? out : [{ type: 'text', text: line }];
}

/**
 * Queue that releases text word-by-word at a steady pace for smooth typing.
 */
export class WordStreamTyper {
  private pending = '';
  private queue: string[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private accumulated = '';
  private destroyed = false;
  private drainResolvers: Array<() => void> = [];

  constructor(
    private readonly onUpdate: (fullMarkdown: string) => void,
    private readonly msPerWord = 32,
  ) {}

  push(chunk: string) {
    if (this.destroyed) return;
    this.pending += chunk;
    this.flushPendingToQueue(false);
    this.kick();
  }

  /** Drain remaining buffered characters, then resolve when the queue is empty. */
  flush(): Promise<void> {
    if (this.destroyed) return Promise.resolve();
    this.flushPendingToQueue(true);
    this.kick();
    if (!this.queue.length && !this.timer) {
      if (this.pending) {
        this.accumulated += this.pending;
        this.pending = '';
        this.onUpdate(this.accumulated);
      }
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.drainResolvers.push(resolve);
    });
  }

  destroy() {
    this.destroyed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.queue = [];
    this.pending = '';
    for (const r of this.drainResolvers) r();
    this.drainResolvers = [];
  }

  get text() {
    return this.accumulated;
  }

  private flushPendingToQueue(force: boolean) {
    // Emit complete words (word + trailing whitespace). Keep a partial word buffered.
    const re = /\S+\s+|\S+$/g;
    let match: RegExpExecArray | null;
    let consumed = 0;
    const src = this.pending;
    while ((match = re.exec(src))) {
      const token = match[0]!;
      const isPartialTail = match.index + token.length === src.length && !/\s$/.test(token);
      if (isPartialTail && !force) break;
      this.queue.push(token);
      consumed = match.index + token.length;
    }
    if (consumed === 0 && force && src) {
      this.queue.push(src);
      consumed = src.length;
    }
    this.pending = src.slice(consumed);
  }

  private resolveDrain() {
    if (this.queue.length || this.timer || this.pending) return;
    const resolvers = this.drainResolvers;
    this.drainResolvers = [];
    for (const r of resolvers) r();
  }

  private kick() {
    if (this.timer) return;
    const step = () => {
      if (this.destroyed) return;
      const next = this.queue.shift();
      if (next === undefined) {
        this.timer = null;
        this.resolveDrain();
        return;
      }
      this.accumulated += next;
      this.onUpdate(this.accumulated);
      const delay = this.queue.length > 40 ? 12 : this.queue.length > 15 ? 20 : this.msPerWord;
      this.timer = setTimeout(() => {
        this.timer = null;
        step();
      }, delay);
    };
    step();
  }
}

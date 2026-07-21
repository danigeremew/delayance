import {
  generateNodeId,
  type DocNode,
  type HeadingLevel,
  type InlineNode,
} from '@delayance/document-model';
import type { DocumentOperation } from '@delayance/document-engine';
import type { ProposedOp } from './types';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function ensureId(value: unknown): string {
  return typeof value === 'string' && UUID_RE.test(value) ? value : generateNodeId();
}

function asInlines(value: unknown): InlineNode[] {
  if (typeof value === 'string') {
    return value.trim() ? [{ type: 'text', text: value }] : [];
  }
  if (!Array.isArray(value)) {
    if (value && typeof value === 'object' && 'text' in value) {
      return asInlines((value as { text: unknown }).text);
    }
    return [];
  }
  const out: InlineNode[] = [];
  for (const item of value) {
    if (typeof item === 'string') {
      if (item) out.push({ type: 'text', text: item });
      continue;
    }
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    if (row.type === 'link' && typeof row.href === 'string') {
      out.push({
        type: 'link',
        href: row.href,
        content: asInlines(row.content).filter((c): c is Extract<InlineNode, { type: 'text' }> =>
          c.type === 'text',
        ),
      });
      continue;
    }
    const text =
      typeof row.text === 'string'
        ? row.text
        : typeof row.content === 'string'
          ? row.content
          : '';
    if (text) {
      const marks = Array.isArray(row.marks)
        ? (row.marks.filter((m) =>
            m === 'bold' || m === 'italic' || m === 'underline',
          ) as ('bold' | 'italic' | 'underline')[])
        : undefined;
      out.push({ type: 'text', text, ...(marks?.length ? { marks } : {}) });
    }
  }
  return out;
}

function headingLevel(value: unknown): HeadingLevel {
  const n = typeof value === 'number' ? value : Number(value);
  if (n >= 1 && n <= 6) return n as HeadingLevel;
  return 1;
}

/** Coerce loosely-shaped LLM nodes into schema-valid DocNodes. */
export function normalizeAiNode(raw: unknown, forceId?: string): DocNode | null {
  if (!raw || typeof raw !== 'object') return null;
  const node = raw as Record<string, unknown>;
  const type = typeof node.type === 'string' ? node.type : guessType(node);
  if (!type) return null;
  const id = forceId ?? ensureId(node.id);

  switch (type) {
    case 'section':
    case 'appendix':
      return {
        id,
        type,
        children: normalizeChildren(node.children),
        ...(typeof node.locked === 'boolean' ? { locked: node.locked } : {}),
      };
    case 'heading':
      return {
        id,
        type: 'heading',
        level: headingLevel(node.level),
        content: asInlines(node.content ?? node.text ?? node.title),
      };
    case 'paragraph':
    case 'quote':
    case 'caption':
    case 'footnote':
      return {
        id,
        type,
        content: asInlines(node.content ?? node.text),
      };
    case 'list': {
      const itemsRaw = Array.isArray(node.items) ? node.items : [];
      return {
        id,
        type: 'list',
        ordered: Boolean(node.ordered),
        items: itemsRaw.map((item) => {
          const row = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
          return {
            id: ensureId(row.id),
            type: 'listItem' as const,
            content: normalizeChildren(row.content ?? row.children),
          };
        }),
      };
    }
    case 'listItem':
      return {
        id,
        type: 'listItem',
        content: normalizeChildren(node.content ?? node.children),
      };
    case 'equation':
      return {
        id,
        type: 'equation',
        latex: typeof node.latex === 'string' ? node.latex : String(node.text ?? ''),
      };
    case 'citation':
      return {
        id,
        type: 'citation',
        sourceId: typeof node.sourceId === 'string' ? node.sourceId : '',
        ...(typeof node.label === 'string' ? { label: node.label } : {}),
      };
    case 'pageBreak':
      return { id, type: 'pageBreak' };
    case 'sectionBreak':
      return { id, type: 'sectionBreak' };
    case 'figure':
      return {
        id,
        type: 'figure',
        ...(typeof node.assetId === 'string' ? { assetId: node.assetId } : {}),
        ...(typeof node.alt === 'string' ? { alt: node.alt } : {}),
      };
    case 'table':
      return {
        id,
        type: 'table',
        rows: [],
      };
    case 'crossReference':
      return {
        id,
        type: 'crossReference',
        targetId: typeof node.targetId === 'string' ? node.targetId : generateNodeId(),
        targetKind:
          typeof node.targetKind === 'string' ? (node.targetKind as 'heading') : 'heading',
        displayMode:
          node.displayMode === 'label' || node.displayMode === 'title'
            ? node.displayMode
            : 'number',
      };
    default:
      // Bare text blob → paragraph
      if (typeof node.text === 'string' || typeof node.content === 'string') {
        return {
          id,
          type: 'paragraph',
          content: asInlines(node.content ?? node.text),
        };
      }
      return null;
  }
}

function guessType(node: Record<string, unknown>): string | null {
  if (typeof node.level === 'number') return 'heading';
  if (Array.isArray(node.children)) return 'section';
  if (typeof node.text === 'string' || typeof node.content === 'string' || Array.isArray(node.content)) {
    return 'paragraph';
  }
  return null;
}

function normalizeChildren(value: unknown): DocNode[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((child) => normalizeAiNode(child))
    .filter((n): n is DocNode => Boolean(n));
}

export function normalizeProposedOp(op: ProposedOp): DocumentOperation | null {
  if (op.type === 'insert') {
    const node = normalizeAiNode(op.node);
    if (!node) return null;
    return {
      type: 'insert',
      parentId: op.parentId ?? null,
      referenceId: op.referenceId,
      position: op.position ?? 'into',
      node,
    };
  }
  if (op.type === 'replace') {
    const node = normalizeAiNode(op.node, op.targetId);
    if (!node) return null;
    return { type: 'replace', targetId: op.targetId, node };
  }
  if (op.type === 'delete') {
    return {
      type: 'delete',
      targetId: op.targetId,
      force: op.force ?? true,
    };
  }
  return op as DocumentOperation;
}

/** Detect clear/remove-everything style edit instructions. */
export function isClearDocumentIntent(instruction: string): boolean {
  const t = instruction.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!t) return false;
  const wantsClear =
    /\b(remove|delete|clear|erase|wipe|empty|reset)\b/.test(t) ||
    /\bget rid of\b/.test(t);
  const targetsAll =
    /\b(everything|all|entire|whole|content|document|page|text|nodes?)\b/.test(t) ||
    /\bin this (page|document|doc)\b/.test(t) ||
    t === 'everything' ||
    t === 'clear' ||
    t === 'delete all' ||
    t === 'remove all';
  return wantsClear && targetsAll;
}

/** Delete every top-level node (clears the document). */
export function synthesizeClearDocumentOps(doc: {
  children: { id: string }[];
}): DocumentOperation[] {
  return doc.children.map((child) => ({
    type: 'delete' as const,
    targetId: child.id,
    force: true,
  }));
}

/** Turn markdown-ish answer text into a root insert when the model skips valid ops. */
export function synthesizeWriteOpsFromText(text: string): DocumentOperation[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const children: DocNode[] = [];
  const blocks = trimmed.split(/\n{2,}/);

  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trimEnd());
    const first = lines[0]?.trim() ?? '';
    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(first);
    if (headingMatch && lines.length === 1) {
      const hashes = headingMatch[1] ?? '#';
      const title = (headingMatch[2] ?? '').trim();
      children.push({
        id: generateNodeId(),
        type: 'heading',
        level: Math.min(6, hashes.length) as HeadingLevel,
        content: [{ type: 'text', text: title }],
      });
      continue;
    }
    if (/^#{1,6}\s+/.test(first)) {
      const level = (first.match(/^#+/)?.[0].length ?? 1) as HeadingLevel;
      const title = first.replace(/^#{1,6}\s+/, '').trim();
      children.push({
        id: generateNodeId(),
        type: 'heading',
        level: Math.min(6, level) as HeadingLevel,
        content: [{ type: 'text', text: title }],
      });
      const rest = lines.slice(1).join('\n').trim();
      if (rest) {
        children.push({
          id: generateNodeId(),
          type: 'paragraph',
          content: [{ type: 'text', text: rest }],
        });
      }
      continue;
    }
    const body = lines.join('\n').trim();
    if (body) {
      children.push({
        id: generateNodeId(),
        type: 'paragraph',
        content: [{ type: 'text', text: body }],
      });
    }
  }

  if (!children.length) {
    children.push({
      id: generateNodeId(),
      type: 'paragraph',
      content: [{ type: 'text', text: trimmed }],
    });
  }

  return [
    {
      type: 'insert',
      parentId: null,
      position: 'into',
      node: {
        id: generateNodeId(),
        type: 'section',
        children,
      },
    },
  ];
}

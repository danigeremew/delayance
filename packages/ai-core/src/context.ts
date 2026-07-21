import type { Document } from '@delayance/document-model';
import { findNode, walkNodes } from '@delayance/document-engine';
import { computeNumbering } from '@delayance/document-engine';
import type { AiMode } from './types';

export interface ContextPack {
  title: string;
  memory: string[];
  sources: string[];
  sourceIds: string[];
  nodeSnippets: { id: string; type: string; text: string; number?: string }[];
  contextNodeIds: string[];
  rootSummary?: string;
}

function nodeText(node: { type: string; [k: string]: unknown }): string {
  if ('text' in node && typeof node.text === 'string') return node.text;
  if ('title' in node && typeof node.title === 'string') return node.title;
  if ('latex' in node && typeof node.latex === 'string') return node.latex;
  if ('content' in node && Array.isArray(node.content)) {
    return (node.content as { text?: string }[])
      .map((c) => c.text ?? '')
      .join(' ');
  }
  return '';
}

export function packContext(input: {
  document: Document;
  memoryItems?: { kind: string; content: string }[];
  sourceTexts?: { id?: string; title: string; text: string }[];
  nodeIds?: string[];
  maxNodes?: number;
  /** When true, include every top-level node id so edit/delete can target the full tree. */
  includeAllRootIds?: boolean;
}): ContextPack {
  const numbering = computeNumbering(input.document);
  const maxNodes = input.maxNodes ?? 12;
  let ids = input.nodeIds?.filter(Boolean) ?? [];

  if (!ids.length) {
    const collected: string[] = [];
    if (input.includeAllRootIds) {
      for (const n of input.document.children) {
        collected.push(n.id);
      }
    }
    walkNodes(input.document.children, (n) => {
      if (n.type === 'heading' || n.type === 'paragraph' || n.type === 'section') {
        if (!collected.includes(n.id)) collected.push(n.id);
      }
    });
    ids = collected.slice(0, input.includeAllRootIds ? Math.max(maxNodes, collected.length) : maxNodes);
  } else {
    ids = ids.slice(0, maxNodes);
  }

  const nodeSnippets = ids
    .map((id) => {
      const loc = findNode(input.document, id);
      if (!loc) return null;
      const entry = numbering[id];
      return {
        id,
        type: loc.node.type,
        text: nodeText(loc.node as never).slice(0, 800),
        number: entry?.label,
      };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

  const sourceIds = (input.sourceTexts ?? [])
    .map((s) => s.id)
    .filter((id): id is string => Boolean(id));

  const rootIds = input.document.children.map((c) => `${c.id} (${c.type})`).join(', ');

  return {
    title: input.document.title,
    memory: (input.memoryItems ?? []).map((m) => `[${m.kind}] ${m.content}`),
    sources: (input.sourceTexts ?? []).map(
      (s) => `${s.id ? `[id=${s.id}] ` : ''}${s.title}: ${s.text.slice(0, 1200)}`,
    ),
    sourceIds,
    nodeSnippets,
    contextNodeIds: ids,
    rootSummary: rootIds
      ? `Top-level nodes (${input.document.children.length}): ${rootIds || '(none)'}`
      : 'Top-level nodes: (none — document is empty)',
  };
}

export function buildMessages(
  mode: AiMode,
  instruction: string,
  pack: ContextPack,
): { role: 'system' | 'user'; content: string }[] {
  const contextBlock = [
    `Document: ${pack.title}`,
    pack.rootSummary ?? '',
    pack.memory.length ? `Project memory:\n${pack.memory.join('\n')}` : '',
    pack.sources.length ? `Sources:\n${pack.sources.join('\n---\n')}` : '',
    'Context nodes:',
    ...pack.nodeSnippets.map(
      (n) => `- ${n.id} (${n.type}${n.number ? ` ${n.number}` : ''}): ${n.text}`,
    ),
  ]
    .filter(Boolean)
    .join('\n');

  const nodeShape =
    'Node shapes: paragraph={id,type:"paragraph",content:[{type:"text",text:"..."}]}; heading={id,type:"heading",level:1-6,content:[...]}; section={id,type:"section",children:[...]}. Always use UUID ids.';

  const systemByMode: Record<AiMode, string> = {
    ask: 'You are a document assistant. Answer questions as JSON only: {"answer":"...","citedSourceIds":["uuid",...]}. Use only source ids provided in context. Do not invent document operations. Do not modify the document.',
    edit: `You propose document edits as JSON only: {"answer":"short summary","ops":[...]}. Ops: insert|replace|delete|moveSection|promoteHeading|demoteHeading. ${nodeShape} For replace, node.id must equal targetId. To clear/remove everything, emit one delete (force:true) for EACH top-level node id listed — do not insert or replace with a new paragraph. Prefer delete over replace-with-empty. Never return answer-only without ops when content should change.`,
    write: `You propose new document content as JSON only: {"answer":"short summary of what you inserted","ops":[{"type":"insert","parentId":null,"position":"into","node":{...}}]}. ${nodeShape} Prefer insert with parentId:null and position:"into". Put the full written content in ops nodes (not only in answer). Use a section node with heading/paragraph children for multi-block content.`,
    review:
      'You review the document and return JSON only: {"findings":[{"nodeId":"...","severity":"info|warning|error","message":"...","suggestion":"..."}],"ops":[],"answer":"brief summary"}.',
  };

  return [
    { role: 'system', content: systemByMode[mode] },
    {
      role: 'user',
      content: `${contextBlock}\n\nInstruction:\n${instruction}`,
    },
  ];
}

/** Messages for streaming Write — plain markdown body, not JSON ops. */
export function buildWriteStreamMessages(
  instruction: string,
  pack: ContextPack,
): { role: 'system' | 'user'; content: string }[] {
  const contextBlock = [
    `Document: ${pack.title}`,
    pack.rootSummary ?? '',
    pack.memory.length ? `Project memory:\n${pack.memory.join('\n')}` : '',
    pack.sources.length ? `Sources:\n${pack.sources.join('\n---\n')}` : '',
    'Context nodes:',
    ...pack.nodeSnippets.map(
      (n) => `- ${n.id} (${n.type}${n.number ? ` ${n.number}` : ''}): ${n.text}`,
    ),
  ]
    .filter(Boolean)
    .join('\n');

  return [
    {
      role: 'system',
      content:
        'You are a document writing assistant. Write the requested document content as clean markdown only. ' +
        'Use # / ## headings and blank lines between paragraphs. Do not wrap in JSON or code fences. ' +
        'Do not include commentary before or after the content.',
    },
    {
      role: 'user',
      content: `${contextBlock}\n\nWrite the following:\n${instruction}`,
    },
  ];
}

import {
  generateNodeId,
  textFromInlines,
  type DocNode,
  type Document,
  type HeadingLevel,
  type InlineNode,
} from '@delayance/document-model';

/** Minimal ProseMirror/Tiptap JSON shapes used for conversion. */
export interface PmMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface PmTextNode {
  type: 'text';
  text: string;
  marks?: PmMark[];
}

export interface PmNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PmNode[];
  text?: string;
  marks?: PmMark[];
}

export interface PmDoc {
  type: 'doc';
  content?: PmNode[];
}

function inlineToPm(inlines: InlineNode[]): PmNode[] {
  const out: PmNode[] = [];
  for (const inline of inlines) {
    if (inline.type === 'text') {
      // ProseMirror forbids empty text nodes — omit them (empty paragraph = no content)
      if (!inline.text) continue;
      const marks: PmMark[] = (inline.marks ?? []).map((m) => ({ type: m }));
      out.push({ type: 'text', text: inline.text, ...(marks.length ? { marks } : {}) });
    } else {
      const text = textFromInlines(inline.content);
      if (!text) continue;
      out.push({
        type: 'text',
        text,
        marks: [{ type: 'link', attrs: { href: inline.href } }],
      });
    }
  }
  return out;
}

function pmToInlines(nodes: PmNode[] | undefined): InlineNode[] {
  if (!nodes?.length) return [{ type: 'text', text: '' }];
  return nodes
    .filter((n) => n.type === 'text')
    .map((n) => {
      const marks = (n.marks ?? [])
        .map((m) => m.type)
        .filter((m): m is 'bold' | 'italic' | 'underline' =>
          m === 'bold' || m === 'italic' || m === 'underline',
        );
      const link = (n.marks ?? []).find((m) => m.type === 'link');
      if (link) {
        return {
          type: 'link' as const,
          href: String(link.attrs?.href ?? ''),
          content: [{ type: 'text' as const, text: n.text ?? '' }],
        };
      }
      return {
        type: 'text' as const,
        text: n.text ?? '',
        ...(marks.length ? { marks } : {}),
      };
    });
}

function nodeId(attrs?: Record<string, unknown>): string {
  const id = attrs?.id;
  return typeof id === 'string' && id.length > 0 ? id : generateNodeId();
}

function docNodeToPm(node: DocNode): PmNode | PmNode[] {
  switch (node.type) {
    case 'section':
      return {
        type: 'section',
        attrs: { id: node.id, locked: Boolean(node.locked) },
        content: node.children.flatMap((c) => {
          const r = docNodeToPm(c);
          return Array.isArray(r) ? r : [r];
        }),
      };
    case 'appendix':
      return {
        type: 'appendix',
        attrs: { id: node.id },
        content: node.children.flatMap((c) => {
          const r = docNodeToPm(c);
          return Array.isArray(r) ? r : [r];
        }),
      };
    case 'heading':
      return {
        type: 'heading',
        attrs: { id: node.id, level: node.level },
        content: inlineToPm(node.content),
      };
    case 'paragraph':
      return {
        type: 'paragraph',
        attrs: { id: node.id },
        content: inlineToPm(node.content),
      };
    case 'quote':
      return {
        type: 'blockquote',
        attrs: { id: node.id },
        content: [
          {
            type: 'paragraph',
            attrs: { id: generateNodeId() },
            content: inlineToPm(node.content),
          },
        ],
      };
    case 'figure':
      return {
        type: 'figure',
        attrs: { id: node.id, assetId: node.assetId ?? null, alt: node.alt ?? null },
        content: node.caption
          ? [
              {
                type: 'caption',
                attrs: { id: node.caption.id },
                content: inlineToPm(node.caption.content),
              },
            ]
          : [],
      };
    case 'table':
      return {
        type: 'table',
        attrs: { id: node.id },
        content: [
          ...(node.caption
            ? [
                {
                  type: 'caption',
                  attrs: { id: node.caption.id },
                  content: inlineToPm(node.caption.content),
                } satisfies PmNode,
              ]
            : []),
          ...node.rows.map((row) => ({
            type: 'tableRow',
            attrs: { id: row.id, isHeader: Boolean(row.isHeader) },
            content: row.cells.map((cell) => ({
              type: row.isHeader ? 'tableHeader' : 'tableCell',
              attrs: { id: cell.id },
              content: cell.content.flatMap((c) => {
                const r = docNodeToPm(c);
                return Array.isArray(r) ? r : [r];
              }),
            })),
          })),
        ],
      };
    case 'list':
      return {
        type: node.ordered ? 'orderedList' : 'bulletList',
        attrs: { id: node.id },
        content: node.items.map((item) => ({
          type: 'listItem',
          attrs: { id: item.id },
          content: item.content.flatMap((c) => {
            const r = docNodeToPm(c);
            return Array.isArray(r) ? r : [r];
          }),
        })),
      };
    case 'equation':
      return {
        type: 'equation',
        attrs: { id: node.id, latex: node.latex },
      };
    case 'citation':
      return {
        type: 'citation',
        attrs: { id: node.id, sourceId: node.sourceId, label: node.label ?? null },
      };
    case 'footnote':
      return {
        type: 'footnote',
        attrs: { id: node.id },
        content: inlineToPm(node.content),
      };
    case 'pageBreak':
      return { type: 'pageBreak', attrs: { id: node.id } };
    case 'sectionBreak':
      return { type: 'sectionBreak', attrs: { id: node.id } };
    case 'crossReference':
      return {
        type: 'crossReference',
        attrs: {
          id: node.id,
          targetId: node.targetId,
          targetKind: node.targetKind,
          displayMode: node.displayMode,
        },
      };
    case 'caption':
      return {
        type: 'caption',
        attrs: { id: node.id },
        content: inlineToPm(node.content),
      };
    case 'listItem':
      return {
        type: 'listItem',
        attrs: { id: node.id },
        content: node.content.flatMap((c) => {
          const r = docNodeToPm(c);
          return Array.isArray(r) ? r : [r];
        }),
      };
    default:
      return {
        type: 'paragraph',
        attrs: { id: generateNodeId() },
        content: [],
      };
  }
}

export function documentToPmJson(doc: Document): PmDoc {
  return {
    type: 'doc',
    content: doc.children.flatMap((c) => {
      const r = docNodeToPm(c);
      return Array.isArray(r) ? r : [r];
    }),
  };
}

function pmToDocNode(node: PmNode): DocNode {
  const id = nodeId(node.attrs);
  switch (node.type) {
    case 'section':
      return {
        id,
        type: 'section',
        locked: Boolean(node.attrs?.locked),
        children: (node.content ?? []).map(pmToDocNode),
      };
    case 'appendix':
      return {
        id,
        type: 'appendix',
        children: (node.content ?? []).map(pmToDocNode),
      };
    case 'heading': {
      const level = Number(node.attrs?.level ?? 1) as HeadingLevel;
      return {
        id,
        type: 'heading',
        level: (level >= 1 && level <= 6 ? level : 1) as HeadingLevel,
        content: pmToInlines(node.content),
      };
    }
    case 'paragraph':
      return { id, type: 'paragraph', content: pmToInlines(node.content) };
    case 'blockquote': {
      const first = node.content?.[0];
      return {
        id,
        type: 'quote',
        content: pmToInlines(first?.content ?? node.content),
      };
    }
    case 'figure': {
      const captionNode = (node.content ?? []).find((c) => c.type === 'caption');
      return {
        id,
        type: 'figure',
        assetId: (node.attrs?.assetId as string | undefined) ?? undefined,
        alt: (node.attrs?.alt as string | undefined) ?? undefined,
        caption: captionNode
          ? {
              id: nodeId(captionNode.attrs),
              type: 'caption',
              content: pmToInlines(captionNode.content),
            }
          : undefined,
      };
    }
    case 'table': {
      const captionNode = (node.content ?? []).find((c) => c.type === 'caption');
      const rows = (node.content ?? []).filter((c) => c.type === 'tableRow');
      return {
        id,
        type: 'table',
        caption: captionNode
          ? {
              id: nodeId(captionNode.attrs),
              type: 'caption',
              content: pmToInlines(captionNode.content),
            }
          : undefined,
        rows: rows.map((row) => ({
          id: nodeId(row.attrs),
          isHeader: Boolean(row.attrs?.isHeader),
          cells: (row.content ?? []).map((cell) => ({
            id: nodeId(cell.attrs),
            content: (cell.content ?? []).map(pmToDocNode),
          })),
        })),
      };
    }
    case 'bulletList':
    case 'orderedList':
      return {
        id,
        type: 'list',
        ordered: node.type === 'orderedList',
        items: (node.content ?? []).map((item) => ({
          id: nodeId(item.attrs),
          type: 'listItem' as const,
          content: (item.content ?? []).map(pmToDocNode),
        })),
      };
    case 'equation':
      return {
        id,
        type: 'equation',
        latex: String(node.attrs?.latex ?? ''),
      };
    case 'citation':
      return {
        id,
        type: 'citation',
        sourceId: String(node.attrs?.sourceId ?? ''),
        label: (node.attrs?.label as string | undefined) ?? undefined,
      };
    case 'footnote':
      return { id, type: 'footnote', content: pmToInlines(node.content) };
    case 'pageBreak':
      return { id, type: 'pageBreak' };
    case 'sectionBreak':
      return { id, type: 'sectionBreak' };
    case 'crossReference':
      return {
        id,
        type: 'crossReference',
        targetId: String(node.attrs?.targetId ?? ''),
        targetKind: (node.attrs?.targetKind as
          | 'section'
          | 'heading'
          | 'figure'
          | 'table'
          | 'equation'
          | 'appendix'
          | 'footnote') ?? 'figure',
        displayMode: (node.attrs?.displayMode as 'number' | 'label' | 'title') ?? 'label',
      };
    default:
      return { id, type: 'paragraph', content: pmToInlines(node.content) };
  }
}

export function pmJsonToDocument(
  pm: PmDoc,
  meta: { id: string; title: string; template: Document['template'] },
): Document {
  return {
    id: meta.id,
    title: meta.title,
    template: meta.template,
    children: (pm.content ?? []).map(pmToDocNode),
  };
}

import type { Document, DocNode, InlineNode } from '@delayance/document-model';
import { computeNumbering } from '@delayance/document-engine';

function inlineMd(nodes: InlineNode[]): string {
  return nodes
    .map((n) => {
      if (n.type === 'text') {
        let t = n.text;
        if (n.marks?.includes('bold')) t = `**${t}**`;
        if (n.marks?.includes('italic')) t = `*${t}*`;
        return t;
      }
      if (n.type === 'link') {
        return `[${inlineMd(n.content)}](${n.href})`;
      }
      return '';
    })
    .join('');
}

function nodeToMd(node: DocNode, numbering: ReturnType<typeof computeNumbering>): string {
  switch (node.type) {
    case 'section':
    case 'appendix':
      return node.children.map((c) => nodeToMd(c, numbering)).join('\n\n');
    case 'heading': {
      const hashes = '#'.repeat(Math.min(node.level, 6));
      const label = numbering[node.id]?.number
        ? `${numbering[node.id]!.number} ${inlineMd(node.content)}`
        : inlineMd(node.content);
      return `${hashes} ${label}`;
    }
    case 'paragraph':
      return inlineMd(node.content);
    case 'quote':
      return `> ${inlineMd(node.content)}`;
    case 'equation':
      return `$$\n${node.latex}\n$$`;
    case 'figure':
      return `![${node.alt ?? 'figure'}](${node.assetId ?? ''})\n\n*${numbering[node.id]?.label ?? 'Figure'}*`;
    case 'citation':
      return `[${node.sourceId}]`;
    case 'crossReference':
      return numbering[node.targetId]?.label ?? `[xref:${node.targetId}]`;
    case 'table': {
      const rows = node.rows.map((row) =>
        row.cells
          .map((cell) =>
            cell.content.map((c) => nodeToMd(c, numbering)).join(' ').replace(/\|/g, '\\|'),
          )
          .join(' | '),
      );
      if (!rows.length) return '';
      const header = `| ${rows[0]} |`;
      const sep = `| ${rows[0]!.split(' | ').map(() => '---').join(' | ')} |`;
      const body = rows.slice(1).map((r) => `| ${r} |`).join('\n');
      return `${header}\n${sep}\n${body}`;
    }
    case 'pageBreak':
      return '\n---\n';
    default:
      return '';
  }
}

export function documentToMarkdown(doc: Document): string {
  const numbering = computeNumbering(doc);
  const body = doc.children.map((c) => nodeToMd(c, numbering)).join('\n\n');
  return `# ${doc.title}\n\n${body}\n`;
}

export function documentToPlainText(doc: Document): string {
  return documentToMarkdown(doc)
    .replace(/^#+\s+/gm, '')
    .replace(/\*\*|__/g, '')
    .replace(/`/g, '');
}

export { documentToPrintHtml as documentToHtml } from './html';

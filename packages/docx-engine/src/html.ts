import { textFromInlines, type Document, type DocNode } from '@delayance/document-model';
import { computeNumbering } from '@delayance/document-engine';

function renderNode(node: DocNode, numbering: ReturnType<typeof computeNumbering>): string {
  switch (node.type) {
    case 'section':
    case 'appendix':
      return node.children.map((c) => renderNode(c, numbering)).join('');
    case 'heading': {
      const label = numbering[node.id]?.label ?? textFromInlines(node.content);
      const tag = `h${Math.min(node.level, 6)}`;
      return `<${tag}>${escapeHtml(label)}</${tag}>`;
    }
    case 'paragraph':
      return `<p>${escapeHtml(textFromInlines(node.content))}</p>`;
    case 'quote':
      return `<blockquote>${escapeHtml(textFromInlines(node.content))}</blockquote>`;
    case 'pageBreak':
      return '<div style="page-break-after:always"></div>';
    case 'figure':
      return `<figure><div>[Figure]</div><figcaption>${escapeHtml(numbering[node.id]?.label ?? '')} ${escapeHtml(node.caption ? textFromInlines(node.caption.content) : '')}</figcaption></figure>`;
    case 'table': {
      const rows = node.rows
        .map((row) => {
          const cells = row.cells
            .map((cell) => {
              const tag = row.isHeader ? 'th' : 'td';
              const inner = cell.content.map((c) => renderNode(c, numbering)).join('');
              return `<${tag}>${inner}</${tag}>`;
            })
            .join('');
          return `<tr>${cells}</tr>`;
        })
        .join('');
      return `<table>${rows}</table>`;
    }
    default:
      return '';
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function documentToPrintHtml(doc: Document): string {
  const numbering = computeNumbering(doc);
  const margins = doc.template.page.margins;
  const body = doc.children.map((c) => renderNode(c, numbering)).join('\n');
  return `<!doctype html>
<html><head><meta charset="utf-8"/><title>${escapeHtml(doc.title)}</title>
<style>
  @page { size: A4; margin: ${margins.top}px ${margins.right}px ${margins.bottom}px ${margins.left}px; }
  body { font-family: "${doc.template.typography.bodyFont}", serif; font-size: ${doc.template.typography.bodySizePt}pt; line-height: ${doc.template.typography.lineSpacing}; color: #111; }
  h1,h2,h3 { font-family: "${doc.template.typography.headingFont}", serif; }
  table { border-collapse: collapse; width: 100%; }
  td, th { border: 1px solid #ccc; padding: 4px 8px; }
</style></head><body>
<h1 class="doc-title">${escapeHtml(doc.title)}</h1>
${body}
</body></html>`;
}

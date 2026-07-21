import { cloneDocument, type Document } from '@delayance/document-model';
import { validateDocument } from '@delayance/document-engine';
import type { CompatibilityItem, NormalizePreview } from './types';

export function previewNormalize(doc: Document): NormalizePreview {
  const issues: CompatibilityItem[] = validateDocument(doc).map((i) => ({
    severity: i.severity === 'error' ? 'unsupported' : 'converted',
    code: i.code,
    message: i.message,
    sourceHint: i.nodeId,
  }));
  return { issues, document: cloneDocument(doc) };
}

export function applyNormalize(doc: Document): Document {
  const next = cloneDocument(doc);
  // Strip leading manual numbering from paragraphs
  const walk = (nodes: Document['children']) => {
    for (const node of nodes) {
      if (node.type === 'paragraph') {
        const textNode = node.content[0];
        if (textNode?.type === 'text') {
          textNode.text = textNode.text.replace(/^\d+(\.\d+)*\s+/, '');
          textNode.text = textNode.text.replace(/^(Figure|Table)\s+\d+([.:])\s*/i, '');
        }
      }
      if (node.type === 'section' || node.type === 'appendix') walk(node.children);
    }
  };
  walk(next.children);
  return next;
}

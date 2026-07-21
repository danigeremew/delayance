import type { Document } from '@delayance/document-model';
import { computeNumbering } from './numbering';
import type { NumberingMap, ResolvedRef } from './types';
import { walkNodes } from './tree';

export function getIncomingReferences(doc: Document, targetId: string): string[] {
  const refs: string[] = [];
  walkNodes(doc.children, (node) => {
    if (node.type === 'crossReference' && node.targetId === targetId) {
      refs.push(node.id);
    }
  });
  return refs;
}

export function findBrokenReferences(
  doc: Document,
  numbering: NumberingMap = computeNumbering(doc),
): ResolvedRef[] {
  return resolveCrossReferences(doc, numbering).filter((r) => r.broken);
}

export function resolveCrossReferences(
  doc: Document,
  numbering: NumberingMap = computeNumbering(doc),
): ResolvedRef[] {
  const existing = new Set<string>();
  walkNodes(doc.children, (node) => existing.add(node.id));

  const resolved: ResolvedRef[] = [];
  walkNodes(doc.children, (node) => {
    if (node.type !== 'crossReference') return;
    const entry = numbering[node.targetId];
    const broken = !existing.has(node.targetId) || !entry;
    let display = '???';
    if (entry) {
      if (node.displayMode === 'title') {
        display = entry.title || entry.label;
      } else if (node.displayMode === 'label') {
        display = entry.label;
      } else {
        display = entry.number;
      }
    }
    resolved.push({
      refId: node.id,
      targetId: node.targetId,
      display,
      broken,
    });
  });
  return resolved;
}

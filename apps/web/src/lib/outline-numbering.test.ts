import { describe, expect, it } from 'vitest';
import {
  applyOperation,
  computeNumbering,
} from '@delayance/document-engine';
import { createEmptyDocument, generateNodeId } from '@delayance/document-model';

describe('outline move updates numbering', () => {
  it('renumbers after moveSection', () => {
    const s1 = generateNodeId();
    const h1 = generateNodeId();
    const s2 = generateNodeId();
    const h2 = generateNodeId();
    const doc = createEmptyDocument('Test');
    doc.children = [
      {
        id: s1,
        type: 'section',
        children: [{ id: h1, type: 'heading', level: 1, content: [{ type: 'text', text: 'A' }] }],
      },
      {
        id: s2,
        type: 'section',
        children: [{ id: h2, type: 'heading', level: 1, content: [{ type: 'text', text: 'B' }] }],
      },
    ];

    expect(computeNumbering(doc)[h1]?.number).toBe('1');
    expect(computeNumbering(doc)[h2]?.number).toBe('2');

    const moved = applyOperation(doc, {
      type: 'moveSection',
      sectionId: s2,
      parentId: null,
      position: 'before',
      referenceId: s1,
    });
    expect(moved.ok).toBe(true);
    const map = computeNumbering(moved.document);
    expect(map[h2]?.number).toBe('1');
    expect(map[h1]?.number).toBe('2');
  });
});

import { describe, expect, it } from 'vitest';
import {
  assertStableIds,
  collectIds,
  createEmptyDocument,
  generateNodeId,
  type Document,
  type SectionNode,
} from './index';

describe('document-model', () => {
  it('creates empty documents with ids', () => {
    const doc = createEmptyDocument('Test');
    expect(doc.title).toBe('Test');
    expect(doc.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('collects nested ids', () => {
    const sectionId = generateNodeId();
    const headingId = generateNodeId();
    const doc: Document = {
      ...createEmptyDocument(),
      children: [
        {
          id: sectionId,
          type: 'section',
          children: [{ id: headingId, type: 'heading', level: 1, content: [{ type: 'text', text: 'A' }] }],
        } satisfies SectionNode,
      ],
    };
    const ids = collectIds(doc.children);
    expect(ids.has(sectionId)).toBe(true);
    expect(ids.has(headingId)).toBe(true);
  });

  it('assertStableIds passes when ids preserved', () => {
    const sectionId = generateNodeId();
    const before: Document = {
      ...createEmptyDocument(),
      children: [{ id: sectionId, type: 'section', children: [] }],
    };
    const after: Document = {
      ...before,
      children: [{ id: sectionId, type: 'section', children: [] }, { id: generateNodeId(), type: 'pageBreak' }],
    };
    expect(() => assertStableIds(before, after, [sectionId])).not.toThrow();
  });
});

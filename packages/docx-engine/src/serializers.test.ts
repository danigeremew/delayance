import { describe, expect, it } from 'vitest';
import { createEmptyDocument, generateNodeId } from '@delayance/document-model';
import { applyOperation } from '@delayance/document-engine';
import { documentToMarkdown } from './serializers';

describe('export serializers smoke', () => {
  it('renders markdown for a heading', () => {
    const base = createEmptyDocument('Smoke');
    const sectionId = generateNodeId();
    const withSection = applyOperation(base, {
      type: 'insert',
      parentId: null,
      position: 'into',
      node: { id: sectionId, type: 'section', children: [] },
    }).document;
    const doc = applyOperation(withSection, {
      type: 'insert',
      parentId: sectionId,
      position: 'into',
      node: {
        id: generateNodeId(),
        type: 'heading',
        level: 1,
        content: [{ type: 'text', text: 'Intro' }],
      },
    }).document;
    const md = documentToMarkdown(doc);
    expect(md).toContain('# Smoke');
    expect(md).toContain('Intro');
  });
});

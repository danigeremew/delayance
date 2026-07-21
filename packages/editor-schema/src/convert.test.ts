import { describe, expect, it } from 'vitest';
import {
  collectIds,
  createEmptyDocument,
  generateNodeId,
  type SectionNode,
} from '@delayance/document-model';
import { documentToPmJson, pmJsonToDocument } from './convert';

function sampleDoc() {
  const sectionId = generateNodeId();
  const headingId = generateNodeId();
  const paraId = generateNodeId();
  const figId = generateNodeId();
  const captionId = generateNodeId();
  const section: SectionNode = {
    id: sectionId,
    type: 'section',
    children: [
      {
        id: headingId,
        type: 'heading',
        level: 1,
        content: [{ type: 'text', text: 'Introduction' }],
      },
      {
        id: paraId,
        type: 'paragraph',
        content: [{ type: 'text', text: 'Hello', marks: ['bold'] }],
      },
      {
        id: figId,
        type: 'figure',
        caption: {
          id: captionId,
          type: 'caption',
          content: [{ type: 'text', text: 'Auth flow' }],
        },
      },
    ],
  };
  const doc = createEmptyDocument('Sample');
  doc.children = [section];
  return { doc, sectionId, headingId, paraId, figId, captionId };
}

describe('editor-schema round trip', () => {
  it('preserves stable ids', () => {
    const { doc, sectionId, headingId, paraId, figId, captionId } = sampleDoc();
    const pm = documentToPmJson(doc);
    const round = pmJsonToDocument(pm, {
      id: doc.id,
      title: doc.title,
      template: doc.template,
    });
    const ids = collectIds(round.children);
    for (const id of [sectionId, headingId, paraId, figId, captionId]) {
      expect(ids.has(id)).toBe(true);
    }
  });

  it('round-trips heading and marks', () => {
    const { doc } = sampleDoc();
    const pm = documentToPmJson(doc);
    const round = pmJsonToDocument(pm, {
      id: doc.id,
      title: doc.title,
      template: doc.template,
    });
    const section = round.children[0];
    expect(section?.type).toBe('section');
    if (section?.type === 'section') {
      const heading = section.children.find((c) => c.type === 'heading');
      expect(heading && heading.type === 'heading' && heading.content[0]).toMatchObject({
        type: 'text',
        text: 'Introduction',
      });
      const para = section.children.find((c) => c.type === 'paragraph');
      expect(para && para.type === 'paragraph' && para.content[0]).toMatchObject({
        type: 'text',
        text: 'Hello',
        marks: ['bold'],
      });
    }
  });

  it('omits empty text nodes so TipTap/ProseMirror can load empty paragraphs', () => {
    const doc = createEmptyDocument('Empty paras');
    doc.children = [
      {
        id: generateNodeId(),
        type: 'paragraph',
        content: [{ type: 'text', text: '' }],
      },
      {
        id: generateNodeId(),
        type: 'section',
        children: [
          {
            id: generateNodeId(),
            type: 'heading',
            level: 1,
            content: [{ type: 'text', text: 'Hello' }],
          },
        ],
      },
    ];
    const pm = documentToPmJson(doc);
    const emptyPara = pm.content?.[0];
    expect(emptyPara?.type).toBe('paragraph');
    expect(emptyPara?.content ?? []).toEqual([]);
    const section = pm.content?.[1];
    expect(section?.type).toBe('section');
    expect(section?.content?.[0]?.content?.[0]).toMatchObject({ text: 'Hello' });
  });
});

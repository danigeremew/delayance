import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import {
  createEmptyDocument,
  generateNodeId,
} from '@delayance/document-model';
import { exportDocx } from './export';
import { importDocx } from './import';
import { applyNormalize, previewNormalize } from './cleanup';

describe('docx export', () => {
  it('emits styles, numbering, and field instructions', async () => {
    const doc = createEmptyDocument('Export sample');
    const sectionId = generateNodeId();
    const headingId = generateNodeId();
    const figId = generateNodeId();
    doc.children = [
      {
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
            id: generateNodeId(),
            type: 'paragraph',
            content: [{ type: 'text', text: 'Hello' }],
          },
          {
            id: figId,
            type: 'figure',
            caption: {
              id: generateNodeId(),
              type: 'caption',
              content: [{ type: 'text', text: 'Flow' }],
            },
          },
          {
            id: generateNodeId(),
            type: 'crossReference',
            targetId: figId,
            targetKind: 'figure',
            displayMode: 'label',
          },
        ],
      },
    ];

    const { buffer, compatibilityReport } = await exportDocx(doc);
    const zip = await JSZip.loadAsync(buffer);
    expect(zip.file('word/document.xml')).toBeTruthy();
    expect(zip.file('word/styles.xml')).toBeTruthy();
    expect(zip.file('word/numbering.xml')).toBeTruthy();

    const documentXml = await zip.file('word/document.xml')!.async('string');
    expect(documentXml).toContain('w:pStyle w:val="Heading1"');
    expect(documentXml).toContain('w:instrText');
    expect(documentXml).toContain('TOC');
    expect(documentXml).toMatch(/REF /);

    const stylesXml = await zip.file('word/styles.xml')!.async('string');
    expect(stylesXml).toContain('Heading1');

    const numberingXml = await zip.file('word/numbering.xml')!.async('string');
    expect(numberingXml).toContain('w:abstractNum');

    const footerXml = await zip.file('word/footer1.xml')!.async('string');
    expect(footerXml).toContain('PAGE');

    expect(compatibilityReport.supportedCount).toBeGreaterThan(0);
  });
});

describe('docx import', () => {
  it('round-trips a minimal exported docx', async () => {
    const doc = createEmptyDocument('Import sample');
    doc.children = [
      {
        id: generateNodeId(),
        type: 'section',
        children: [
          {
            id: generateNodeId(),
            type: 'heading',
            level: 1,
            content: [{ type: 'text', text: 'Chapter One' }],
          },
          {
            id: generateNodeId(),
            type: 'paragraph',
            content: [{ type: 'text', text: 'Body text' }],
          },
        ],
      },
    ];
    const { buffer } = await exportDocx(doc);
    const imported = await importDocx(buffer, {
      mode: 'normalize',
      removeHeadersFooters: true,
    });
    expect(imported.document.children.length).toBeGreaterThan(0);
    expect(imported.compatibilityReport).toBeTruthy();
  });
});

describe('cleanup', () => {
  it('previews and strips manual numbering', () => {
    const doc = createEmptyDocument('Cleanup');
    doc.children = [
      {
        id: generateNodeId(),
        type: 'section',
        children: [
          {
            id: generateNodeId(),
            type: 'heading',
            level: 1,
            content: [{ type: 'text', text: 'A' }],
          },
          {
            id: generateNodeId(),
            type: 'paragraph',
            content: [{ type: 'text', text: '1.2 Manual text' }],
          },
        ],
      },
    ];
    const preview = previewNormalize(doc);
    expect(preview.issues.some((i) => i.code === 'manual_numbering')).toBe(true);
    const cleaned = applyNormalize(doc);
    const section = cleaned.children[0];
    expect(section?.type).toBe('section');
    if (section?.type === 'section') {
      const para = section.children.find((c) => c.type === 'paragraph');
      expect(para && para.type === 'paragraph' && para.content[0]).toMatchObject({
        text: 'Manual text',
      });
    }
  });
});

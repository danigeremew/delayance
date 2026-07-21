import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createEmptyDocument,
  generateNodeId,
} from '@delayance/document-model';
import { exportDocx } from './export';
import { importDocx } from './import';

const fixturesDir = resolve(__dirname, '../fixtures');
const fixturePath = resolve(fixturesDir, 'minimal-word-like.docx');

describe('docx fixtures', () => {
  it('writes and imports a Word-like fixture', async () => {
    mkdirSync(fixturesDir, { recursive: true });
    const doc = createEmptyDocument('Fixture');
    const sectionId = generateNodeId();
    doc.children = [
      {
        id: sectionId,
        type: 'section',
        children: [
          {
            id: generateNodeId(),
            type: 'heading',
            level: 1,
            content: [{ type: 'text', text: 'Fixture heading' }],
          },
          {
            id: generateNodeId(),
            type: 'paragraph',
            content: [{ type: 'text', text: 'Fixture body' }],
          },
        ],
      },
    ];
    const { buffer } = await exportDocx(doc);
    writeFileSync(fixturePath, buffer);
    expect(existsSync(fixturePath)).toBe(true);

    const imported = await importDocx(readFileSync(fixturePath), {
      mode: 'normalize',
    });
    expect(imported.document.title).toBeTruthy();
    expect(imported.compatibilityReport.items.length).toBeGreaterThan(0);
  });
});

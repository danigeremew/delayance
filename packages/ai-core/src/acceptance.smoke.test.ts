import { describe, expect, it } from 'vitest';
import { createEmptyDocument, generateNodeId } from '@delayance/document-model';
import { applyOperation, validateDocument } from '@delayance/document-engine';
import { exportDocx, documentToMarkdown } from '@delayance/docx-engine';
import { validateAiProposal } from '../src/validate';

describe('v1 acceptance smoke', () => {
  it('supports write → number → export → AI validate loop', async () => {
    const base = createEmptyDocument('Acceptance');
    const sectionId = generateNodeId();
    const headingId = generateNodeId();
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
        id: headingId,
        type: 'heading',
        level: 1,
        content: [{ type: 'text', text: 'Chapter one' }],
      },
    }).document;

    expect(validateDocument(doc).filter((i) => i.severity === 'error')).toHaveLength(0);
    expect(documentToMarkdown(doc)).toContain('Chapter one');

    const exported = await exportDocx(doc, { includeTocField: true });
    expect(exported.buffer.length).toBeGreaterThan(100);

    const proposal = validateAiProposal(
      {
        ops: [
          {
            type: 'replace',
            targetId: headingId,
            node: {
              id: headingId,
              type: 'heading',
              level: 1,
              content: [{ type: 'text', text: 'Chapter 1' }],
            },
          },
        ],
      },
      doc,
      'contributor',
    );
    expect(proposal.ok).toBe(true);
  });
});

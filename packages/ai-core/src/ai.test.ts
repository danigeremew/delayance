import { describe, expect, it } from 'vitest';
import { createEmptyDocument, generateNodeId } from '@delayance/document-model';
import { applyOperation } from '@delayance/document-engine';
import {
  parseAiProposal,
  resolveDocumentOps,
  validateAiProposal,
} from './validate';
import { synthesizeWriteOpsFromText, normalizeAiNode } from './normalize';
import { classifyAiIntent } from './intent';

function seededDoc() {
  const doc = createEmptyDocument('Test');
  const sectionId = generateNodeId();
  const headingId = generateNodeId();
  const withSection = applyOperation(doc, {
    type: 'insert',
    parentId: null,
    position: 'into',
    node: {
      id: sectionId,
      type: 'section',
      children: [],
    },
  }).document;
  const withHeading = applyOperation(withSection, {
    type: 'insert',
    parentId: sectionId,
    position: 'into',
    node: {
      id: headingId,
      type: 'heading',
      level: 1,
      content: [{ type: 'text', text: 'Hello' }],
    },
  }).document;
  return { doc: withHeading, headingId };
}

describe('ai-core validation', () => {
  it('rejects malformed ops without node', () => {
    const result = parseAiProposal({ ops: [{ type: 'replace', targetId: 'x' }] });
    expect(result.ok).toBe(false);
  });

  it('normalizes loose LLM paragraph nodes', () => {
    const node = normalizeAiNode({ type: 'paragraph', text: 'Hello world' });
    expect(node?.type).toBe('paragraph');
    expect(node && 'content' in node && node.content[0]).toMatchObject({
      type: 'text',
      text: 'Hello world',
    });
  });

  it('synthesizes write inserts from markdown answer', () => {
    const ops = synthesizeWriteOpsFromText(
      '# Portfolio\n\nBuild a strong personal site.\n\n## Projects\n\nShow your best work.',
    );
    expect(ops).toHaveLength(1);
    expect(ops[0]?.type).toBe('insert');
    const empty = createEmptyDocument();
    const applied = applyOperation(empty, ops[0]!);
    expect(applied.ok).toBe(true);
    expect(applied.document.children.length).toBeGreaterThan(0);
  });

  it('falls back to synthesized ops when write returns answer only', () => {
    const doc = createEmptyDocument();
    const result = resolveDocumentOps(
      {
        answer: '# Intro\n\nSome body text for the document.',
        ops: [],
      },
      doc,
      'owner',
      'write',
    );
    expect(result.ok).toBe(true);
    expect(result.ops.length).toBeGreaterThan(0);
  });

  it('rejects viewer accept path', () => {
    const { doc, headingId } = seededDoc();
    const result = validateAiProposal(
      {
        ops: [
          {
            type: 'replace',
            targetId: headingId,
            node: {
              id: headingId,
              type: 'heading',
              level: 1,
              content: [{ type: 'text', text: 'Hi' }],
            },
          },
        ],
      },
      doc,
      'viewer',
    );
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('Role'))).toBe(true);
  });

  it('accepts valid replace for contributor', () => {
    const { doc, headingId } = seededDoc();
    const result = validateAiProposal(
      {
        answer: 'ok',
        ops: [
          {
            type: 'replace',
            targetId: headingId,
            node: {
              id: headingId,
              type: 'heading',
              level: 1,
              content: [{ type: 'text', text: 'Hi' }],
            },
          },
        ],
      },
      doc,
      'contributor',
    );
    expect(result.ok).toBe(true);
    expect(result.ops).toHaveLength(1);
  });

  it('clears the document for remove-everything edit intents', () => {
    const { doc, headingId } = seededDoc();
    void headingId;
    const result = resolveDocumentOps(
      { answer: 'ok', ops: [] },
      doc,
      'owner',
      'edit',
      'remove everything in this page',
    );
    expect(result.ok).toBe(true);
    expect(result.ops.every((o) => o.type === 'delete')).toBe(true);
    expect(result.ops.length).toBe(doc.children.length);
  });

  it('does not synthesize inserts when edit fails', () => {
    const doc = createEmptyDocument();
    // empty doc + non-clear edit with answer-only should not invent content
    const result = resolveDocumentOps(
      { answer: 'Added a paragraph', ops: [] },
      doc,
      'owner',
      'edit',
      'fix the typo',
    );
    expect(result.ops).toHaveLength(0);
  });
});

describe('classifyAiIntent', () => {
  it('routes questions to ask', () => {
    const r = classifyAiIntent('What does section 2 say about delays?');
    expect(r.mode).toBe('ask');
    expect(r.needsClarification).toBe(false);
  });

  it('routes review prompts to review', () => {
    const r = classifyAiIntent('Review this chapter for consistency issues');
    expect(r.mode).toBe('review');
  });

  it('routes clear edit prompts to edit', () => {
    const r = classifyAiIntent('Rewrite the introduction to be shorter');
    expect(r.mode).toBe('edit');
    expect(r.needsClarification).toBe(false);
  });

  it('routes clear write prompts to write', () => {
    const r = classifyAiIntent('Draft a new section on methodology');
    expect(r.mode).toBe('write');
  });

  it('asks for clarification when edit vs write is ambiguous', () => {
    const r = classifyAiIntent('Add more detail about the claims process');
    expect(r.needsClarification).toBe(true);
    expect(r.clarification).toBe('edit_or_write');
  });

  it('clarifies vague change requests', () => {
    const r = classifyAiIntent('Make this better please');
    expect(r.needsClarification).toBe(true);
    expect(r.clarification).toBe('edit_or_write');
  });

  it('clarifies when both edit and write cues appear', () => {
    const r = classifyAiIntent('Rewrite this and also write a new appendix');
    expect(r.needsClarification).toBe(true);
  });
});

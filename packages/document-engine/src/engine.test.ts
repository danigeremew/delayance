import { describe, expect, it } from 'vitest';
import { assertStableIds, generateNodeId } from '@delayance/document-model';
import {
  applyOperation,
  buildListOfFigures,
  buildListOfTables,
  buildToc,
  computeNumbering,
  createSnapshot,
  findBrokenReferences,
  getIncomingReferences,
  resolveCrossReferences,
  restoreDocument,
  restoreSection,
  validateDocument,
} from '../src/index';
import { multiChapterFixture, type FixtureDoc } from './fixtures/multi-chapter';

function fixture(): FixtureDoc {
  return multiChapterFixture() as FixtureDoc;
}

describe('stable IDs', () => {
  it('preserves ids after move and promote/demote', () => {
    const doc = fixture();
    const { introSectionId, methodsSectionId, backgroundHeadingId } = doc._ids;

    const moved = applyOperation(doc, {
      type: 'moveSection',
      sectionId: methodsSectionId,
      parentId: null,
      position: 'before',
      referenceId: introSectionId,
    });
    expect(moved.ok).toBe(true);
    assertStableIds(doc, moved.document, [
      introSectionId,
      methodsSectionId,
      backgroundHeadingId,
      doc._ids.figAuthId,
    ]);

    const demoted = applyOperation(moved.document, {
      type: 'demoteHeading',
      headingId: backgroundHeadingId,
    });
    expect(demoted.ok).toBe(true);
    assertStableIds(moved.document, demoted.document, [backgroundHeadingId]);
  });
});

describe('heading numbering', () => {
  it('numbers nested headings by chapter', () => {
    const doc = fixture();
    const map = computeNumbering(doc);
    expect(map[doc._ids.introHeadingId]?.number).toBe('1');
    expect(map[doc._ids.backgroundHeadingId]?.number).toBe('1.1');
    expect(map[doc._ids.methodsHeadingId]?.number).toBe('2');
  });

  it('supports global figure numbering', () => {
    const doc = fixture();
    doc.template.numbering.mode = 'global';
    const map = computeNumbering(doc);
    expect(map[doc._ids.figAuthId]?.number).toBe('1');
  });
});

describe('figure and table numbering', () => {
  it('uses chapter-based numbers and updates after move', () => {
    const doc = fixture();
    let map = computeNumbering(doc);
    expect(map[doc._ids.figAuthId]?.label).toContain('Figure 1.1');
    expect(map[doc._ids.tableRolesId]?.label).toContain('Table 1.1');

    const moved = applyOperation(doc, {
      type: 'moveSection',
      sectionId: doc._ids.introSectionId,
      parentId: null,
      position: 'after',
      referenceId: doc._ids.methodsSectionId,
    });
    expect(moved.ok).toBe(true);
    map = computeNumbering(moved.document);
    expect(map[doc._ids.figAuthId]?.number).toBe('2.1');
    expect(map[doc._ids.methodsHeadingId]?.number).toBe('1');
  });
});

describe('section move', () => {
  it('moves descendants together', () => {
    const doc = fixture();
    const result = applyOperation(doc, {
      type: 'moveSection',
      sectionId: doc._ids.methodsSectionId,
      parentId: null,
      position: 'before',
      referenceId: doc._ids.introSectionId,
    });
    expect(result.ok).toBe(true);
    expect(result.document.children[0]?.id).toBe(doc._ids.methodsSectionId);
    expect(result.document.children[1]?.id).toBe(doc._ids.introSectionId);
  });
});

describe('promote and demote', () => {
  it('changes heading level', () => {
    const doc = fixture();
    const demoted = applyOperation(doc, {
      type: 'demoteHeading',
      headingId: doc._ids.backgroundHeadingId,
    });
    expect(demoted.ok).toBe(true);
    const loc = demoted.document.children[0];
    expect(loc?.type).toBe('section');
    if (loc?.type === 'section') {
      const heading = loc.children.find((c) => c.id === doc._ids.backgroundHeadingId);
      expect(heading && heading.type === 'heading' && heading.level).toBe(3);
    }

    const promoted = applyOperation(demoted.document, {
      type: 'promoteHeading',
      headingId: doc._ids.backgroundHeadingId,
    });
    expect(promoted.ok).toBe(true);
  });
});

describe('cross-references', () => {
  it('resolves labels and updates after move', () => {
    const doc = fixture();
    const before = resolveCrossReferences(doc);
    const xref = before.find((r) => r.refId === doc._ids.xrefFigId);
    expect(xref?.broken).toBe(false);
    expect(xref?.display).toContain('Figure 1.1');

    const moved = applyOperation(doc, {
      type: 'moveSection',
      sectionId: doc._ids.introSectionId,
      parentId: null,
      position: 'after',
      referenceId: doc._ids.methodsSectionId,
    });
    const after = resolveCrossReferences(moved.document);
    const xrefAfter = after.find((r) => r.refId === doc._ids.xrefFigId);
    expect(xrefAfter?.display).toContain('Figure 2.1');
  });

  it('detects broken references after forced delete', () => {
    const doc = fixture();
    expect(getIncomingReferences(doc, doc._ids.figAuthId)).toContain(doc._ids.xrefFigId);

    const blocked = applyOperation(doc, {
      type: 'delete',
      targetId: doc._ids.figAuthId,
    });
    expect(blocked.ok).toBe(false);
    expect(blocked.warnings.length).toBeGreaterThan(0);

    const deleted = applyOperation(doc, {
      type: 'delete',
      targetId: doc._ids.figAuthId,
      force: true,
    });
    expect(deleted.ok).toBe(true);
    const broken = findBrokenReferences(deleted.document);
    expect(broken.some((r) => r.refId === doc._ids.xrefFigId && r.broken)).toBe(true);
  });
});

describe('validation', () => {
  it('flags heading jumps and manual numbering', () => {
    const doc = fixture();
    // Insert bad jump heading under intro
    const inserted = applyOperation(doc, {
      type: 'insert',
      parentId: doc._ids.introSectionId,
      position: 'into',
      node: {
        id: generateNodeId(),
        type: 'heading',
        level: 5,
        content: [{ type: 'text', text: 'Too deep' }],
      },
    });
    const withManual = applyOperation(inserted.document, {
      type: 'insert',
      parentId: doc._ids.introSectionId,
      position: 'into',
      node: {
        id: generateNodeId(),
        type: 'paragraph',
        content: [{ type: 'text', text: '1.2 Manual heading text' }],
      },
    });
    const issues = validateDocument(withManual.document);
    expect(issues.some((i) => i.code === 'invalid_heading_jump')).toBe(true);
    expect(issues.some((i) => i.code === 'manual_numbering')).toBe(true);
  });
});

describe('versions', () => {
  it('restores full document and a section', () => {
    const doc = fixture();
    const snap = createSnapshot(doc, { name: 'v1', reason: 'checkpoint' });

    const mutated = applyOperation(doc, {
      type: 'delete',
      targetId: doc._ids.methodsSectionId,
      force: true,
    });
    expect(mutated.document.children).toHaveLength(1);

    const restored = restoreDocument(snap);
    expect(restored.children).toHaveLength(2);

    const sectionRestored = restoreSection(mutated.document, snap, doc._ids.methodsSectionId);
    expect(sectionRestored.children.some((c) => c.id === doc._ids.methodsSectionId)).toBe(true);
  });
});

describe('generated lists', () => {
  it('builds TOC, LOF, LOT', () => {
    const doc = fixture();
    const toc = buildToc(doc);
    expect(toc.length).toBeGreaterThanOrEqual(3);
    expect(buildListOfFigures(doc).length).toBe(2);
    expect(buildListOfTables(doc).length).toBe(1);
  });
});

describe('insert and replace', () => {
  it('inserts and replaces nodes', () => {
    const doc = fixture();
    const newParaId = generateNodeId();
    const inserted = applyOperation(doc, {
      type: 'insert',
      parentId: doc._ids.methodsSectionId,
      position: 'into',
      node: {
        id: newParaId,
        type: 'paragraph',
        content: [{ type: 'text', text: 'New' }],
      },
    });
    expect(inserted.ok).toBe(true);

    const replaced = applyOperation(inserted.document, {
      type: 'replace',
      targetId: newParaId,
      node: {
        id: newParaId,
        type: 'paragraph',
        content: [{ type: 'text', text: 'Updated' }],
      },
    });
    expect(replaced.ok).toBe(true);
  });
});

import type { Document, DocNode, HeadingLevel, HeadingNode } from '@delayance/document-model';
import { getIncomingReferences } from './cross-references';
import type { ApplyResult, DocumentOperation } from './types';
import {
  findNode,
  getChildrenArray,
  insertAt,
  mutateDocument,
  removeNode,
} from './tree';

export function applyOperation(doc: Document, op: DocumentOperation): ApplyResult {
  switch (op.type) {
    case 'insert':
      return applyInsert(doc, op);
    case 'replace':
      return applyReplace(doc, op);
    case 'delete':
      return applyDelete(doc, op);
    case 'moveSection':
      return applyMoveSection(doc, op);
    case 'promoteHeading':
      return applyHeadingLevel(doc, op.headingId, -1);
    case 'demoteHeading':
      return applyHeadingLevel(doc, op.headingId, 1);
    default:
      return { ok: false, document: doc, warnings: [], error: 'Unknown operation' };
  }
}

function applyInsert(
  doc: Document,
  op: Extract<DocumentOperation, { type: 'insert' }>,
): ApplyResult {
  try {
    const next = mutateDocument(doc, (draft) => {
      if (op.position === 'into') {
        const children = getChildrenArray(draft, op.parentId);
        if (!children) throw new Error('Invalid parent for insert');
        if (op.referenceId) {
          if (!insertAt(children, op.node, 'after', op.referenceId)) {
            throw new Error('Reference node not found in parent');
          }
        } else {
          children.push(op.node);
        }
        return;
      }

      if (op.parentId === null) {
        if (!insertAt(draft.children, op.node, op.position, op.referenceId)) {
          throw new Error('Reference node not found');
        }
        return;
      }

      const children = getChildrenArray(draft, op.parentId);
      if (!children) throw new Error('Invalid parent for insert');
      if (!insertAt(children, op.node, op.position, op.referenceId)) {
        throw new Error('Reference node not found in parent');
      }
    });
    return { ok: true, document: next, warnings: [] };
  } catch (err) {
    return {
      ok: false,
      document: doc,
      warnings: [],
      error: err instanceof Error ? err.message : 'Insert failed',
    };
  }
}

function applyReplace(
  doc: Document,
  op: Extract<DocumentOperation, { type: 'replace' }>,
): ApplyResult {
  try {
    const next = mutateDocument(doc, (draft) => {
      const loc = findNode(draft, op.targetId);
      if (!loc) throw new Error('Target not found');
      if (op.node.id !== op.targetId) {
        throw new Error('Replace must keep the same node id');
      }
      loc.parent[loc.index] = op.node;
    });
    return { ok: true, document: next, warnings: [] };
  } catch (err) {
    return {
      ok: false,
      document: doc,
      warnings: [],
      error: err instanceof Error ? err.message : 'Replace failed',
    };
  }
}

function applyDelete(
  doc: Document,
  op: Extract<DocumentOperation, { type: 'delete' }>,
): ApplyResult {
  const referencingIds = getIncomingReferences(doc, op.targetId);
  const warnings =
    referencingIds.length > 0
      ? [
          {
            targetId: op.targetId,
            referencingIds,
            message: `Node is referenced by ${referencingIds.length} cross-reference(s)`,
          },
        ]
      : [];

  if (referencingIds.length > 0 && !op.force) {
    return { ok: false, document: doc, warnings, error: 'Deletion blocked: node is referenced' };
  }

  try {
    const next = mutateDocument(doc, (draft) => {
      const removed = removeNode(draft, op.targetId);
      if (!removed) throw new Error('Target not found');
    });
    return { ok: true, document: next, warnings };
  } catch (err) {
    return {
      ok: false,
      document: doc,
      warnings,
      error: err instanceof Error ? err.message : 'Delete failed',
    };
  }
}

function applyMoveSection(
  doc: Document,
  op: Extract<DocumentOperation, { type: 'moveSection' }>,
): ApplyResult {
  try {
    const next = mutateDocument(doc, (draft) => {
      const loc = findNode(draft, op.sectionId);
      if (!loc) throw new Error('Section not found');
      if (loc.node.type !== 'section' && loc.node.type !== 'appendix') {
        throw new Error('moveSection requires a section or appendix');
      }

      // Prevent moving into itself
      if (op.parentId === op.sectionId) {
        throw new Error('Cannot move section into itself');
      }

      const [section] = loc.parent.splice(loc.index, 1) as DocNode[];
      if (!section) throw new Error('Failed to detach section');

      if (op.position === 'into') {
        const children = getChildrenArray(draft, op.parentId);
        if (!children) throw new Error('Invalid parent for move');
        if (isDescendant(section, op.parentId)) {
          throw new Error('Cannot move section into its descendant');
        }
        children.push(section);
        return;
      }

      const children = getChildrenArray(draft, op.parentId);
      if (!children) throw new Error('Invalid parent for move');
      if (op.parentId && isDescendant(section, op.parentId)) {
        throw new Error('Cannot move section into its descendant');
      }
      if (!insertAt(children, section, op.position, op.referenceId)) {
        throw new Error('Reference node not found for move');
      }
    });
    return { ok: true, document: next, warnings: [] };
  } catch (err) {
    return {
      ok: false,
      document: doc,
      warnings: [],
      error: err instanceof Error ? err.message : 'Move failed',
    };
  }
}

function isDescendant(root: DocNode, maybeChildId: string | null): boolean {
  if (!maybeChildId) return false;
  if (root.id === maybeChildId) return true;
  if (root.type === 'section' || root.type === 'appendix') {
    return root.children.some((c) => isDescendant(c, maybeChildId));
  }
  return false;
}

function applyHeadingLevel(doc: Document, headingId: string, delta: number): ApplyResult {
  try {
    const next = mutateDocument(doc, (draft) => {
      const loc = findNode(draft, headingId);
      if (!loc || loc.node.type !== 'heading') {
        throw new Error('Heading not found');
      }
      const heading = loc.node as HeadingNode;
      const newLevel = (heading.level + delta) as number;
      if (newLevel < 1 || newLevel > 6) {
        throw new Error('Heading level out of range');
      }
      heading.level = newLevel as HeadingLevel;
    });
    return { ok: true, document: next, warnings: [] };
  } catch (err) {
    return {
      ok: false,
      document: doc,
      warnings: [],
      error: err instanceof Error ? err.message : 'Heading level change failed',
    };
  }
}

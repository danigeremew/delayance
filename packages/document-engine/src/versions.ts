import {
  cloneDocument,
  generateNodeId,
  type Document,
  type DocNode,
  type SectionNode,
} from '@delayance/document-model';
import type { VersionSnapshot, VersionSnapshotMeta } from './types';
import { findNode, mutateDocument } from './tree';

export function createSnapshot(doc: Document, meta: Omit<VersionSnapshotMeta, 'createdAt'> & { createdAt?: string }): VersionSnapshot {
  return {
    id: generateNodeId(),
    meta: {
      name: meta.name,
      reason: meta.reason,
      createdAt: meta.createdAt ?? new Date().toISOString(),
    },
    document: cloneDocument(doc),
  };
}

export function restoreDocument(snapshot: VersionSnapshot): Document {
  return cloneDocument(snapshot.document);
}

export function restoreSection(
  currentDoc: Document,
  snapshot: VersionSnapshot,
  sectionId: string,
): Document {
  const snapLoc = findNode(snapshot.document, sectionId);
  if (!snapLoc || (snapLoc.node.type !== 'section' && snapLoc.node.type !== 'appendix')) {
    throw new Error(`Section ${sectionId} not found in snapshot`);
  }

  return mutateDocument(currentDoc, (draft) => {
    const currentLoc = findNode(draft, sectionId);
    if (!currentLoc) {
      // Insert at root if missing
      draft.children.push(cloneDocument(snapLoc.node));
      return;
    }
    currentLoc.parent[currentLoc.index] = cloneDocument(snapLoc.node) as DocNode;
  });
}

export function extractSection(doc: Document, sectionId: string): SectionNode | null {
  const loc = findNode(doc, sectionId);
  if (!loc || loc.node.type !== 'section') return null;
  return cloneDocument(loc.node);
}

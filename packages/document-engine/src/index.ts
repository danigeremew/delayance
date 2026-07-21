export type {
  ApplyResult,
  DeletionWarning,
  DocumentOperation,
  InsertPosition,
  ListOfEntry,
  NumberingEntry,
  NumberingMap,
  ResolvedRef,
  TocEntry,
  ValidationIssue,
  VersionSnapshot,
  VersionSnapshotMeta,
} from './types';

export { applyOperation } from './operations';
export {
  buildListOfFigures,
  buildListOfTables,
  buildToc,
  computeNumbering,
} from './numbering';
export {
  findBrokenReferences,
  getIncomingReferences,
  resolveCrossReferences,
} from './cross-references';
export { validateDocument } from './validation';
export { createSnapshot, restoreDocument, restoreSection, extractSection } from './versions';
export { findNode, walkNodes } from './tree';

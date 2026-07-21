import type { DocNode, Document, HeadingLevel } from '@delayance/document-model';

export type InsertPosition = 'before' | 'after' | 'into';

export type DocumentOperation =
  | {
      type: 'insert';
      parentId: string | null;
      referenceId?: string;
      position: InsertPosition;
      node: DocNode;
    }
  | {
      type: 'replace';
      targetId: string;
      node: DocNode;
    }
  | {
      type: 'delete';
      targetId: string;
      force?: boolean;
    }
  | {
      type: 'moveSection';
      sectionId: string;
      parentId: string | null;
      referenceId?: string;
      position: InsertPosition;
    }
  | {
      type: 'promoteHeading';
      headingId: string;
    }
  | {
      type: 'demoteHeading';
      headingId: string;
    };

export interface DeletionWarning {
  targetId: string;
  referencingIds: string[];
  message: string;
}

export interface ApplyResult {
  ok: boolean;
  document: Document;
  warnings: DeletionWarning[];
  error?: string;
}

export interface NumberingEntry {
  nodeId: string;
  kind: 'heading' | 'figure' | 'table' | 'equation' | 'appendix' | 'footnote' | 'section';
  number: string;
  label: string;
  title?: string;
  level?: HeadingLevel;
  chapterNumber?: string;
}

export type NumberingMap = Record<string, NumberingEntry>;

export interface ResolvedRef {
  refId: string;
  targetId: string;
  display: string;
  broken: boolean;
}

export type ValidationSeverity = 'error' | 'warning';

export interface ValidationIssue {
  code: string;
  severity: ValidationSeverity;
  message: string;
  nodeId?: string;
}

export interface VersionSnapshotMeta {
  name?: string;
  createdAt: string;
  reason?: string;
}

export interface VersionSnapshot {
  id: string;
  meta: VersionSnapshotMeta;
  document: Document;
}

export interface TocEntry {
  targetId: string;
  level: HeadingLevel;
  number: string;
  title: string;
}

export interface ListOfEntry {
  targetId: string;
  number: string;
  title: string;
}

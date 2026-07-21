import type { Document, DocumentTemplate } from '@delayance/document-model';

export type ImportMode = 'preserve' | 'normalize';

export type CompatibilitySeverity = 'supported' | 'converted' | 'unsupported';

export interface CompatibilityItem {
  severity: CompatibilitySeverity;
  code: string;
  message: string;
  sourceHint?: string;
}

export interface CompatibilityReport {
  items: CompatibilityItem[];
  supportedCount: number;
  convertedCount: number;
  unsupportedCount: number;
}

export interface StyleMapping {
  sourceStyle: string;
  targetStyle: string;
}

export interface ImportOptions {
  mode: ImportMode;
  styleMap?: StyleMapping[];
  removeHeadersFooters?: boolean;
  removeSourceFonts?: boolean;
  normalizeSpacing?: boolean;
  convertManualNumbering?: boolean;
  useProjectPageSettings?: boolean;
}

export interface ExtractedMedia {
  name: string;
  contentType: string;
  data: Buffer;
}

export interface ImportResult {
  document: Document;
  styleMap: StyleMapping[];
  compatibilityReport: CompatibilityReport;
  extractedMedia: ExtractedMedia[];
}

export interface ExportOptions {
  includeTocField?: boolean;
  includePageNumberFields?: boolean;
}

export interface ExportResult {
  buffer: Buffer;
  compatibilityReport: CompatibilityReport;
}

export interface NormalizePreview {
  issues: CompatibilityItem[];
  document: Document;
}

export type { Document, DocumentTemplate };

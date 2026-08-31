import { createHash } from 'node:crypto';
import { XMLParser } from 'fast-xml-parser';
import JSZip from 'jszip';
import type { AnalysisNode, DocumentAnalysis } from '@delayance/document-model';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
});

function asArray<T>(value: T | T[] | undefined | null): T[] {
  return value === undefined || value === null ? [] : Array.isArray(value) ? value : [value];
}

function textFrom(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  const row = value as Record<string, unknown>;
  return typeof row['#text'] === 'string' ? row['#text'] : '';
}

function paragraphText(paragraph: Record<string, unknown>): string {
  return asArray(paragraph.r as Record<string, unknown> | Record<string, unknown>[])
    .map((run) => textFrom(run.t))
    .join('');
}

function paragraphStyle(paragraph: Record<string, unknown>): string {
  const props = paragraph.pPr as Record<string, unknown> | undefined;
  const style = props?.pStyle as Record<string, unknown> | undefined;
  return String(style?.['@_val'] ?? '');
}

function headingLevel(style: string): number | undefined {
  const match = /(?:heading|h)\s*([1-6])/i.exec(style);
  return match ? Number(match[1]) : undefined;
}

function metadataValue(value: unknown): string | undefined {
  const text = textFrom(value).trim();
  return text || undefined;
}

/** Extracts intelligence data without attempting to recreate DOCX layout or styles. */
export async function extractDocumentAnalysis(buffer: Buffer): Promise<DocumentAnalysis> {
  const fileHash = createHash('sha256').update(buffer).digest('hex');
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = await zip.file('word/document.xml')?.async('string');
  if (!documentXml) throw new Error('Not a DOCX file: word/document.xml is missing');

  const document = (parser.parse(documentXml) as Record<string, unknown>).document as
    | Record<string, unknown>
    | undefined;
  const body = document?.body as Record<string, unknown> | undefined;
  const nodes: AnalysisNode[] = [];
  let paragraphIndex = 0;
  let tableCount = 0;
  let figureCount = 0;

  for (const paragraph of asArray(body?.p as Record<string, unknown> | Record<string, unknown>[])) {
    const text = paragraphText(paragraph).trim();
    const level = headingLevel(paragraphStyle(paragraph));
    const bookmark = asArray(
      paragraph.bookmarkStart as Record<string, unknown> | Record<string, unknown>[],
    )
      .map((entry) => String(entry['@_name'] ?? ''))
      .find(Boolean);
    if (text) {
      nodes.push({
        id: `p:${paragraphIndex}`,
        kind: level ? 'heading' : 'paragraph',
        text,
        ...(level ? { level } : {}),
        location: bookmark
          ? { kind: 'bookmark', value: bookmark, excerpt: text.slice(0, 240) }
          : { kind: level ? 'heading' : 'paragraph', value: String(paragraphIndex), excerpt: text.slice(0, 240) },
      });
      if (/\b(?:figure|fig\.)\b/i.test(text)) figureCount++;
    }
    paragraphIndex++;
  }

  for (const table of asArray(body?.tbl as Record<string, unknown> | Record<string, unknown>[])) {
    const text = asArray(table.tr as Record<string, unknown> | Record<string, unknown>[])
      .flatMap((row) => asArray(row.tc as Record<string, unknown> | Record<string, unknown>[]))
      .flatMap((cell) => asArray(cell.p as Record<string, unknown> | Record<string, unknown>[]))
      .map(paragraphText)
      .filter(Boolean)
      .join(' | ');
    nodes.push({
      id: `t:${tableCount}`,
      kind: 'table',
      text,
      location: { kind: 'table', value: String(tableCount), excerpt: text.slice(0, 240) },
    });
    tableCount++;
  }

  const commentsXml = await zip.file('word/comments.xml')?.async('string');
  const commentsRoot = commentsXml
    ? ((parser.parse(commentsXml) as Record<string, unknown>).comments as Record<string, unknown> | undefined)
    : undefined;
  const commentCount = asArray(commentsRoot?.comment as Record<string, unknown> | Record<string, unknown>[]).length;
  const coreXml = await zip.file('docProps/core.xml')?.async('string');
  const core = coreXml
    ? ((parser.parse(coreXml) as Record<string, unknown>).coreProperties as Record<string, unknown> | undefined)
    : undefined;
  const keywords = metadataValue(core?.keywords)
    ?.split(/[;,]/)
    .map((keyword) => keyword.trim())
    .filter(Boolean) ?? [];

  return {
    schemaVersion: 1,
    fileHash,
    extractedAt: new Date().toISOString(),
    ...(metadataValue(core?.title) ? { title: metadataValue(core?.title) } : {}),
    metadata: {
      ...(metadataValue(core?.creator) ? { author: metadataValue(core?.creator) } : {}),
      ...(metadataValue(core?.subject) ? { subject: metadataValue(core?.subject) } : {}),
      keywords,
    },
    nodes,
    plainText: nodes.map((node) => node.text).filter(Boolean).join('\n'),
    headingCount: nodes.filter((node) => node.kind === 'heading').length,
    tableCount,
    figureCount,
    commentCount,
  };
}

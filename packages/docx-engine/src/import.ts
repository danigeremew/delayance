import { XMLParser } from 'fast-xml-parser';
import JSZip from 'jszip';
import {
  createEmptyDocument,
  defaultTemplate,
  generateNodeId,
  type Document,
  type DocNode,
  type HeadingLevel,
  type InlineNode,
} from '@delayance/document-model';
import { buildReport } from './compatibility';
import type {
  CompatibilityItem,
  ImportOptions,
  ImportResult,
  StyleMapping,
} from './types';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
});

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function textFromRuns(runs: unknown): InlineNode[] {
  const texts: InlineNode[] = [];
  for (const run of asArray(runs as Record<string, unknown>)) {
    const r = run as Record<string, unknown>;
    const t = r.t;
    const raw =
      typeof t === 'string'
        ? t
        : t && typeof t === 'object' && '#text' in (t as object)
          ? String((t as { '#text'?: string })['#text'] ?? '')
          : '';
    if (!raw) continue;
    const rPr = r.rPr as Record<string, unknown> | undefined;
    const marks: Array<'bold' | 'italic' | 'underline'> = [];
    if (rPr?.b !== undefined) marks.push('bold');
    if (rPr?.i !== undefined) marks.push('italic');
    if (rPr?.u !== undefined) marks.push('underline');
    texts.push({ type: 'text', text: raw, ...(marks.length ? { marks } : {}) });
  }
  return texts.length ? texts : [{ type: 'text', text: '' }];
}

function styleIdOf(pPr: Record<string, unknown> | undefined): string {
  const pStyle = pPr?.pStyle as Record<string, unknown> | undefined;
  return String(pStyle?.['@_val'] ?? 'Normal');
}

function headingLevelFromStyle(styleId: string, mode: ImportOptions['mode']): HeadingLevel | null {
  const match = /heading\s*([1-6])/i.exec(styleId) || /^h([1-6])$/i.exec(styleId);
  if (match) return Number(match[1]) as HeadingLevel;
  if (mode === 'normalize' && /title/i.test(styleId)) return 1;
  return null;
}

function paragraphToNode(
  p: Record<string, unknown>,
  options: ImportOptions,
  items: CompatibilityItem[],
): DocNode {
  const pPr = p.pPr as Record<string, unknown> | undefined;
  const styleId = styleIdOf(pPr);
  const content = textFromRuns(p.r);
  const plain = content.map((c) => (c.type === 'text' ? c.text : '')).join('');

  if (/^\d+(\.\d+)*\s+\S/.test(plain.trim()) || /^Figure\s+\d+/i.test(plain) || /^Table\s+\d+/i.test(plain)) {
    items.push({
      severity: 'converted',
      code: 'manual_numbering_detected',
      message: 'Manual numbering or caption text detected',
      sourceHint: plain.slice(0, 80),
    });
  }

  const level = headingLevelFromStyle(styleId, options.mode);
  if (level) {
    items.push({
      severity: 'supported',
      code: 'heading_mapped',
      message: `Mapped style ${styleId} to heading level ${level}`,
    });
    return {
      id: generateNodeId(),
      type: 'heading',
      level,
      content,
    };
  }

  return {
    id: generateNodeId(),
    type: 'paragraph',
    content,
  };
}

function tableToNode(tbl: Record<string, unknown>, items: CompatibilityItem[]): DocNode {
  items.push({
    severity: 'supported',
    code: 'table_imported',
    message: 'Table imported',
  });
  const rows = asArray(tbl.tr as Record<string, unknown>);
  return {
    id: generateNodeId(),
    type: 'table',
    rows: rows.map((row, rowIndex) => {
      const rowObj = row as Record<string, unknown>;
      return {
        id: generateNodeId(),
        isHeader: rowIndex === 0,
        cells: asArray(rowObj.tc as Record<string, unknown>).map((cell) => {
          const cellObj = cell as Record<string, unknown>;
          return {
            id: generateNodeId(),
            content: asArray(cellObj.p as Record<string, unknown>).map((p) =>
              paragraphToNode(p as Record<string, unknown>, { mode: 'normalize' }, items),
            ),
          };
        }),
      };
    }),
  };
}

export async function importDocx(
  buffer: Buffer,
  options: ImportOptions,
  template = defaultTemplate(),
): Promise<ImportResult> {
  const items: CompatibilityItem[] = [];
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = await zip.file('word/document.xml')?.async('string');
  if (!documentXml) {
    throw new Error('Invalid DOCX: missing word/document.xml');
  }

  const stylesXml = await zip.file('word/styles.xml')?.async('string');
  if (!stylesXml) {
    items.push({
      severity: 'converted',
      code: 'styles_missing',
      message: 'styles.xml missing; using defaults',
    });
  }

  // Detect unsupported features heuristically
  if (documentXml.includes('w:object') || documentXml.includes('w:oxml')) {
    items.push({
      severity: 'unsupported',
      code: 'embedded_object',
      message: 'Embedded objects may not be preserved',
    });
  }
  if (documentXml.includes('v:shape') || documentXml.includes('wps:wsp')) {
    items.push({
      severity: 'converted',
      code: 'floating_shape',
      message: 'Floating shapes converted or skipped',
    });
  }

  const parsed = parser.parse(documentXml);
  const body = parsed?.document?.body ?? {};
  const children: DocNode[] = [];
  const blocks = [
    ...asArray(body.p as Record<string, unknown>).map((p) => ({ kind: 'p' as const, p })),
    ...asArray(body.tbl as Record<string, unknown>).map((tbl) => ({ kind: 'tbl' as const, tbl })),
  ];

  // Preserve document order by walking body keys in XML is hard with parser;
  // Prefer sequential scan of body children if present as array.
  const bodyChildren = body['#text'] ? [] : Object.entries(body);
  const ordered: DocNode[] = [];

  if (Array.isArray(body.p) || body.p || body.tbl) {
    const tagRegex = /<(w:p|w:tbl)\b[\s\S]*?<\/\1>/g;
    const matches = documentXml.match(tagRegex) ?? [];
    for (const chunk of matches) {
      const local = parser.parse(`<root>${chunk.replace(/<(\/?)w:/g, '<$1')}</root>`) as {
        root?: { p?: Record<string, unknown>; tbl?: Record<string, unknown> };
      };
      if (local.root?.p) {
        ordered.push(paragraphToNode(local.root.p, options, items));
      } else if (local.root?.tbl) {
        ordered.push(tableToNode(local.root.tbl, items));
      }
    }
  }

  if (!ordered.length) {
    for (const block of blocks) {
      if (block.kind === 'p') ordered.push(paragraphToNode(block.p as Record<string, unknown>, options, items));
      else ordered.push(tableToNode(block.tbl as Record<string, unknown>, items));
    }
  }

  // silence unused
  void bodyChildren;

  // Group into sections by heading level 1 when normalizing
  let documentChildren: DocNode[] = ordered;
  if (options.mode === 'normalize') {
    const sections: DocNode[] = [];
    let current: { id: string; type: 'section'; children: DocNode[] } | null = null;
    for (const node of ordered) {
      if (node.type === 'heading' && node.level === 1) {
        current = { id: generateNodeId(), type: 'section', children: [node] };
        sections.push(current);
      } else if (current) {
        current.children.push(node);
      } else {
        current = {
          id: generateNodeId(),
          type: 'section',
          children: [
            {
              id: generateNodeId(),
              type: 'heading',
              level: 1,
              content: [{ type: 'text', text: 'Imported content' }],
            },
            node,
          ],
        };
        sections.push(current);
      }
    }
    documentChildren = sections.length ? sections : ordered;
    items.push({
      severity: 'converted',
      code: 'normalized_sections',
      message: 'Content grouped into sections by Heading 1',
    });
  }

  if (options.removeHeadersFooters) {
    items.push({
      severity: 'converted',
      code: 'headers_footers_removed',
      message: 'Source headers and footers ignored',
    });
  }

  const extractedMedia: ImportResult['extractedMedia'] = [];
  const mediaFolder = zip.folder('word/media');
  if (mediaFolder) {
    const files = Object.keys(zip.files).filter((n) => n.startsWith('word/media/'));
    for (const name of files) {
      const file = zip.file(name);
      if (!file || file.dir) continue;
      const data = Buffer.from(await file.async('uint8array'));
      extractedMedia.push({
        name: name.replace('word/media/', ''),
        contentType: name.endsWith('.png')
          ? 'image/png'
          : name.endsWith('.jpg') || name.endsWith('.jpeg')
            ? 'image/jpeg'
            : 'application/octet-stream',
        data,
      });
      items.push({
        severity: 'supported',
        code: 'media_extracted',
        message: `Extracted media ${name}`,
      });
    }
  }

  const styleMap: StyleMapping[] = [
    { sourceStyle: 'Heading1', targetStyle: 'heading:1' },
    { sourceStyle: 'Heading2', targetStyle: 'heading:2' },
    { sourceStyle: 'Normal', targetStyle: 'paragraph' },
    ...(options.styleMap ?? []),
  ];

  const doc: Document = createEmptyDocument('Imported document');
  doc.template = options.useProjectPageSettings === false ? doc.template : template;
  if (options.mode === 'normalize' && options.removeSourceFonts !== false) {
    doc.template = structuredClone(template);
  }
  doc.children = documentChildren;

  return {
    document: doc,
    styleMap,
    compatibilityReport: buildReport(items),
    extractedMedia,
  };
}

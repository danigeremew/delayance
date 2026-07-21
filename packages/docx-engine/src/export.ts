import JSZip from 'jszip';
import {
  textFromInlines,
  type Document,
  type DocNode,
  type InlineNode,
} from '@delayance/document-model';
import { computeNumbering, validateDocument } from '@delayance/document-engine';
import { buildReport } from './compatibility';
import type { CompatibilityItem, ExportOptions, ExportResult } from './types';

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function runsXml(inlines: InlineNode[]): string {
  return inlines
    .map((inline) => {
      if (inline.type === 'link') return runsXml(inline.content);
      const bold = inline.marks?.includes('bold') ? '<w:b/>' : '';
      const italic = inline.marks?.includes('italic') ? '<w:i/>' : '';
      const underline = inline.marks?.includes('underline') ? '<w:u w:val="single"/>' : '';
      return `<w:r><w:rPr>${bold}${italic}${underline}</w:rPr><w:t xml:space="preserve">${escapeXml(inline.text)}</w:t></w:r>`;
    })
    .join('');
}

function bookmark(id: string, inner: string): string {
  const safe = id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
  return `<w:bookmarkStart w:id="${safe}" w:name="${safe}"/>${inner}<w:bookmarkEnd w:id="${safe}"/>`;
}

function field(instr: string): string {
  return `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve">${escapeXml(instr)}</w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t> </w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>`;
}

function nodeToParagraphs(node: DocNode, numbering: ReturnType<typeof computeNumbering>): string {
  switch (node.type) {
    case 'section':
    case 'appendix':
      return node.children.map((c) => nodeToParagraphs(c, numbering)).join('');
    case 'heading': {
      const style = `Heading${Math.min(node.level, 3)}`;
      const label = numbering[node.id]?.number;
      const text = textFromInlines(node.content);
      const display = label ? `${label} ${text}` : text;
      const p = `<w:p><w:pPr><w:pStyle w:val="${style}"/><w:keepNext/></w:pPr>${runsXml([{ type: 'text', text: display }])}</w:p>`;
      return bookmark(node.id, p);
    }
    case 'paragraph':
      return `<w:p><w:pPr><w:pStyle w:val="Normal"/></w:pPr>${runsXml(node.content)}</w:p>`;
    case 'quote':
      return `<w:p><w:pPr><w:pStyle w:val="Quote"/></w:pPr>${runsXml(node.content)}</w:p>`;
    case 'crossReference': {
      const name = node.targetId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
      return `<w:p>${field(` REF ${name} \\h `)}</w:p>`;
    }
    case 'pageBreak':
      return `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;
    case 'figure': {
      const caption = node.caption ? textFromInlines(node.caption.content) : '';
      const num = numbering[node.id]?.label ?? 'Figure';
      return bookmark(
        node.id,
        `<w:p><w:r><w:t>[Figure]</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="Caption"/></w:pPr>${runsXml([{ type: 'text', text: `${num}: ${caption}` }])}</w:p>`,
      );
    }
    case 'table': {
      const rows = node.rows
        .map((row) => {
          const cellXml = row.cells
            .map((cell) => {
              const paras =
                cell.content.map((c) => nodeToParagraphs(c, numbering)).join('') ||
                '<w:p><w:r><w:t></w:t></w:r></w:p>';
              return `<w:tc><w:tcPr/>${paras}</w:tc>`;
            })
            .join('');
          return `<w:tr>${row.isHeader ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${cellXml}</w:tr>`;
        })
        .join('');
      const caption = node.caption
        ? `<w:p><w:pPr><w:pStyle w:val="Caption"/></w:pPr>${runsXml([
            {
              type: 'text',
              text: `${numbering[node.id]?.label ?? 'Table'}: ${textFromInlines(node.caption.content)}`,
            },
          ])}</w:p>`
        : '';
      return bookmark(node.id, `${caption}<w:tbl><w:tblPr/><w:tblGrid/>${rows}</w:tbl>`);
    }
    case 'list':
      return node.items
        .map((item) => {
          const inner = item.content.map((c) => nodeToParagraphs(c, numbering)).join('');
          return inner.includes('<w:pPr>')
            ? inner
            : inner.replace(
                '<w:p>',
                '<w:p><w:pPr><w:pStyle w:val="ListParagraph"/></w:pPr>',
              );
        })
        .join('');
    case 'equation':
      return `<w:p><w:r><w:t>${escapeXml(node.latex)}</w:t></w:r></w:p>`;
    case 'footnote':
      return `<w:p><w:r><w:t>${escapeXml(textFromInlines(node.content))}</w:t></w:r></w:p>`;
    default:
      return '';
  }
}

function stylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:outlineLvl w:val="1"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:outlineLvl w:val="2"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="caption"/><w:basedOn w:val="Normal"/><w:qFormat/></w:style>
  <w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/></w:style>
  <w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/></w:style>
</w:styles>`;
}

function numberingXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="0">
    <w:multiLevelType w:val="hybridMultilevel"/>
    <w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl>
    <w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1.%2"/><w:pPr><w:ind w:left="1440" w:hanging="360"/></w:pPr></w:lvl>
  </w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
</w:numbering>`;
}

export async function exportDocx(doc: Document, options: ExportOptions = {}): Promise<ExportResult> {
  const items: CompatibilityItem[] = [];
  const numbering = computeNumbering(doc);
  for (const issue of validateDocument(doc)) {
    items.push({
      severity: issue.severity === 'error' ? 'unsupported' : 'converted',
      code: issue.code,
      message: issue.message,
    });
  }

  const bodyParts: string[] = [];
  if (options.includeTocField !== false) {
    bodyParts.push(
      `<w:p><w:r><w:t>Table of Contents</w:t></w:r></w:p><w:p>${field(' TOC \\o "1-3" \\h \\z \\u ')}</w:p>`,
    );
  }
  for (const child of doc.children) {
    bodyParts.push(nodeToParagraphs(child, numbering));
  }

  items.push(
    { severity: 'supported', code: 'heading_styles', message: 'Heading styles emitted' },
    { severity: 'supported', code: 'xref_fields', message: 'Cross-references as REF fields' },
    { severity: 'supported', code: 'page_number_field', message: 'PAGE field in footer' },
    { severity: 'supported', code: 'toc_field', message: 'TOC field included' },
  );

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    ${bodyParts.join('\n')}
    <w:sectPr>
      <w:footerReference w:type="default" r:id="rId2"/>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  const footerXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p><w:pPr><w:jc w:val="center"/></w:pPr>${field(' PAGE ')}</w:p>
</w:ftr>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
  <Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
</Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
</Relationships>`;

  const zip = new JSZip();
  zip.file('[Content_Types].xml', contentTypes);
  zip.folder('_rels')?.file('.rels', rels);
  const word = zip.folder('word');
  word?.file('document.xml', documentXml);
  word?.file('styles.xml', stylesXml());
  word?.file('numbering.xml', numberingXml());
  word?.file('footer1.xml', footerXml);
  word?.folder('_rels')?.file('document.xml.rels', docRels);

  const buffer = Buffer.from(await zip.generateAsync({ type: 'uint8array' }));
  return { buffer, compatibilityReport: buildReport(items) };
}

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export type NumberingMode = 'global' | 'byChapter';

export type InlineMark = 'bold' | 'italic' | 'underline';

export interface TextInline {
  type: 'text';
  text: string;
  marks?: InlineMark[];
}

export interface LinkInline {
  type: 'link';
  href: string;
  content: TextInline[];
}

export type InlineNode = TextInline | LinkInline;

export interface DocumentTemplate {
  page: {
    size: 'a4' | 'letter';
    orientation: 'portrait' | 'landscape';
    margins: { top: number; right: number; bottom: number; left: number };
  };
  typography: {
    bodyFont: string;
    headingFont: string;
    bodySizePt: number;
    headingSizesPt: Record<HeadingLevel, number>;
    lineSpacing: number;
    paragraphSpacingPt: number;
  };
  numbering: {
    mode: NumberingMode;
    headingFormat: string;
    figureFormat: string;
    tableFormat: string;
    equationFormat: string;
    appendixFormat: string;
    footnoteFormat: string;
  };
  captions: {
    figurePosition: 'above' | 'below';
    tablePosition: 'above' | 'below';
  };
}

export interface BaseNode {
  id: string;
}

export interface SectionNode extends BaseNode {
  type: 'section';
  locked?: boolean;
  children: DocNode[];
}

export interface AppendixNode extends BaseNode {
  type: 'appendix';
  children: DocNode[];
}

export interface HeadingNode extends BaseNode {
  type: 'heading';
  level: HeadingLevel;
  content: InlineNode[];
}

export interface ParagraphNode extends BaseNode {
  type: 'paragraph';
  content: InlineNode[];
}

export interface CaptionNode extends BaseNode {
  type: 'caption';
  content: InlineNode[];
}

export interface FigureNode extends BaseNode {
  type: 'figure';
  assetId?: string;
  alt?: string;
  caption?: CaptionNode;
}

export interface TableCell {
  id: string;
  content: DocNode[];
}

export interface TableRow {
  id: string;
  isHeader?: boolean;
  cells: TableCell[];
}

export interface TableNode extends BaseNode {
  type: 'table';
  rows: TableRow[];
  caption?: CaptionNode;
}

export interface ListItemNode extends BaseNode {
  type: 'listItem';
  content: DocNode[];
}

export interface ListNode extends BaseNode {
  type: 'list';
  ordered: boolean;
  items: ListItemNode[];
}

export interface QuoteNode extends BaseNode {
  type: 'quote';
  content: InlineNode[];
}

export interface EquationNode extends BaseNode {
  type: 'equation';
  latex: string;
}

export interface CitationNode extends BaseNode {
  type: 'citation';
  sourceId: string;
  label?: string;
}

export interface FootnoteNode extends BaseNode {
  type: 'footnote';
  content: InlineNode[];
}

export interface PageBreakNode extends BaseNode {
  type: 'pageBreak';
}

export interface SectionBreakNode extends BaseNode {
  type: 'sectionBreak';
}

export type CrossRefTargetKind =
  | 'section'
  | 'heading'
  | 'figure'
  | 'table'
  | 'equation'
  | 'appendix'
  | 'footnote';

export interface CrossReferenceNode extends BaseNode {
  type: 'crossReference';
  targetId: string;
  targetKind: CrossRefTargetKind;
  displayMode: 'number' | 'label' | 'title';
}

export type DocNode =
  | SectionNode
  | AppendixNode
  | HeadingNode
  | ParagraphNode
  | FigureNode
  | TableNode
  | ListNode
  | QuoteNode
  | EquationNode
  | CitationNode
  | FootnoteNode
  | PageBreakNode
  | SectionBreakNode
  | CrossReferenceNode
  | CaptionNode
  | ListItemNode;

export interface Document {
  id: string;
  title: string;
  template: DocumentTemplate;
  children: DocNode[];
}

export function generateNodeId(): string {
  // Web Crypto works in browsers and Node 19+ — avoid node:crypto for Next client bundles
  return globalThis.crypto.randomUUID();
}

export function defaultTemplate(): DocumentTemplate {
  return {
    page: {
      size: 'a4',
      orientation: 'portrait',
      margins: { top: 72, right: 72, bottom: 72, left: 72 },
    },
    typography: {
      bodyFont: 'Times New Roman',
      headingFont: 'Times New Roman',
      bodySizePt: 12,
      headingSizesPt: { 1: 18, 2: 16, 3: 14, 4: 12, 5: 12, 6: 12 },
      lineSpacing: 1.15,
      paragraphSpacingPt: 8,
    },
    numbering: {
      mode: 'byChapter',
      headingFormat: '{number} {title}',
      figureFormat: 'Figure {number}',
      tableFormat: 'Table {number}',
      equationFormat: '({number})',
      appendixFormat: 'Appendix {letter}',
      footnoteFormat: '{number}',
    },
    captions: {
      figurePosition: 'below',
      tablePosition: 'above',
    },
  };
}

export function createEmptyDocument(title = 'Untitled'): Document {
  return {
    id: generateNodeId(),
    title,
    template: defaultTemplate(),
    children: [],
  };
}

export function cloneDocument<T>(value: T): T {
  return structuredClone(value);
}

export function collectIds(nodes: DocNode[], into = new Set<string>()): Set<string> {
  for (const node of nodes) {
    into.add(node.id);
    switch (node.type) {
      case 'section':
      case 'appendix':
        collectIds(node.children, into);
        break;
      case 'figure':
        if (node.caption) into.add(node.caption.id);
        break;
      case 'table':
        if (node.caption) into.add(node.caption.id);
        for (const row of node.rows) {
          into.add(row.id);
          for (const cell of row.cells) {
            into.add(cell.id);
            collectIds(cell.content, into);
          }
        }
        break;
      case 'list':
        for (const item of node.items) {
          into.add(item.id);
          collectIds(item.content, into);
        }
        break;
      default:
        break;
    }
  }
  return into;
}

export function assertStableIds(before: Document, after: Document, expectedIds: string[]): void {
  const afterIds = collectIds(after.children);
  afterIds.add(after.id);
  for (const id of expectedIds) {
    if (!afterIds.has(id)) {
      throw new Error(`Expected stable id missing after mutation: ${id}`);
    }
  }
  const beforeIds = collectIds(before.children);
  beforeIds.add(before.id);
  for (const id of expectedIds) {
    if (!beforeIds.has(id)) {
      throw new Error(`Expected id was not present before mutation: ${id}`);
    }
  }
}

export function textFromInlines(content: InlineNode[]): string {
  return content
    .map((node) => {
      if (node.type === 'text') return node.text;
      return textFromInlines(node.content);
    })
    .join('');
}

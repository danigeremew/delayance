import {
  textFromInlines,
  type Document,
  type DocNode,
  type HeadingLevel,
} from '@delayance/document-model';
import type { NumberingEntry, NumberingMap } from './types';
import { walkNodes } from './tree';

function formatTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? '');
}

function toLetter(index: number): string {
  let n = index;
  let result = '';
  while (n > 0) {
    n -= 1;
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26);
  }
  return result || 'A';
}

export function computeNumbering(doc: Document): NumberingMap {
  const map: NumberingMap = {};
  const mode = doc.template.numbering.mode;
  const headingCounters = [0, 0, 0, 0, 0, 0];
  let chapter = 0;
  let figureCounter = 0;
  let tableCounter = 0;
  let equationCounter = 0;
  let footnoteCounter = 0;
  let appendixCounter = 0;

  const resetLower = (level: number) => {
    for (let i = level; i < headingCounters.length; i++) {
      headingCounters[i] = 0;
    }
  };

  const visit = (nodes: DocNode[]) => {
    for (const node of nodes) {
      if (node.type === 'heading') {
        const level = node.level;
        resetLower(level);
        headingCounters[level - 1] = (headingCounters[level - 1] ?? 0) + 1;
        if (level === 1) {
          chapter = headingCounters[0] ?? 0;
          if (mode === 'byChapter') {
            figureCounter = 0;
            tableCounter = 0;
            equationCounter = 0;
          }
        }
        const parts: number[] = [];
        for (let i = 0; i < level; i++) {
          parts.push(headingCounters[i] ?? 0);
        }
        const number = parts.join('.');
        const title = textFromInlines(node.content);
        const label = formatTemplate(doc.template.numbering.headingFormat, {
          number,
          title,
        }).trim();
        const entry: NumberingEntry = {
          nodeId: node.id,
          kind: 'heading',
          number,
          label,
          title,
          level: level as HeadingLevel,
          chapterNumber: String(chapter || ''),
        };
        map[node.id] = entry;

        // Associate enclosing section with heading number when section has this heading as first heading
      } else if (node.type === 'figure') {
        figureCounter += 1;
        const number =
          mode === 'byChapter' && chapter > 0
            ? `${chapter}.${figureCounter}`
            : String(figureCounter);
        const title = node.caption ? textFromInlines(node.caption.content) : '';
        map[node.id] = {
          nodeId: node.id,
          kind: 'figure',
          number,
          label: formatTemplate(doc.template.numbering.figureFormat, { number, title }),
          title,
          chapterNumber: String(chapter || ''),
        };
      } else if (node.type === 'table') {
        tableCounter += 1;
        const number =
          mode === 'byChapter' && chapter > 0
            ? `${chapter}.${tableCounter}`
            : String(tableCounter);
        const title = node.caption ? textFromInlines(node.caption.content) : '';
        map[node.id] = {
          nodeId: node.id,
          kind: 'table',
          number,
          label: formatTemplate(doc.template.numbering.tableFormat, { number, title }),
          title,
          chapterNumber: String(chapter || ''),
        };
      } else if (node.type === 'equation') {
        equationCounter += 1;
        const number =
          mode === 'byChapter' && chapter > 0
            ? `${chapter}.${equationCounter}`
            : String(equationCounter);
        map[node.id] = {
          nodeId: node.id,
          kind: 'equation',
          number,
          label: formatTemplate(doc.template.numbering.equationFormat, { number }),
          chapterNumber: String(chapter || ''),
        };
      } else if (node.type === 'footnote') {
        footnoteCounter += 1;
        const number = String(footnoteCounter);
        map[node.id] = {
          nodeId: node.id,
          kind: 'footnote',
          number,
          label: formatTemplate(doc.template.numbering.footnoteFormat, { number }),
        };
      } else if (node.type === 'appendix') {
        appendixCounter += 1;
        const letter = toLetter(appendixCounter);
        map[node.id] = {
          nodeId: node.id,
          kind: 'appendix',
          number: letter,
          label: formatTemplate(doc.template.numbering.appendixFormat, { letter, number: letter }),
        };
      } else if (node.type === 'section') {
        // Number section from its first heading if present
        const firstHeading = node.children.find((c) => c.type === 'heading');
        if (firstHeading && firstHeading.type === 'heading') {
          // Will be filled when heading is visited; also store section alias after children
        }
      }

      if (node.type === 'section' || node.type === 'appendix') {
        visit(node.children);
        const firstHeading = node.children.find((c) => c.type === 'heading');
        if (firstHeading && map[firstHeading.id] && node.type === 'section') {
          map[node.id] = {
            ...map[firstHeading.id]!,
            nodeId: node.id,
            kind: 'section',
          };
        }
      } else if (node.type === 'list') {
        for (const item of node.items) {
          visit(item.content);
        }
      } else if (node.type === 'table') {
        for (const row of node.rows) {
          for (const cell of row.cells) {
            visit(cell.content);
          }
        }
      }
    }
  };

  visit(doc.children);
  return map;
}

export function buildToc(doc: Document, numbering = computeNumbering(doc)) {
  const entries: { targetId: string; level: HeadingLevel; number: string; title: string }[] = [];
  walkNodes(doc.children, (node) => {
    if (node.type === 'heading') {
      const n = numbering[node.id];
      if (n) {
        entries.push({
          targetId: node.id,
          level: node.level,
          number: n.number,
          title: n.title ?? textFromInlines(node.content),
        });
      }
    }
  });
  return entries;
}

export function buildListOfFigures(doc: Document, numbering = computeNumbering(doc)) {
  return buildTypedList(doc, 'figure', numbering);
}

export function buildListOfTables(doc: Document, numbering = computeNumbering(doc)) {
  return buildTypedList(doc, 'table', numbering);
}

function buildTypedList(
  doc: Document,
  kind: 'figure' | 'table',
  numbering: NumberingMap,
) {
  const entries: { targetId: string; number: string; title: string }[] = [];
  walkNodes(doc.children, (node) => {
    if (node.type === kind) {
      const n = numbering[node.id];
      if (n) {
        entries.push({ targetId: node.id, number: n.number, title: n.title ?? '' });
      }
    }
  });
  return entries;
}

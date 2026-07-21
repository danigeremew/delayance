import {
  textFromInlines,
  type Document,
  type HeadingLevel,
} from '@delayance/document-model';
import { collectIds } from '@delayance/document-model';
import type { ValidationIssue } from './types';
import { walkNodes } from './tree';

const MANUAL_NUMBERING = /^\d+(\.\d+)*\s+\S/;
const MANUAL_FIGURE = /^Figure\s+\d+/i;
const MANUAL_TABLE = /^Table\s+\d+/i;

export function validateDocument(doc: Document): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const ids = collectIds(doc.children);
  ids.add(doc.id);

  // Duplicate id check via recount
  const seen = new Map<string, number>();
  walkNodes(doc.children, (node) => {
    seen.set(node.id, (seen.get(node.id) ?? 0) + 1);
  });
  for (const [id, count] of seen) {
    if (count > 1) {
      issues.push({
        code: 'duplicate_id',
        severity: 'error',
        message: `Duplicate node id: ${id}`,
        nodeId: id,
      });
    }
  }

  let lastHeadingLevel = 0;
  walkNodes(doc.children, (node) => {
    if (node.type === 'heading') {
      if (lastHeadingLevel > 0 && node.level > lastHeadingLevel + 1) {
        issues.push({
          code: 'invalid_heading_jump',
          severity: 'error',
          message: `Heading level jumps from ${lastHeadingLevel} to ${node.level}`,
          nodeId: node.id,
        });
      }
      lastHeadingLevel = node.level as HeadingLevel;
    }

    if (node.type === 'section') {
      const hasContent = node.children.some((c) => c.type !== 'heading');
      const hasHeading = node.children.some((c) => c.type === 'heading');
      if (!hasContent && hasHeading) {
        issues.push({
          code: 'empty_section',
          severity: 'warning',
          message: 'Section has a heading but no body content',
          nodeId: node.id,
        });
      }
      if (node.children.length === 0) {
        issues.push({
          code: 'empty_section',
          severity: 'warning',
          message: 'Section is empty',
          nodeId: node.id,
        });
      }
    }

    if (node.type === 'paragraph') {
      const text = textFromInlines(node.content).trim();
      if (MANUAL_NUMBERING.test(text) || MANUAL_FIGURE.test(text) || MANUAL_TABLE.test(text)) {
        issues.push({
          code: 'manual_numbering',
          severity: 'warning',
          message: 'Paragraph appears to contain manual numbering',
          nodeId: node.id,
        });
      }
    }

    if (node.type === 'figure' && !node.caption) {
      issues.push({
        code: 'missing_caption',
        severity: 'warning',
        message: 'Figure is missing a caption',
        nodeId: node.id,
      });
    }

    if (node.type === 'table' && !node.caption) {
      issues.push({
        code: 'missing_caption',
        severity: 'warning',
        message: 'Table is missing a caption',
        nodeId: node.id,
      });
    }

    if (node.type === 'crossReference' && !ids.has(node.targetId)) {
      issues.push({
        code: 'broken_reference',
        severity: 'error',
        message: `Cross-reference target missing: ${node.targetId}`,
        nodeId: node.id,
      });
    }
  });

  return issues;
}

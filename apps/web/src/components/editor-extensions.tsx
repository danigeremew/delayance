'use client';

import { Node, mergeAttributes } from '@tiptap/core';
import { generateNodeId } from '@delayance/document-model';

function idAttr() {
  return {
    id: {
      default: null as string | null,
      parseHTML: (element: HTMLElement) => element.getAttribute('data-id'),
      renderHTML: (attributes: { id?: string | null }) =>
        attributes.id ? { 'data-id': attributes.id } : {},
    },
  };
}

export const Section = Node.create({
  name: 'section',
  group: 'block',
  content: 'block+',
  defining: true,
  addAttributes() {
    return {
      ...idAttr(),
      locked: {
        default: false,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-locked') === 'true',
        renderHTML: (attrs: { locked?: boolean }) =>
          attrs.locked ? { 'data-locked': 'true' } : {},
      },
    };
  },
  parseHTML() {
    return [{ tag: 'section[data-type="section"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['section', mergeAttributes(HTMLAttributes, { 'data-type': 'section' }), 0];
  },
});

export const Appendix = Node.create({
  name: 'appendix',
  group: 'block',
  content: 'block+',
  defining: true,
  addAttributes() {
    return idAttr();
  },
  parseHTML() {
    return [{ tag: 'section[data-type="appendix"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['section', mergeAttributes(HTMLAttributes, { 'data-type': 'appendix' }), 0];
  },
});

export const Figure = Node.create({
  name: 'figure',
  group: 'block',
  content: 'caption*',
  atom: false,
  addAttributes() {
    return {
      ...idAttr(),
      assetId: { default: null },
      alt: { default: null },
    };
  },
  parseHTML() {
    return [{ tag: 'figure' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['figure', mergeAttributes(HTMLAttributes, { class: 'dl-figure' }), 0];
  },
});

export const Caption = Node.create({
  name: 'caption',
  group: 'block',
  content: 'inline*',
  addAttributes() {
    return idAttr();
  },
  parseHTML() {
    return [{ tag: 'figcaption' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['figcaption', mergeAttributes(HTMLAttributes), 0];
  },
});

export const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: true,
  addAttributes() {
    return idAttr();
  },
  parseHTML() {
    return [{ tag: 'div[data-type="page-break"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'page-break',
        class: 'dl-page-break',
      }),
    ];
  },
  addKeyboardShortcuts() {
    return {
      'Mod-Enter': () =>
        this.editor.commands.insertContent({
          type: this.name,
          attrs: { id: generateNodeId() },
        }),
    };
  },
});

export const SectionBreak = Node.create({
  name: 'sectionBreak',
  group: 'block',
  atom: true,
  addAttributes() {
    return idAttr();
  },
  parseHTML() {
    return [{ tag: 'div[data-type="section-break"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'section-break',
        class: 'dl-section-break',
      }),
    ];
  },
});

export const CrossReference = Node.create({
  name: 'crossReference',
  group: 'block',
  atom: true,
  addAttributes() {
    return {
      ...idAttr(),
      targetId: { default: null },
      targetKind: { default: 'figure' },
      displayMode: { default: 'label' },
    };
  },
  parseHTML() {
    return [{ tag: 'span[data-type="cross-reference"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'cross-reference',
        class: 'dl-xref',
      }),
      `[ref:${HTMLAttributes.targetId ?? ''}]`,
    ];
  },
});

export const Equation = Node.create({
  name: 'equation',
  group: 'block',
  atom: true,
  addAttributes() {
    return {
      ...idAttr(),
      latex: { default: '' },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="equation"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': 'equation', class: 'dl-equation' }),
      HTMLAttributes.latex ?? '',
    ];
  },
});

export const Citation = Node.create({
  name: 'citation',
  group: 'block',
  atom: true,
  addAttributes() {
    return {
      ...idAttr(),
      sourceId: { default: '' },
      label: { default: null },
    };
  },
  parseHTML() {
    return [{ tag: 'span[data-type="citation"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, { 'data-type': 'citation' }),
      HTMLAttributes.label ?? `[${HTMLAttributes.sourceId}]`,
    ];
  },
});

export const Footnote = Node.create({
  name: 'footnote',
  group: 'block',
  content: 'inline*',
  addAttributes() {
    return idAttr();
  },
  parseHTML() {
    return [{ tag: 'aside[data-type="footnote"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['aside', mergeAttributes(HTMLAttributes, { 'data-type': 'footnote' }), 0];
  },
});

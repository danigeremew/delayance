'use client';

import { Extension } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import { generateNodeId } from '@delayance/document-model';

/** Ensure block nodes get stable data-id attributes when missing. */
export const StableIds = Extension.create({
  name: 'stableIds',
  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading', 'blockquote', 'bulletList', 'orderedList', 'listItem'],
        attributes: {
          id: {
            default: null,
            parseHTML: (element: HTMLElement) => element.getAttribute('data-id'),
            renderHTML: (attributes: { id?: string | null }) =>
              attributes.id ? { 'data-id': attributes.id } : {},
          },
        },
      },
    ];
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction: (_transactions, _oldState, newState) => {
          let tr = newState.tr;
          let modified = false;
          newState.doc.descendants((node, pos) => {
            if (!node.isBlock) return;
            if (!node.attrs.id) {
              tr = tr.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                id: generateNodeId(),
              });
              modified = true;
            }
          });
          return modified ? tr : null;
        },
      }),
    ];
  },
});

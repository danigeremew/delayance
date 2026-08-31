'use client';

import { Extension } from '@tiptap/core';

export interface LineSpacingOptions {
  types: string[];
  defaultSpacing: string;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    lineSpacing: {
      setLineSpacing: (spacing: string) => ReturnType;
      unsetLineSpacing: () => ReturnType;
    };
  }
}

export const LineSpacing = Extension.create<LineSpacingOptions>({
  name: 'lineSpacing',

  addOptions() {
    return {
      types: ['paragraph', 'heading'],
      defaultSpacing: '1.5',
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          lineSpacing: {
            default: null,
            parseHTML: (element: HTMLElement) => element.style.lineHeight || null,
            renderHTML: (attributes: { lineSpacing?: string | null }) => {
              if (!attributes.lineSpacing) return {};
              return { style: `line-height: ${attributes.lineSpacing}` };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setLineSpacing:
        (spacing: string) =>
        ({ commands }) => {
          return this.options.types.every((type: string) =>
            commands.updateAttributes(type, { lineSpacing: spacing }),
          );
        },
      unsetLineSpacing:
        () =>
        ({ commands }) => {
          return this.options.types.every((type: string) =>
            commands.resetAttributes(type, 'lineSpacing'),
          );
        },
    };
  },
});

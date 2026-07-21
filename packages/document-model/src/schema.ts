import { z } from 'zod';

const headingLevelSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
]);

const textInlineSchema: z.ZodTypeAny = z.lazy(() =>
  z.object({
    type: z.literal('text'),
    text: z.string(),
    marks: z.array(z.enum(['bold', 'italic', 'underline'])).optional(),
  }),
);

const linkInlineSchema: z.ZodTypeAny = z.lazy(() =>
  z.object({
    type: z.literal('link'),
    href: z.string(),
    content: z.array(textInlineSchema),
  }),
);

const inlineSchema: z.ZodTypeAny = z.lazy(() => z.union([textInlineSchema, linkInlineSchema]));

const captionSchema = z.object({
  id: z.string().uuid(),
  type: z.literal('caption'),
  content: z.array(inlineSchema),
});

export const docNodeSchema: z.ZodTypeAny = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.object({
      id: z.string().uuid(),
      type: z.literal('section'),
      locked: z.boolean().optional(),
      children: z.array(docNodeSchema),
    }),
    z.object({
      id: z.string().uuid(),
      type: z.literal('appendix'),
      children: z.array(docNodeSchema),
    }),
    z.object({
      id: z.string().uuid(),
      type: z.literal('heading'),
      level: headingLevelSchema,
      content: z.array(inlineSchema),
    }),
    z.object({
      id: z.string().uuid(),
      type: z.literal('paragraph'),
      content: z.array(inlineSchema),
    }),
    z.object({
      id: z.string().uuid(),
      type: z.literal('figure'),
      assetId: z.string().optional(),
      alt: z.string().optional(),
      caption: captionSchema.optional(),
    }),
    z.object({
      id: z.string().uuid(),
      type: z.literal('table'),
      rows: z.array(
        z.object({
          id: z.string().uuid(),
          isHeader: z.boolean().optional(),
          cells: z.array(
            z.object({
              id: z.string().uuid(),
              content: z.array(docNodeSchema),
            }),
          ),
        }),
      ),
      caption: captionSchema.optional(),
    }),
    z.object({
      id: z.string().uuid(),
      type: z.literal('list'),
      ordered: z.boolean(),
      items: z.array(
        z.object({
          id: z.string().uuid(),
          type: z.literal('listItem'),
          content: z.array(docNodeSchema),
        }),
      ),
    }),
    z.object({
      id: z.string().uuid(),
      type: z.literal('quote'),
      content: z.array(inlineSchema),
    }),
    z.object({
      id: z.string().uuid(),
      type: z.literal('equation'),
      latex: z.string(),
    }),
    z.object({
      id: z.string().uuid(),
      type: z.literal('citation'),
      sourceId: z.string(),
      label: z.string().optional(),
    }),
    z.object({
      id: z.string().uuid(),
      type: z.literal('footnote'),
      content: z.array(inlineSchema),
    }),
    z.object({
      id: z.string().uuid(),
      type: z.literal('pageBreak'),
    }),
    z.object({
      id: z.string().uuid(),
      type: z.literal('sectionBreak'),
    }),
    z.object({
      id: z.string().uuid(),
      type: z.literal('crossReference'),
      targetId: z.string().uuid(),
      targetKind: z.enum([
        'section',
        'heading',
        'figure',
        'table',
        'equation',
        'appendix',
        'footnote',
      ]),
      displayMode: z.enum(['number', 'label', 'title']),
    }),
    captionSchema,
    z.object({
      id: z.string().uuid(),
      type: z.literal('listItem'),
      content: z.array(docNodeSchema),
    }),
  ]),
);

export const documentTemplateSchema = z.object({
  page: z.object({
    size: z.enum(['a4', 'letter']),
    orientation: z.enum(['portrait', 'landscape']),
    margins: z.object({
      top: z.number(),
      right: z.number(),
      bottom: z.number(),
      left: z.number(),
    }),
  }),
  typography: z.object({
    bodyFont: z.string(),
    headingFont: z.string(),
    bodySizePt: z.number(),
    headingSizesPt: z.record(z.string(), z.number()),
    lineSpacing: z.number(),
    paragraphSpacingPt: z.number(),
  }),
  numbering: z.object({
    mode: z.enum(['global', 'byChapter']),
    headingFormat: z.string(),
    figureFormat: z.string(),
    tableFormat: z.string(),
    equationFormat: z.string(),
    appendixFormat: z.string(),
    footnoteFormat: z.string(),
  }),
  captions: z.object({
    figurePosition: z.enum(['above', 'below']),
    tablePosition: z.enum(['above', 'below']),
  }),
});

export const documentSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  template: documentTemplateSchema,
  children: z.array(docNodeSchema),
});

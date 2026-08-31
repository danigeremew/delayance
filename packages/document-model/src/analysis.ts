import { z } from 'zod';

export const documentLocationSchema = z.object({
  kind: z.enum(['bookmark', 'heading', 'paragraph', 'table', 'figure']),
  value: z.string(),
  occurrence: z.number().int().nonnegative().optional(),
  excerpt: z.string().max(500).optional(),
});

export type DocumentLocation = z.infer<typeof documentLocationSchema>;

export const analysisNodeSchema = z.object({
  id: z.string(),
  kind: z.enum(['heading', 'paragraph', 'table', 'figure', 'citation', 'reference', 'comment']),
  text: z.string(),
  level: z.number().int().min(1).max(6).optional(),
  location: documentLocationSchema,
});

export type AnalysisNode = z.infer<typeof analysisNodeSchema>;

/**
 * A deliberately lossy representation used for search, navigation, health checks,
 * and AI context. The office file remains the editable source of truth.
 */
export const documentAnalysisSchema = z.object({
  schemaVersion: z.literal(1),
  fileHash: z.string().regex(/^[a-f0-9]{64}$/),
  extractedAt: z.string().datetime(),
  title: z.string().optional(),
  metadata: z.object({
    author: z.string().optional(),
    subject: z.string().optional(),
    keywords: z.array(z.string()).default([]),
  }),
  nodes: z.array(analysisNodeSchema),
  plainText: z.string(),
  headingCount: z.number().int().nonnegative(),
  tableCount: z.number().int().nonnegative(),
  figureCount: z.number().int().nonnegative(),
  commentCount: z.number().int().nonnegative(),
});

export type DocumentAnalysis = z.infer<typeof documentAnalysisSchema>;

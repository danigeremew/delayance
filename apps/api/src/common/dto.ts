import { z } from 'zod';

export const createProjectAiSchema = z.object({
  provider: z.string().min(1).default('ollama'),
  model: z.string().min(1),
  policy: z.enum(['any', 'local_only']).default('local_only'),
  baseUrl: z.string().nullable().optional(),
  apiKey: z.string().nullable().optional(),
});

export const createProjectSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(5000).optional().default(''),
  ai: createProjectAiSchema.optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional(),
});

export const addMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(['owner', 'editor', 'contributor', 'reviewer', 'viewer']),
});

export const updateMemberSchema = z.object({
  role: z.enum(['owner', 'editor', 'contributor', 'reviewer', 'viewer']),
});

export const createMemorySchema = z.object({
  kind: z.enum(['instruction', 'fact', 'decision', 'open_question']),
  body: z.string().min(1).max(10000),
  sortOrder: z.number().int().optional(),
});

export const updateMemorySchema = z.object({
  body: z.string().min(1).max(10000).optional(),
  sortOrder: z.number().int().optional(),
  kind: z.enum(['instruction', 'fact', 'decision', 'open_question']).optional(),
});

export const createDocumentSchema = z.object({
  title: z.string().min(1).max(500),
  templateId: z.string().uuid().optional(),
});

export const updateDocumentMetaSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  status: z.enum(['draft', 'in_review', 'approved']).optional(),
});

export const patchDocumentContentSchema = z.object({
  content: z.unknown(),
  createVersion: z.boolean().optional().default(true),
  versionName: z.string().optional(),
  versionReason: z.string().optional(),
});

export const applyDocumentOpSchema = z.object({
  operation: z.unknown(),
  force: z.boolean().optional(),
});

export const createCommentSchema = z.object({
  anchorNodeId: z.string().min(1),
  body: z.string().min(1).max(10000),
  parentId: z.string().uuid().optional(),
});

export const upsertAssignmentSchema = z.object({
  sectionId: z.string().min(1),
  assigneeId: z.string().uuid().nullable().optional(),
  status: z.enum([
    'not_started',
    'notes',
    'draft',
    'needs_review',
    'approved',
    'locked',
  ]),
});

import { z } from 'zod';

export const aiModeSchema = z.enum(['ask', 'edit', 'write', 'review']);
export type AiMode = z.infer<typeof aiModeSchema>;

export const insertPositionSchema = z.enum(['before', 'after', 'into']);

export const proposedOpSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('insert'),
    parentId: z.string().nullable().optional().default(null),
    referenceId: z.string().optional(),
    position: insertPositionSchema.optional().default('into'),
    node: z.record(z.unknown()),
  }),
  z.object({
    type: z.literal('replace'),
    targetId: z.string(),
    node: z.record(z.unknown()),
  }),
  z.object({
    type: z.literal('delete'),
    targetId: z.string(),
    force: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('moveSection'),
    sectionId: z.string(),
    parentId: z.string().nullable(),
    referenceId: z.string().optional(),
    position: insertPositionSchema,
  }),
  z.object({
    type: z.literal('promoteHeading'),
    headingId: z.string(),
  }),
  z.object({
    type: z.literal('demoteHeading'),
    headingId: z.string(),
  }),
]);

export type ProposedOp = z.infer<typeof proposedOpSchema>;

export const reviewFindingSchema = z.object({
  nodeId: z.string().optional(),
  severity: z.enum(['info', 'warning', 'error']).default('info'),
  message: z.string(),
  suggestion: z.string().optional(),
});

export type ReviewFinding = z.infer<typeof reviewFindingSchema>;

export const aiProposalPayloadSchema = z.object({
  answer: z.string().optional(),
  ops: z.array(proposedOpSchema).default([]),
  findings: z.array(reviewFindingSchema).default([]),
  citedSourceIds: z.array(z.string()).default([]),
});

export type AiProposalPayload = z.infer<typeof aiProposalPayloadSchema>;

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompleteOptions {
  model: string;
  temperature?: number;
  maxTokens?: number;
}

export interface StructuredCompleteOptions extends CompleteOptions {
  schemaHint: string;
}

export interface AiProvider {
  readonly name: string;
  readonly isLocal: boolean;
  complete(messages: LlmMessage[], options: CompleteOptions): Promise<string>;
  completeStructured(
    messages: LlmMessage[],
    options: StructuredCompleteOptions,
  ): Promise<unknown>;
  stream?(
    messages: LlmMessage[],
    options: CompleteOptions,
  ): AsyncIterable<string>;
}

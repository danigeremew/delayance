import {
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  index,
  integer,
  boolean,
  bigint,
} from 'drizzle-orm/pg-core';
import type { Document, DocumentAnalysis, DocumentTemplate } from '@delayance/document-model';

export const projectRoleEnum = pgEnum('project_role', [
  'owner',
  'editor',
  'contributor',
  'reviewer',
  'viewer',
]);

export const memoryKindEnum = pgEnum('memory_kind', [
  'instruction',
  'fact',
  'decision',
  'open_question',
]);

export const sectionStatusEnum = pgEnum('section_status', [
  'not_started',
  'notes',
  'draft',
  'needs_review',
  'approved',
  'locked',
]);

export const documentStatusEnum = pgEnum('document_status', [
  'draft',
  'in_review',
  'approved',
]);

export const documentAnalysisStatusEnum = pgEnum('document_analysis_status', [
  'pending',
  'ready',
  'failed',
]);

export const officeSessionPermissionEnum = pgEnum('office_session_permission', [
  'read',
  'write',
]);

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    refreshTokenHash: text('refresh_token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [index('sessions_user_id_idx').on(table.userId)],
);

export const projects = pgTable('projects', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  description: text('description').default('').notNull(),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const projectMembers = pgTable(
  'project_members',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: projectRoleEnum('role').notNull().default('viewer'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('project_members_project_id_idx').on(table.projectId),
    index('project_members_user_id_idx').on(table.userId),
  ],
);

export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('audit_events_created_at_idx').on(table.createdAt)],
);

export const documentTemplates = pgTable('document_templates', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  isDefault: boolean('is_default').default(false).notNull(),
  definition: jsonb('definition').$type<DocumentTemplate>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const documents = pgTable(
  'documents',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    templateId: uuid('template_id').references(() => documentTemplates.id, {
      onDelete: 'set null',
    }),
    content: jsonb('content').$type<Document>().notNull(),
    /** Office-file fields are the new source of truth. `content` is removed by the clean-break migration. */
    fileKey: text('file_key'),
    fileFormat: text('file_format'),
    fileSize: bigint('file_size', { mode: 'number' }),
    fileHash: text('file_hash'),
    currentVersion: integer('current_version').default(0).notNull(),
    analysisContent: jsonb('analysis_content').$type<DocumentAnalysis>(),
    analysisVersion: integer('analysis_version').default(0).notNull(),
    analysisStatus: documentAnalysisStatusEnum('analysis_status').default('pending').notNull(),
    analysisError: text('analysis_error'),
    searchText: text('search_text').default('').notNull(),
    status: documentStatusEnum('status').default('draft').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('documents_project_id_idx').on(table.projectId)],
);

export const documentVersions = pgTable(
  'document_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    snapshot: jsonb('snapshot').$type<Document>().notNull(),
    versionNumber: integer('version_number'),
    fileKey: text('file_key'),
    fileHash: text('file_hash'),
    fileSize: bigint('file_size', { mode: 'number' }),
    analysisSnapshot: jsonb('analysis_snapshot').$type<DocumentAnalysis>(),
    name: text('name'),
    reason: text('reason'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('document_versions_document_id_idx').on(table.documentId)],
);

export const projectMemoryItems = pgTable(
  'project_memory_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    kind: memoryKindEnum('kind').notNull(),
    body: text('body').notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('project_memory_items_project_id_idx').on(table.projectId)],
);

export const comments = pgTable(
  'comments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    anchorNodeId: text('anchor_node_id').notNull(),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    parentId: uuid('parent_id'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('comments_document_id_idx').on(table.documentId)],
);

export const sectionAssignments = pgTable(
  'section_assignments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    sectionId: text('section_id').notNull(),
    assigneeId: uuid('assignee_id').references(() => users.id, { onDelete: 'set null' }),
    status: sectionStatusEnum('status').default('not_started').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('section_assignments_document_id_idx').on(table.documentId)],
);

export const storedObjects = pgTable('stored_objects', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  bucket: text('bucket').notNull(),
  objectKey: text('object_key').notNull(),
  contentType: text('content_type'),
  sizeBytes: integer('size_bytes'),
  sha256: text('sha256'),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const officeSessions = pgTable(
  'office_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    permission: officeSessionPermissionEnum('permission').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('office_sessions_document_id_idx').on(table.documentId)],
);

export const jobStatusEnum = pgEnum('job_status', [
  'queued',
  'running',
  'completed',
  'failed',
]);

export const backgroundJobs = pgTable(
  'background_jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    type: text('type').notNull(),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    documentId: uuid('document_id').references(() => documents.id, { onDelete: 'cascade' }),
    status: jobStatusEnum('status').default('queued').notNull(),
    progress: integer('progress').default(0).notNull(),
    result: jsonb('result').$type<Record<string, unknown>>().default({}).notNull(),
    error: text('error'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('background_jobs_project_id_idx').on(table.projectId)],
);

export const documentExports = pgTable('document_exports', {
  id: uuid('id').defaultRandom().primaryKey(),
  documentId: uuid('document_id')
    .notNull()
    .references(() => documents.id, { onDelete: 'cascade' }),
  format: text('format').notNull(),
  storedObjectId: uuid('stored_object_id').references(() => storedObjects.id, {
    onDelete: 'set null',
  }),
  compatibilityReport: jsonb('compatibility_report').$type<Record<string, unknown>>(),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const documentImports = pgTable('document_imports', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  documentId: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),
  sourceObjectId: uuid('source_object_id').references(() => storedObjects.id, {
    onDelete: 'set null',
  }),
  mode: text('mode').notNull(),
  styleMap: jsonb('style_map').$type<unknown[]>().default([]).notNull(),
  report: jsonb('report').$type<Record<string, unknown>>().default({}).notNull(),
  previewContent: jsonb('preview_content').$type<Document>(),
  status: text('status').default('pending').notNull(),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const aiPolicyEnum = pgEnum('ai_policy', ['any', 'local_only']);

export const projectAiSettings = pgTable('project_ai_settings', {
  projectId: uuid('project_id')
    .primaryKey()
    .references(() => projects.id, { onDelete: 'cascade' }),
  policy: aiPolicyEnum('policy').default('local_only').notNull(),
  provider: text('provider').default('ollama').notNull(),
  model: text('model').default('llama3.2').notNull(),
  baseUrl: text('base_url').default('http://127.0.0.1:11434/v1'),
  encryptedApiKey: text('encrypted_api_key'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const aiProposalStatusEnum = pgEnum('ai_proposal_status', [
  'pending',
  'accepted',
  'rejected',
]);

export const aiChats = pgTable(
  'ai_chats',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    title: text('title').default('New chat').notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('ai_chats_document_id_idx').on(table.documentId),
    index('ai_chats_updated_at_idx').on(table.updatedAt),
  ],
);

export const aiProposals = pgTable(
  'ai_proposals',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    chatId: uuid('chat_id').references(() => aiChats.id, { onDelete: 'set null' }),
    mode: text('mode').notNull(),
    model: text('model').notNull(),
    provider: text('provider').notNull(),
    promptSummary: text('prompt_summary').notNull(),
    contextNodeIds: jsonb('context_node_ids').$type<string[]>().default([]).notNull(),
    answer: text('answer'),
    ops: jsonb('ops').$type<unknown[]>().default([]).notNull(),
    findings: jsonb('findings').$type<unknown[]>().default([]).notNull(),
    citedSourceIds: jsonb('cited_source_ids').$type<string[]>().default([]).notNull(),
    status: aiProposalStatusEnum('status').default('pending').notNull(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('ai_proposals_document_id_idx').on(table.documentId),
    index('ai_proposals_chat_id_idx').on(table.chatId),
  ],
);

export const projectSources = pgTable(
  'project_sources',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    sourceType: text('source_type').notNull(),
    storedObjectId: uuid('stored_object_id').references(() => storedObjects.id, {
      onDelete: 'set null',
    }),
    textContent: text('text_content').default('').notNull(),
    outdated: boolean('outdated').default(false).notNull(),
    aiMayUse: boolean('ai_may_use').default(true).notNull(),
    processStatus: text('process_status').default('ready').notNull(),
    processError: text('process_error'),
    /** pgvector(32) — stored via raw SQL in worker/search; typed as number[] for app use */
    embedding: text('embedding'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('project_sources_project_id_idx').on(table.projectId)],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

# Delayance Architecture

## Overview

Delayance is an AI Document Workspace built as a **modular monolith** in a pnpm + Turborepo monorepo.

Applications may run as separate processes but share one codebase with clear package boundaries.

## Applications

| App                  | Role                                         |
| -------------------- | -------------------------------------------- |
| `apps/web`           | Next.js UI                                   |
| `apps/api`           | NestJS REST API (+ WebSockets later)         |
| `apps/worker`        | BullMQ background jobs                       |
| `apps/collaboration` | Placeholder for future Yjs real-time editing |

## Packages

| Package             | Role                                                                        |
| ------------------- | --------------------------------------------------------------------------- |
| `document-model`    | Versioned document-analysis schema for AI, search, outline, and health      |
| `document-engine`   | Analysis traversal, citation/reference checks, health rules, and locations  |
| `docx-engine`       | DOCX analysis extraction, compatibility inspection, and blank-DOCX creation |
| `ai-core`           | Provider-independent prompts, context packing, op validation                |
| `provider-adapters` | Gemini text, structured output, and streaming adapter                       |
| `design-system`     | App theme tokens (separate from document template styles)                   |
| `shared-types`      | Cross-cutting TypeScript types                                              |
| `validation`        | Shared Zod schemas                                                          |

## Data plane

- **Local PostgreSQL** (+ JSONB, pgvector) — relational metadata, analysis, and workflow state
- **Redis** — BullMQ queues, WOPI editing locks, one-time password reset tokens
- **Local filesystem** — private immutable files in `STORAGE_DIR`, shared by API and worker
- **Local auth** — salted scrypt password hashes in PostgreSQL; 15-minute HS256 access tokens tied to revocable database sessions; opaque rotating refresh tokens in a persistent HttpOnly cookie with a fixed 24-hour session deadline. Accounts and sessions survive application restarts in PostgreSQL. No external identity service is required.

Protected routes return HTTP 401 when a bearer token is missing so the web client can restore its session using the refresh cookie. The home dashboard waits for this session check before requesting projects.

## Core rules

### Canonical document model

Editable documents are DOCX files in isolated, content-addressed local file storage. Wordcraft is the sole browser editor and owns editing, formatting, pagination and DOCX import/export; PostgreSQL keeps metadata and Delayance's extracted analysis representation.

The shared workspace lives in a persistent Next.js layout under the project documents route. Switching documents retains the project header, document list, and sidebar containers; only document-specific editor and intelligence sessions restart. Editor loading stays within the center region, retaining the last sidebar geometry. Sidebar navigation saves pending edits through WOPI before leaving; failed saves keep the current document open. Each editor state is scoped to its document so old callbacks cannot control the next document. The shared workspace places Wordcraft’s native ribbon and status bar across the app beneath Delayance’s header. The embedded Rust layout reserves host sidebar widths; validated geometry and overlay messages clip the iframe so React panels remain interactive and native menus/dialogs appear above them. Header history and command search dispatch through the existing narrow command bridge.

Its host bridge uses authorized WOPI sessions, locks, immutable DOCX storage, version creation, analysis, and AI acceptance. Native range handles include the document revision and selection positions. No database document model or direct provider writes are added. See [Wordcraft integration](../integrations/wordcraft/README.md) for build steps and limitations. PostgreSQL runs as a local service; Compose starts only Redis.

### AI credentials

Gemini account keys are encrypted in PostgreSQL on the user record and resolved using the authenticated requesting user ID for settings, connection tests, intent classification, and AI generation. Account keys take precedence over existing project keys and the server default. Project authorization and local-only policy checks still apply; another project member never inherits a user's account key. Model and policy remain project settings. The browser receives key-presence flags only.

### AI safety

AI providers must never write document content directly to the database.

Pipeline: text proposal → revision/permission validation → preview → accept/reject → editor bridge → WOPI save/version history.

The Wordcraft sidebar uses the office AI endpoint, which extracts context from the current immutable DOCX and stores validated `office-text` revisions in proposal metadata. Ask/Review generate answers without revisions; Edit/Write capture the native caret or selection before generation and stage a highlighted preview in Wordcraft. A separate provisional session renders the text while the original session (including selection, revision and undo history) remains intact. Native ✓/✕ controls send origin-checked decisions to the host; no preview bytes can be saved. Acceptance authorizes through the API before restoring the original session and inserting the text once. Discard restores the original session without saving. The assistant stays mounted when hidden so it continues handling preview decisions. Acceptance verifies a user-scoped writable WOPI session and the original file hash/version before Wordcraft applies the revision to its validated native selection. Completion checks the newly saved DOCX before marking a proposal accepted. Legacy JSON operations are rejected for office-backed documents.

### Deterministic document processing

Numbering, TOC, cross-references, DOCX/PDF, version history, and validation are handled by normal program logic — never by AI.

## Phase status

Phases 0–8 implemented for v1 exit criteria: document core, workspace editor, DOCX/PDF jobs, AI Ask/Edit/Write/Review with accept/reject, sources with FTS/pgvector/citations, health panel, contributor section workflows, Playwright E2E, and docs. Post-v1 items live in [REMAINING_WORK.md](./REMAINING_WORK.md).

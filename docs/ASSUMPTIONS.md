# Delayance Assumptions and Staged Limits

Decisions across Phases 0–8 and explicitly deferred work. See also [REMAINING_WORK.md](./REMAINING_WORK.md) and [LIMITATIONS.md](./LIMITATIONS.md).

## Product decisions

PostgreSQL runs locally with pgvector; Redis is the only Compose service. Wordcraft is the sole browser editor, built from the pinned Rust/WASM source.

Files use a private local `STORAGE_DIR` folder shared by the API and worker. This replaces the original MinIO requirement for the current local setup. DOCX versions remain immutable and content-addressed.

| Topic             | Choice                                                                                                           |
| ----------------- | ---------------------------------------------------------------------------------------------------------------- |
| Product name      | Delayance                                                                                                        |
| ORM               | Drizzle + PostgreSQL JSONB                                                                                       |
| Auth              | Local email/password login; scrypt hashes, in-memory access token, revocable session and HttpOnly refresh cookie |
| Collaboration     | `apps/collaboration` placeholder only — no Yjs in v1                                                             |
| Document packages | Pure TypeScript libraries — no Nest/React imports                                                                |
| Node IDs          | UUID (v4)                                                                                                        |
| DOCX              | Custom OOXML via JSZip + fast-xml-parser                                                                         |
| PDF               | Playwright HTML→PDF (HTML fallback if Chromium missing)                                                          |
| AI                | Structured ops only; Ask/Edit/Write/Review; never direct DB writes from providers                                |
| Sources           | Upload + extract (text/DOCX/PDF); FTS across docs/sources/memory/comments; pgvector(32) local hash embeddings    |
| Citations         | Citation nodes + Ask `citedSourceIds` attribution                                                                |

Deferred structural operations:

- Split section / merge sections / move section across documents

## Phase status (honest)

| Phase | Status                                                                                     |
| ----- | ------------------------------------------------------------------------------------------ |
| 0–6   | Implemented (core paths)                                                                   |
| 7     | Completed to exit criteria: FTS, pgvector column, extract, citations                       |
| 8     | Completed to exit criteria: health+AI findings, contributor assign/section DOCX, E2E, docs |

Post-v1 items remain in REMAINING_WORK.md — not claimed complete.

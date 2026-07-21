# Delayance Assumptions and Staged Limits

Decisions across Phases 0–8 and explicitly deferred work. See also [REMAINING_WORK.md](./REMAINING_WORK.md) and [LIMITATIONS.md](./LIMITATIONS.md).

## Product decisions

| Topic | Choice |
| --- | --- |
| Product name | Delayance |
| ORM | Drizzle + PostgreSQL JSONB |
| Auth | Email/password + JWT (access + refresh) |
| Collaboration | `apps/collaboration` placeholder only — no Yjs in v1 |
| Document packages | Pure TypeScript libraries — no Nest/React imports |
| Node IDs | UUID (v4) |
| DOCX | Custom OOXML via JSZip + fast-xml-parser |
| PDF | Playwright HTML→PDF (HTML fallback if Chromium missing) |
| AI | Structured ops only; Ask/Edit/Write/Review; never direct DB writes from providers |
| Sources | Upload + extract (text/DOCX/PDF); FTS across docs/sources/memory/comments; pgvector(32) local hash embeddings |
| Citations | Citation nodes + Ask `citedSourceIds` attribution |

Deferred structural operations:

- Split section / merge sections / move section across documents

## Phase status (honest)

| Phase | Status |
| --- | --- |
| 0–6 | Implemented (core paths) |
| 7 | Completed to exit criteria: FTS, pgvector column, extract, citations |
| 8 | Completed to exit criteria: health+AI findings, contributor assign/section DOCX, E2E, docs |

Post-v1 items remain in REMAINING_WORK.md — not claimed complete.

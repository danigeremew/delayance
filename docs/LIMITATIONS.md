# Known Limitations (v1)

- File storage uses a private local folder. API and worker must share that filesystem; existing MinIO objects require a manual copy preserving object keys. Back up file bytes separately from PostgreSQL.

- The sole browser editor is an alpha Wordcraft build. DOCX fidelity and pagination require evaluation on representative copies. Its native ribbon supplies editing tools across the shared workspace; unsupported Delayance host commands are rejected; non-DOCX native exports download locally. See [the integration guide](../integrations/wordcraft/README.md).

- Authentication is local email/password login. External identity providers and SSO are not implemented. Accounts previously created through Keycloak need a local password reset; their user IDs and projects are preserved.
- Password-recovery mail is unavailable until SMTP is configured.

- No real-time multiplayer editing (collaboration app is a scaffold only).
- DOCX import/export covers headings, paragraphs, tables, basic styles, numbering, and Word field instructions for TOC/PAGE/REF — not SmartArt, macros, or embedded workbooks.
- Equations render in the editor; DOCX equation OMML round-trip is best-effort / flagged in compatibility reports.
- PDF uses Playwright print HTML; pagination will not match Word pixel-for-pixel.
- AI Ask/Edit/Write/Review require a Gemini API key; without one, requests fail with a configuration error. Existing projects with a `local_only` policy require an editor to enable external AI before using Gemini.
- Source embeddings use a deterministic local hash stored in pgvector(32) — not a commercial embedding model.
- Image source uploads store placeholders; OCR is deferred.
- Advanced Agent / Research / Interview / Transform modes are deferred.

See [REMAINING_WORK.md](./REMAINING_WORK.md) for the full post-v1 list.

- Wordcraft AI revisions insert or replace plain text at the validated cursor/selection; verify formatting fidelity for rewritten selections. Select all in Wordcraft to request a whole-document text rewrite. Ask and Review do not alter the document.
- Office AI context includes at most the first 100,000 characters of saved document text and 1,200 characters per allowed project source. Unsaved changes must be saved before requesting AI.
- Wordcraft native selection handles include document revisions. Moving the cursor or editing during generation prevents automatic preview at a different location. Generate again, or explicitly preview at a newly chosen location. Editing and new prompts pause while an inline preview is open; scroll to review it, then accept or discard. Previews are temporary and are discarded on reload. If acceptance inserted text but saving or verification failed, use Retry saving; the text is not inserted a second time.

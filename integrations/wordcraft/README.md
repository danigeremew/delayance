# Wordcraft comparison integration

This branch embeds the actual Rust/WASM editor from [storytold/wordcraft](https://github.com/storytold/wordcraft), pinned to `04f6f53b8a4d8140c7bb62f949b0a6099a473da1` (0.6.1). The clone is in `vendor/wordcraft`, excluded from the Delayance repository. Upstream is MIT OR Apache-2.0; retain its LICENSE-MIT, LICENSE-APACHE, NOTICE, and ATTRIBUTION.md when distributing the compiled editor.

## Build and try

Install Rust 1.95+ with the `wasm32-unknown-unknown` target and `wasm-bindgen-cli` 0.2.129 (matching the pinned Cargo.lock):

````sh
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.129 --locked
``` Then, from the Delayance root:

```sh
pnpm wordcraft:prepare
pnpm wordcraft:build
pnpm dev
````

`prepare` clones the pinned source if needed, applies `upstream.patch` idempotently, and copies `delayance.rs` into the browser app. It refuses a different source revision. `build` compiles the real editor and copies the output into the ignored `apps/web/public/wordcraft` directory. Build outputs and the clone are not committed. Run the build again after modifying the bridge. These Rust files follow upstream's no-panic and origin-validation rules; the JavaScript host belongs to Delayance.

Open a project document and choose **Wordcraft (experimental)** in the **Document editor** selector. Switching first saves the active editor. Wordcraft retains its own ribbon, pagination, document model, and DOCX importer/exporter. Choose **Collabora** to compare on the same saved document. Use copies of representative documents for the comparison: upstream describes this release as alpha and documents import/export and layout gaps in `vendor/wordcraft/docs/gaps.md` and `ROADMAP.md`.

## Data and AI boundaries

- The API creates an ordinary user-scoped WOPI session. DOCX stays in MinIO; PostgreSQL retains version pointers, metadata, and analysis.
- The host acquires and refreshes a WOPI lock, downloads the DOCX through the API, and passes bytes only to its own iframe. Rust checks both parent origin and parent window.
- Wordcraft parses and formats the document, exports DOCX, and sends bytes back to the host. The host saves through WOPI with the lock and the original file version. Save failure leaves the editor unsaved. Browser code never accesses MinIO or PostgreSQL directly.
- Existing AI requests, validated text proposals, preview, explicit acceptance, permission/session/version checks, WOPI save, and completion verification are reused. No provider calls are added to the editor or build tools.
- Selection handles capture Wordcraft's document revision and actual range. A different range or any edit invalidates acceptance even if selected text is identical elsewhere.

## Experimental limits

Wordcraft is an alpha editor, not yet a verified replacement for Collabora. Its native ribbon supplies editing features; Delayance's LibreOffice-specific menu and Layout panel are hidden. Basic host undo/redo, find, comments, formatting commands, and text-based outline navigation are bridged. Unsupported host commands fail explicitly. Embedded Save/Save As save the current project DOCX; other native export formats download locally without replacing the canonical project DOCX. Delayance's Download DOCX exports the saved canonical file. Collaboration is unchanged.

`WORDCRAFT_BROWSER_URL` defaults to `http://localhost:48721/wordcraft/index.html`; `WORDCRAFT_WOPI_BASE_URL` defaults to `http://localhost:48722` and must be reachable by the browser. The normal API CORS origin must match the web origin. No provider keys or WOPI tokens appear in the iframe URL or build artifacts.

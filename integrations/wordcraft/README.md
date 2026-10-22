# Wordcraft editor integration

Delayance embeds the Rust/WASM editor from [storytold/wordcraft](https://github.com/storytold/wordcraft).
The supported upstream commit is recorded in [`upstream.json`](./upstream.json) (currently
`8e986366c7a5a261e058644a9446d4c73aa8a063`, 0.9.0). Upstream is MIT OR Apache-2.0;
retain LICENSE-MIT, LICENSE-APACHE, NOTICE, and ATTRIBUTION.md when distributing the editor.

## Source ownership and build isolation

- `vendor/wordcraft`: clean upstream clone. Pull here normally; preparation never modifies its
  files, branch or commits. The old customized checkout is preserved on its local `delayance` branch.
- `integrations/wordcraft`: Delayance-owned bridge (`delayance.rs`), embedded UI (`embedded.rs`),
  supported version (`upstream.json`), and minimal hook patch (`upstream.patch`). Edit these files.
- `.wordcraft/<revision>-<integration-hash>/source`: generated snapshot with the overlay applied.
  It is ignored and disposable. Do not edit it as source code.
- `apps/web/public/wordcraft`: packaged browser assets, replaced only after a successful pinned build.

Rust uses composition rather than class inheritance. Wordcraft does not yet expose every hook
needed for Delayance's shared chrome and AI previews. The small hook patch is applied only to the
build snapshot; upstream stays pristine. Pulls cannot conflict with our files, but upstream API
changes can still require adapting the patch or bridge. See [the implementation plan](./UPGRADE_PLAN.md)
and [upgrade verification](./VERIFICATION.md).

## Build and try

Git and `tar` must be on PATH. Install Rust 1.95+ with the `wasm32-unknown-unknown` target
and wasm-bindgen-cli 0.2.129:

```sh
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.129 --locked
pnpm wordcraft:prepare
pnpm wordcraft:build
pnpm dev
```

`prepare` exports the pinned Git commit, checks the hook patch, and copies the two Rust modules
only into a separate snapshot. Snapshot keys include the upstream commit and integration contents.
The current upstream branch and any uncommitted edits are preserved; local edits are not build
inputs. Preparation fails clearly on incompatible upstream. Rust compilation uses `--locked`.
An unsuccessful prepare/build leaves the published editor untouched. `build.json` records its SHA.
The default Cargo cache is `.wordcraft/target`; `CARGO_TARGET_DIR` and
`WORDCRAFT_WASM_BINDGEN` remain supported. Build output and upstream sources are ignored.

## Updating upstream safely

```sh
# Fetch and pull only the clean upstream branch (the backup delayance branch stays separate).
git -C vendor/wordcraft switch main
git -C vendor/wordcraft pull --ff-only

# Test a candidate without changing the supported pin or the served editor.
pnpm wordcraft:prepare --revision origin/main
pnpm wordcraft:build --revision origin/main
pnpm wordcraft:test
```

An explicit `--revision` builds candidate assets under the printed `.wordcraft/.../public/wordcraft`
path and never publishes them, even when that revision equals the pin. If the patch fails, adapt
`upstream.patch` against the new upstream in a disposable snapshot, then repeat. Never resolve a
failure by discarding the authorization, preview, save or lock hooks.

With the web server running, verify the real candidate using the existing browser suite:

```sh
PLAYWRIGHT_WORDCRAFT_ASSETS_DIR=/absolute/path/printed/by/build/public/wordcraft \
  pnpm --filter @delayance/web test:e2e wordcraft.spec.ts
```

This override is confined to test browser routing; the running app's assets stay unchanged.
After verification, set `revision` in `upstream.json` to the candidate's full commit SHA, update
`wasmBindgenVersion` if Cargo.lock requires it, and run `pnpm wordcraft:build` and the repository
checks. A normal build publishes the pinned revision. Commit the pin, bridge/patch changes and
verification results together. Pulling upstream alone does not upgrade the running app.

The old `workspace-v1.patch` and `legacy.patch` are retained as historical migration references;
preparation no longer applies or reverses patches inside the upstream clone.

Open a project document to use Wordcraft automatically. Wordcraft retains its native ribbon, pagination, document model, and DOCX importer/exporter. Embedded mode places the ribbon and status bar across Delayance’s workspace and removes the duplicate Wordcraft title bar. Delayance owns the shared document header and side panels. Use copies of representative documents for fidelity checks: upstream describes this release as alpha and documents import/export and layout gaps in `vendor/wordcraft/docs/gaps.md` and `ROADMAP.md`.

## Data and AI boundaries

- The API creates an ordinary user-scoped WOPI session. DOCX stays in the private local storage folder; PostgreSQL retains version pointers, metadata, and analysis.
- The host acquires and refreshes a WOPI lock, downloads the DOCX through the API, and passes bytes only to its own iframe. Rust checks both parent origin and parent window.
- Wordcraft parses and formats the document, exports DOCX, and sends bytes back to the host. The host saves through WOPI with the lock and the original file version. Save failure leaves the editor unsaved. Browser code never accesses the storage folder or PostgreSQL directly.
- Existing AI requests, validated text proposals, preview, explicit acceptance, permission/session/version checks, WOPI save, and completion verification are reused. No provider calls are added to the editor or build tools.
- Selection handles capture Wordcraft's document revision and actual range. A different range or any edit invalidates acceptance even if selected text is identical elsewhere.

## Experimental limits

Wordcraft is the sole configured editor and remains an alpha release requiring fidelity evaluation. Its native ribbon supplies editing features. Use the shared Layout tab for page and paragraph settings. Basic host undo/redo, find, comments, formatting commands, and text-based outline navigation are bridged. Unsupported host commands fail explicitly. Embedded Save/Save As save the current project DOCX; other native export formats download locally without replacing the canonical project DOCX. Delayance's Download DOCX exports the saved canonical file. Collaboration is unchanged.

`WORDCRAFT_BROWSER_URL` defaults to `http://localhost:48721/wordcraft/index.html`; `WORDCRAFT_WOPI_BASE_URL` defaults to `http://localhost:48722` and must be reachable by the browser. The normal API CORS origin must match the web origin. No provider keys or WOPI tokens appear in the iframe URL or build artifacts.

## Shared workspace layout

The origin-checked `Frame_Ready` handshake advertises `embeddedLayout: 1`. The host rejects old builds before loading a document. `Delayance_HostLayout` carries validated left/right widths in CSS pixels and six hexadecimal Delayance theme colors. Rust reserves those widths after rendering the full-width ribbon/status bar, accounting for egui interface zoom independently of device pixel ratio.

After layout, `Delayance_Layout` reports actual chrome heights, center bounds, visible native overlay rectangles, modal/File blocking state, write permission, and undo/redo availability. The host validates the message and uses an SVG union clip on the persistent iframe. React sidebars sit beneath the clip cutouts; native menus, dialogs and File views remain above them. Host pointer events dismiss native popups. Layout changes never recreate the editor or WOPI session.

Stored sidebar widths remain unchanged. If both panels leave less than 480 CSS pixels for writing, the assistant temporarily collapses, followed by the tools panel if necessary; widening restores them. On windows narrower than 480 pixels, the canvas uses the available width. The embedded theme follows Delayance; standalone Wordcraft retains its own chrome and theme.

## Lock lifecycle and conflicting editors

The host releases its exact WOPI lock on component cleanup and `pagehide`, using the authorized form-beacon release endpoint with a keepalive fallback. A late lock/refresh response after closing also releases its own lock. Restoring a cached page reacquires the lock and checks the saved version before continuing.

An initial lock conflict opens the saved DOCX in native read-only mode and exposes **Retry editing**, which requests a fresh session and reloads the read-only editor. No other editor’s lock is removed, and all save/version/AI acceptance checks remain in place. Crashes that cannot send a page-exit request rely on the existing lock TTL.

### Inline AI text previews

`preview` takes the validated captured handle, proposal ID, text and insert/replace action. It rejects a moved selection or changed revision. The native editor clones the document into a provisional read-only session, highlights the proposed range using native page geometry, and positions ✓/✕ controls alongside its first visible line. Their measured bounds are included in layout messages. `Delayance_PreviewDecision` contains only a proposal ID and accept/reject decision; the host validates origin, source and payload before acting.

The original Session remains intact, including its undo history. Native editing commands and all WOPI/native export paths are blocked during preview. `preview-discard` restores it without writes. After explicit acceptance and API authorization, `preview-commit` restores it and applies one native text operation; repeated commits fail. Typing preferences cannot change the replacement range. The host then saves and verifies completion, remembering that insertion succeeded so retries never paste again. Closing the assistant panel preserves its controller; reloading the document discards any unaccepted preview.

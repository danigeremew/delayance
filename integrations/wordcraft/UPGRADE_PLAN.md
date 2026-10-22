# Wordcraft isolation and upgrade plan

## Objective

Keep upstream Wordcraft independently pullable while preserving Delayance's native editing,
shared chrome, WOPI saves, validated selections and explicit AI preview decisions.

## Design

Rust uses composition rather than class inheritance. Wordcraft's browser shell already wraps
`WordApp`, but its public API does not expose every hook for host sidebars, host theme tokens
and provisional previews. Keep those hooks in a small versioned patch outside the upstream
checkout; keep the bridge and embedded UI in Delayance-owned Rust modules.

1. Preserve the existing `delayance` branch in `vendor/wordcraft` as a backup. Switch the clean
   upstream `main` to the fetched head without rebasing or discarding custom commits.
2. Store the supported upstream SHA and wasm-bindgen version in `upstream.json`.
3. Export committed upstream bytes into `.wordcraft/<revision>-<integration-hash>/source`.
   Never patch or copy files into `vendor/wordcraft`. Local edits there remain untouched.
4. Check and apply `upstream.patch` and install the two Delayance modules only in the generated
   snapshot. Stop on incompatible upstream changes; never silently drop a hook.
5. Build and package candidates separately. `--revision` never publishes. Swap complete static
   assets only after a successful build of the pinned revision.
6. Run build-isolation tests and browser tests against staged assets before changing the
   running editor. Keep DOCX/Wordcraft, authorization, WOPI lock/version, and user acceptance
   boundaries unchanged.

## Verification

- Node regression tests: local changes preserved, pin stable after upstream advances, changed
  integration gets a new snapshot, incompatible upgrade leaves assets untouched, failed asset
  swap restores the previous editor.
- Locked Rust/WASM release build of the candidate; embedded Rust tests where native dependencies
  permit them.
- Playwright Wordcraft suite against the candidate: DOCX saving, selection revision checks,
  preview accept/discard, read-only mode, lock release/retry, native menus and sidebar geometry.
- Repository typecheck, lint, unit tests, formatting check and E2E suite.

## Remaining coupling

Pulling upstream no longer causes merge conflicts with Delayance files. It cannot guarantee
binary/API compatibility: upstream changes can still require porting the small patch or bridge.
The pinned revision and isolated candidate workflow make such upgrades explicit and reviewable.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { prepare, publishAssets, build } from './wordcraft-build.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'delayance-wordcraft-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const upstream = join(root, 'vendor/wordcraft');
  const integration = join(root, 'integrations/wordcraft');
  mkdirSync(upstream, { recursive: true });
  mkdirSync(integration, { recursive: true });
  const git = (...args) => {
    const result = spawnSync(
      'git',
      ['-c', 'commit.gpgSign=false', '-c', `core.hooksPath=${join(root, 'no-hooks')}`, ...args],
      { cwd: upstream, encoding: 'utf8' },
    );
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  git('init', '-q');
  for (const path of ['apps/wordcraft-web/src/web', 'crates/ui-egui/src']) {
    mkdirSync(join(upstream, path), { recursive: true });
    writeFileSync(join(upstream, path, 'upstream.rs'), '// untouched upstream\n');
  }
  writeFileSync(join(upstream, 'example.txt'), 'upstream\n');
  git('add', '.');
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-qm', 'upstream');
  const revision = git('rev-parse', 'HEAD');
  writeFileSync(join(upstream, 'example.txt'), 'embedded\n');
  writeFileSync(join(integration, 'upstream.patch'), git('diff') + '\n');
  git('restore', 'example.txt');
  writeFileSync(join(integration, 'delayance.rs'), '// bridge v1\n');
  writeFileSync(join(integration, 'embedded.rs'), '// layout v1\n');
  return { root, upstream, integration, git, config: { revision } };
}

test('preparation uses committed bytes and preserves all local changes and the current branch', (t) => {
  const f = fixture(t);
  writeFileSync(join(f.upstream, 'example.txt'), 'local unsaved work\n');
  writeFileSync(join(f.upstream, 'untracked.txt'), 'keep me\n');
  const before = f.git('status', '--porcelain');
  const branch = f.git('symbolic-ref', 'HEAD');
  const prepared = prepare(f);
  assert.equal(readFileSync(join(prepared.source, 'example.txt'), 'utf8'), 'embedded\n');
  assert.equal(
    readFileSync(join(prepared.source, 'apps/wordcraft-web/src/web/delayance.rs'), 'utf8'),
    '// bridge v1\n',
  );
  assert.equal(f.git('status', '--porcelain'), before);
  assert.equal(f.git('symbolic-ref', 'HEAD'), branch);
  assert.equal(readFileSync(join(f.upstream, 'example.txt'), 'utf8'), 'local unsaved work\n');
  assert.equal(prepare(f).directory, prepared.directory);
  writeFileSync(join(f.integration, 'delayance.rs'), '// bridge v2\n');
  assert.notEqual(prepare(f).directory, prepared.directory);
});

test('pulling a new upstream commit does not change the pinned snapshot', (t) => {
  const f = fixture(t);
  const pinned = prepare(f);
  writeFileSync(join(f.upstream, 'new.txt'), 'upstream improvement\n');
  f.git('add', '.');
  f.git('-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-qm', 'next');
  assert.equal(prepare(f).directory, pinned.directory);
  const candidate = prepare({ ...f, revision: 'HEAD' });
  assert.notEqual(candidate.directory, pinned.directory);
  assert.equal(readFileSync(join(candidate.source, 'new.txt'), 'utf8'), 'upstream improvement\n');
  assert.equal(f.git('status', '--porcelain'), '');
});

test('incompatible upstream fails without changing published assets or the checkout', (t) => {
  const f = fixture(t);
  const destination = join(f.root, 'apps/web/public/wordcraft');
  mkdirSync(destination, { recursive: true });
  writeFileSync(join(destination, 'editor.wasm'), 'working editor');
  writeFileSync(join(f.upstream, 'example.txt'), 'breaking upstream change\n');
  f.git('add', '.');
  f.git('-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-qm', 'breaking');
  const before = f.git('rev-parse', 'HEAD');
  assert.throws(
    () => prepare({ ...f, revision: 'HEAD' }),
    /incompatible with the Delayance overlay/,
  );
  assert.equal(readFileSync(join(destination, 'editor.wasm'), 'utf8'), 'working editor');
  assert.equal(f.git('rev-parse', 'HEAD'), before);
  assert.equal(f.git('status', '--porcelain'), '');
});

test('publication replaces complete output and restores the working editor on a failed swap', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'delayance-wordcraft-publish-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const destination = join(root, 'published');
  const candidate = join(root, 'candidate');
  mkdirSync(destination);
  writeFileSync(join(destination, 'editor.wasm'), 'old');
  assert.throws(() => publishAssets(candidate, destination));
  assert.equal(readFileSync(join(destination, 'editor.wasm'), 'utf8'), 'old');
  mkdirSync(candidate);
  writeFileSync(join(candidate, 'editor.wasm'), 'new');
  publishAssets(candidate, destination);
  assert.equal(readFileSync(join(destination, 'editor.wasm'), 'utf8'), 'new');
  assert.equal(existsSync(destination + '.previous'), false);
});

test('an unpinned candidate cannot publish and concurrent builds cannot share compiled bytes', (t) => {
  const f = fixture(t);
  const prepared = prepare(f);
  assert.throws(
    () => build({ ...prepared, revision: '0'.repeat(40) }, { publish: true }),
    /Only the pinned Wordcraft revision can be published/,
  );
  mkdirSync(join(f.root, '.wordcraft/build.lock'));
  assert.throws(() => build(prepared), /Another Wordcraft build holds/);
  assert.equal(existsSync(join(f.root, '.wordcraft/build.lock')), true);
});

test('a failed build releases its lock and retains the published editor', (t) => {
  const f = fixture(t);
  const prepared = prepare(f);
  const destination = join(f.root, 'apps/web/public/wordcraft');
  mkdirSync(destination, { recursive: true });
  writeFileSync(join(destination, 'editor.wasm'), 'working editor');
  const previous = process.env.WORDCRAFT_WASM_BINDGEN;
  process.env.WORDCRAFT_WASM_BINDGEN = join(f.root, 'missing-wasm-bindgen');
  try {
    assert.throws(() => build(prepared, { publish: true }), /ENOENT/);
    assert.equal(existsSync(join(f.root, '.wordcraft/build.lock')), false);
    assert.equal(readFileSync(join(destination, 'editor.wasm'), 'utf8'), 'working editor');
  } finally {
    if (previous === undefined) delete process.env.WORDCRAFT_WASM_BINDGEN;
    else process.env.WORDCRAFT_WASM_BINDGEN = previous;
  }
});

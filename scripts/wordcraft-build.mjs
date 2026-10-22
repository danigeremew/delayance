import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  copyFileSync,
  readFileSync,
  writeFileSync,
  mkdtempSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { resolve, join } from 'node:path';

const integrationFiles = ['upstream.patch', 'delayance.rs', 'embedded.rs'];

export function run(command, args, cwd, options = {}) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status})`);
  return result.stdout;
}

export function readConfig(root) {
  const value = JSON.parse(
    readFileSync(join(root, 'integrations/wordcraft/upstream.json'), 'utf8'),
  );
  if (
    value.repository !== 'https://github.com/storytold/wordcraft.git' ||
    !/^[a-f0-9]{40}$/.test(value.revision) ||
    !/^\d+\.\d+\.\d+$/.test(value.wasmBindgenVersion)
  ) {
    throw new Error('Invalid Wordcraft upstream configuration');
  }
  return value;
}

/** Export committed upstream bytes only; never patch, checkout, or reset the user's clone. */
export function prepare({ root, config = readConfig(root), revision = config.revision }) {
  const upstream = join(root, 'vendor/wordcraft');
  const integration = join(root, 'integrations/wordcraft');
  const cache = join(root, '.wordcraft');
  if (!existsSync(join(upstream, '.git'))) {
    mkdirSync(join(root, 'vendor'), { recursive: true });
    run('git', ['clone', config.repository, upstream], root);
  }
  const resolved = run(
    'git',
    ['rev-parse', '--verify', '--end-of-options', `${revision}^{commit}`],
    upstream,
    { encoding: 'utf8', stdio: 'pipe' },
  ).trim();
  if (!/^[a-f0-9]{40}$/.test(resolved)) throw new Error('Invalid Wordcraft commit');
  const hash = createHash('sha256');
  hash.update(resolved);
  for (const name of integrationFiles) hash.update(readFileSync(join(integration, name)));
  hash.update(readFileSync(new URL('./wordcraft-build.mjs', import.meta.url)));
  const directory = join(cache, `${resolved.slice(0, 12)}-${hash.digest('hex').slice(0, 16)}`);
  const source = join(directory, 'source');
  if (!existsSync(join(directory, 'prepared.json'))) {
    mkdirSync(cache, { recursive: true });
    const temporary = mkdtempSync(join(cache, 'prepare-'));
    const extracted = join(temporary, 'source');
    mkdirSync(extracted);
    try {
      const archive = join(temporary, 'source.tar');
      run('git', ['archive', '--format=tar', `--output=${archive}`, resolved], upstream);
      run('tar', ['-xf', archive, '-C', extracted], root);
      rmSync(archive);
      // Stop git apply from resolving paths into Delayance's parent repository.
      run('git', ['init', '--quiet', extracted], root);
      const patch = join(integration, 'upstream.patch');
      try {
        run('git', ['apply', '--check', patch], extracted);
        run('git', ['apply', patch], extracted);
      } catch {
        throw new Error(
          `Wordcraft ${resolved} is incompatible with the Delayance overlay. ` +
            'Port integrations/wordcraft/upstream.patch before upgrading. ' +
            'The upstream checkout and published editor were not changed.',
        );
      }
      copyFileSync(
        join(integration, 'delayance.rs'),
        join(extracted, 'apps/wordcraft-web/src/web/delayance.rs'),
      );
      copyFileSync(
        join(integration, 'embedded.rs'),
        join(extracted, 'crates/ui-egui/src/embedded.rs'),
      );
      writeFileSync(
        join(temporary, 'prepared.json'),
        JSON.stringify({ revision: resolved }) + '\n',
      );
      renameSync(temporary, directory);
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  }
  return { root, config, revision: resolved, directory, source };
}

/** Swap a complete output directory only after compilation and packaging succeed. */
export function publishAssets(candidate, destination) {
  const backup = `${destination}.previous`;
  if (existsSync(backup))
    throw new Error(`Previous editor backup exists at ${backup}; inspect it before publishing`);
  const hadPrevious = existsSync(destination);
  if (hadPrevious) renameSync(destination, backup);
  try {
    renameSync(candidate, destination);
  } catch (error) {
    if (hadPrevious) renameSync(backup, destination);
    throw error;
  }
  if (hadPrevious) rmSync(backup, { recursive: true });
}

export function build(prepared, { publish = false } = {}) {
  if (publish && prepared.revision !== prepared.config.revision) {
    throw new Error('Only the pinned Wordcraft revision can be published');
  }
  const cache = join(prepared.root, '.wordcraft');
  mkdirSync(cache, { recursive: true });
  const lock = join(cache, 'build.lock');
  try {
    mkdirSync(lock);
  } catch (error) {
    if (error.code === 'EEXIST') {
      throw new Error(
        `Another Wordcraft build holds ${lock}. If it stopped unexpectedly, remove this directory before retrying.`,
      );
    }
    throw error;
  }
  try {
    return buildUnlocked(prepared, { publish });
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}

function buildUnlocked(prepared, { publish }) {
  const { root, config, source, directory, revision } = prepared;
  const tool = process.env.WORDCRAFT_WASM_BINDGEN ?? 'wasm-bindgen';
  const version = run(tool, ['--version'], root, { encoding: 'utf8', stdio: 'pipe' }).trim();
  if (version !== `wasm-bindgen ${config.wasmBindgenVersion}`) {
    throw new Error(`Install wasm-bindgen-cli ${config.wasmBindgenVersion}; found ${version}`);
  }
  const target = process.env.CARGO_TARGET_DIR
    ? resolve(root, process.env.CARGO_TARGET_DIR)
    : join(root, '.wordcraft/target');
  run(
    'cargo',
    ['build', '--release', '--locked', '--target', 'wasm32-unknown-unknown', '-p', 'wordcraft-web'],
    source,
    {
      env: { ...process.env, CARGO_TARGET_DIR: target },
    },
  );
  const output = join(directory, 'public');
  mkdirSync(output, { recursive: true });
  const candidate = mkdtempSync(join(output, 'candidate-'));
  try {
    run(
      tool,
      [
        '--target',
        'web',
        '--out-name',
        'wordcraft',
        '--out-dir',
        candidate,
        join(target, 'wasm32-unknown-unknown/release/wordcraft-web.wasm'),
      ],
      root,
    );
    const html = readFileSync(join(source, 'apps/wordcraft-web/index.html'), 'utf8')
      .replace(/<link data-trunk rel="rust"[^>]*>/, '')
      .replace('../../assets/app-icon/wordcraft.ico', './wordcraft.ico')
      .replace('data-trunk rel="icon"', 'rel="icon"')
      .replace(
        '</body>',
        '<script type="module">import init from "./wordcraft.js"; init().catch(() => { document.getElementById("wordcraft_loading").textContent = "Wordcraft failed to start. Try a browser with WebGL2."; });</script></body>',
      );
    writeFileSync(join(candidate, 'index.html'), html);
    copyFileSync(join(source, 'assets/app-icon/wordcraft.ico'), join(candidate, 'wordcraft.ico'));
    for (const name of ['LICENSE-MIT', 'LICENSE-APACHE', 'NOTICE', 'ATTRIBUTION.md']) {
      copyFileSync(join(source, name), join(candidate, name));
    }
    writeFileSync(join(candidate, 'build.json'), JSON.stringify({ revision }) + '\n');
    const destination = publish
      ? join(root, 'apps/web/public/wordcraft')
      : join(output, 'wordcraft');
    mkdirSync(resolve(destination, '..'), { recursive: true });
    publishAssets(candidate, destination);
    console.log(
      `${publish ? 'Published' : 'Candidate built (not published)'} Wordcraft ${revision}: ${destination}`,
    );
    return destination;
  } finally {
    rmSync(candidate, { recursive: true, force: true });
  }
}

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const source = resolve(root, 'vendor/wordcraft');
const revision = '04f6f53b8a4d8140c7bb62f949b0a6099a473da1';
const patch = resolve(root, 'integrations/wordcraft/upstream.patch');
function run(command, args, cwd = root, options = {}) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status})`);
}
function gitOutput(args) {
  const result = spawnSync('git', args, { cwd: source, encoding: 'utf8' });
  if (result.status !== 0) throw new Error('Cannot inspect the Wordcraft checkout');
  return result.stdout.trim();
}
function prepare() {
  if (!existsSync(resolve(source, '.git'))) {
    mkdirSync(resolve(root, 'vendor'), { recursive: true });
    run('git', ['clone', 'https://github.com/storytold/wordcraft.git', source]);
    run('git', ['checkout', '--detach', revision], source);
  }
  if (gitOutput(['rev-parse', 'HEAD']) !== revision) {
    throw new Error(
      `Wordcraft must be at ${revision}; preserve your local changes before updating it.`,
    );
  }
  const alreadyApplied =
    spawnSync('git', ['apply', '--reverse', '--check', patch], { cwd: source, stdio: 'ignore' })
      .status === 0;
  if (!alreadyApplied) run('git', ['apply', '--check', patch], source);
  if (!alreadyApplied) run('git', ['apply', patch], source);
  copyFileSync(
    resolve(root, 'integrations/wordcraft/delayance.rs'),
    resolve(source, 'apps/wordcraft-web/src/web/delayance.rs'),
  );
  console.log(`Wordcraft ${revision} prepared at ${source}`);
}
try {
  if (!['prepare', 'build'].includes(process.argv[2])) throw new Error('Use prepare or build');
  prepare();
  if (process.argv[2] === 'build') {
    run(
      'cargo',
      [
        'build',
        '--release',
        '--locked',
        '--target',
        'wasm32-unknown-unknown',
        '-p',
        'wordcraft-web',
      ],
      source,
    );
    const destination = resolve(root, 'apps/web/public/wordcraft');
    mkdirSync(destination, { recursive: true });
    const target = process.env.CARGO_TARGET_DIR
      ? resolve(root, process.env.CARGO_TARGET_DIR)
      : resolve(source, 'target');
    const tool = process.env.WORDCRAFT_WASM_BINDGEN ?? 'wasm-bindgen';
    run(tool, [
      '--target',
      'web',
      '--out-name',
      'wordcraft',
      '--out-dir',
      destination,
      resolve(target, 'wasm32-unknown-unknown/release/wordcraft-web.wasm'),
    ]);
    const html = readFileSync(resolve(source, 'apps/wordcraft-web/index.html'), 'utf8')
      .replace(/<link data-trunk rel="rust"[^>]*>/, '')
      .replace('../../assets/app-icon/wordcraft.ico', './wordcraft.ico')
      .replace('data-trunk rel="icon"', 'rel="icon"')
      .replace(
        '</body>',
        '<script type="module">import init from "./wordcraft.js"; init().catch(() => { document.getElementById("wordcraft_loading").textContent = "Wordcraft failed to start. Try a browser with WebGL2."; });</script></body>',
      );
    writeFileSync(resolve(destination, 'index.html'), html);
    copyFileSync(
      resolve(source, 'assets/app-icon/wordcraft.ico'),
      resolve(destination, 'wordcraft.ico'),
    );
    for (const name of ['LICENSE-MIT', 'LICENSE-APACHE', 'NOTICE', 'ATTRIBUTION.md']) {
      copyFileSync(resolve(source, name), resolve(destination, name));
    }
    console.log(
      'Wordcraft is ready: choose Wordcraft (experimental) in the workspace editor selector.',
    );
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Wordcraft setup failed');
  process.exitCode = 1;
}

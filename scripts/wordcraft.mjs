import { resolve } from 'node:path';
import { prepare, build, readConfig } from './wordcraft-build.mjs';

const root = resolve(import.meta.dirname, '..');
const [command, ...args] = process.argv.slice(2);
try {
  if (!['prepare', 'build'].includes(command)) throw new Error('Use prepare or build');
  if (args.length && (args.length !== 2 || args[0] !== '--revision' || !args[1])) {
    throw new Error('Usage: wordcraft.mjs prepare|build [--revision <commit-or-ref>]');
  }
  const config = readConfig(root);
  const prepared = prepare({ root, config, revision: args[1] });
  if (command === 'build') build(prepared, { publish: args.length === 0 });
  else console.log(`Prepared ${prepared.revision} at ${prepared.source}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Wordcraft setup failed');
  process.exitCode = 1;
}

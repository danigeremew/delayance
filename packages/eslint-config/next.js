import { libraryConfig } from './library.js';

/** @type {import('eslint').Linter.Config[]} */
export default [
  ...libraryConfig,
  {
    ignores: ['.next/**'],
  },
];

import { libraryConfig } from './library.js';

/** @type {import('eslint').Linter.Config[]} */
export default [
  ...libraryConfig,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
];

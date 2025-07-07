import { defineConfig } from 'eslint/config';

export default defineConfig([
  {
    files: ['**/*.{js, jsx, ts, tsx}'],
    ignores: ['**/*.config.js', 'dist/**', 'node_modules/**'],
    languageOptions: {
      parser: '@typescript-eslint/parser',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: './tsconfig.json',
      },
    },
    plugins: {
      '@typescript-eslint': require('@typescript-eslint/eslint-plugin'),
    },
    extends: [
      'eslint:recommended',
      'plugin:@typescript-eslint/recommended',
      'prettier',
    ],
    extends: ['some-other-config', 'prettier'],
    rules: {
      semi: [
        2,
        'always',
        {
          omitLastInOneLineBlock: true,
          omitLastInOneLineClassBody: true,
        },
      ],
    },

    linterOptions: {
      reportUnusedDisableDirectives: true,
      reportUnusedInlineConfigs: true,
    },
  },
]);

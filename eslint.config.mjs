/**
 * ESLint configuration for game-v1 (pnpm workspace)
 * 
 * INSTALLATION REQUIRED:
 * Run the following commands in the project root (D:\aiserver\game-v1):
 * 
 *   pnpm add -D eslint prettier eslint-plugin-react eslint-plugin-react-hooks
 *   pnpm add -D @typescript-eslint/parser @typescript-eslint/eslint-plugin
 *   pnpm add -D eslint-config-prettier
 * 
 * This config extends:
 *   - eslint:recommended
 *   - plugin:@typescript-eslint/recommended
 *   - plugin:react/recommended
 *   - prettier (must be last to disable conflicting rules)
 */

import eslintConfigPrettier from 'eslint-config-prettier'

export default [
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**'],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parser: await import('@typescript-eslint/parser'),
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      '@typescript-eslint': await import('@typescript-eslint/eslint-plugin'),
      react: await import('eslint-plugin-react'),
      'react-hooks': await import('eslint-plugin-react-hooks'),
    },
    rules: {
      ...eslintConfigPrettier.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
    },
  },
  {
    // Shared package specific rules
    files: ['packages/shared/src/**/*.ts', 'packages/shared/src/**/*.tsx'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // Client specific rules
    files: ['packages/client/src/**/*.ts', 'packages/client/src/**/*.tsx'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // Server specific rules
    files: ['packages/server/src/**/*.ts', 'packages/server/src/**/*.tsx'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
]
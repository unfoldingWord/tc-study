import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

/**
 * Lint debt ratchet (P4):
 * - `no-console` warns on log/info/debug (allow warn/error only) — aligned with consoleLogFreeze
 * - `--max-warnings` set in package.json `lint`/`check` to current count (fail-closed growth)
 */
export default defineConfig([
  globalIgnores([
    'dist',
    'node_modules',
    'public',
    '.wrangler',
    '.turbo',
    '.bt-cache',
    'e2e',
    'playwright.config.ts',
    'playwright-report',
    'test-results',
  ]),
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // Freeze: success-path console.log/info/debug must not grow; warn/error allowed
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      // Transitional — ratchet via package.json --max-warnings (not max-warnings 0 yet)
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'no-unused-vars': 'off',
      'prefer-const': 'warn',
      'no-empty': 'warn',
      'require-yield': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      // P3: rules-of-hooks fail-closed (withPanelCommunication + StudioLinkedPanel fixed)
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/error-boundaries': 'off',
      'react-hooks/static-components': 'off',
      'react-hooks/component-hook-factories': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/incompatible-library': 'off',
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    files: ['src/**/*.{test,spec}.{ts,tsx}', 'src/**/__tests__/**/*.{ts,tsx}'],
    rules: {
      'no-console': 'off',
    },
  },
])

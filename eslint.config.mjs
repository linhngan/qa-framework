// ESLint flat config (Task 08). Prettier owns formatting, so eslint-config-prettier
// comes last and turns off every rule that would fight it.
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import playwright from 'eslint-plugin-playwright';
import tseslint from 'typescript-eslint';
import { LINT_IGNORES } from './scripts/lint-scope.mjs';

// Our .mjs scripts run on Node. Declared here so no extra globals package is needed.
const NODE_GLOBALS = Object.fromEntries(
  [
    'process',
    'console',
    'Buffer',
    'URL',
    'URLSearchParams',
    'TextEncoder',
    'TextDecoder',
    'AbortController',
    'structuredClone',
    'setTimeout',
    'clearTimeout',
    'setInterval',
    'clearInterval',
    'setImmediate',
    'queueMicrotask',
  ].map((name) => [name, 'readonly']),
);

export default defineConfig([
  globalIgnores(LINT_IGNORES),

  // Our own Node scripts, hooks, safety checks and config files.
  {
    files: ['**/*.mjs'],
    extends: [js.configs.recommended],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: NODE_GLOBALS },
  },

  // Active TypeScript: env/, pages/, tests/, safety/ and playwright.config.ts.
  {
    files: ['**/*.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    rules: {
      // A missing await on a Playwright call or envGuard action fails silently.
      // node:test's describe/it/test return promises the runner itself tracks.
      '@typescript-eslint/no-floating-promises': [
        'error',
        { allowForKnownSafeCalls: [{ from: 'package', package: 'node:test', name: ['describe', 'it', 'test'] }] },
      ],
    },
  },

  // Browser tests. env/runIfEnv.ts is outside this scope on purpose: its
  // conditional test.skip(...) is the intended environment gate (G2).
  {
    files: ['tests/**/*.ts'],
    extends: [playwright.configs['flat/recommended']],
  },
  {
    files: ['tests/**/*.spec.ts'],
    rules: {
      'playwright/no-focused-test': 'error',
      'playwright/no-skipped-test': 'error',
    },
  },

  prettier,
]);

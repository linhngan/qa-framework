// Paths that ESLint and lint-staged leave alone (Task 08). .prettierignore lists
// the same paths for Prettier, which cannot import this file: keep both in step.
// The pre-commit secret scan ignores this list and checks every staged file.
export const LINT_IGNORES = [
  'evidence/*-raw-draft.ts', // archived raw drafts, kept unchanged as evidence
  'jira-seed/**', // supplied course Jira pack
  'scripts/jira-seed.mjs', // supplied course Jira import script
  'node_modules/**',
  'playwright-report/**',
  'test-results/**',
  'blob-report/**',
  '.playwright-mcp/**',
  '.husky/_/**',
];

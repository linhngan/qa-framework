# qa-framework
Playwright + TypeScript tests for the Codemify course apps. Setup and background: [README.md](README.md).

## Targets
- dev: https://dev.ai-orchestration-courses.com (default)
- prod: https://ai-orchestration-courses.com
- Select only with APP_ENV=dev|prod, resolved by env/target.ts (resolveTarget/getTarget). Missing means dev.
- Leave BASE_URL unset. Never hard-code URLs or add LOCAL_SANDBOX_DIR, local servers or other targets.
- The target is fixed per process: start a new command to switch. Don't change process.env at runtime.
- Run prod (`npm run test:prod`) only when explicitly asked.

## Teaching login
- Course demo account `AUTHOR` (author@codemify.test) lives in tests/support/users.ts.
  It is course-designated teaching data, not a personal secret.
- Import it; never copy its values into other files or print its password.
- Add no personal or other credentials.

## Commands
- `npm test` — browser tests on dev
- `npm run test:prod` — browser tests on prod (explicit request only)
- `npm run test:list` — list tests on dev
- `npm run typecheck` — TypeScript check
- `npm run lint` — ESLint · `npm run format:check` — Prettier check · `npm run format` — apply Prettier
- `npm run test:safety` — isolated target/helper checks; no browser, no network
- Git hooks (.husky/) run on commit and push; never bypass them (G7)

## Always
1. No data changes on prod.
2. Human approval before any action that changes an outside system (dev data, Jira, GitHub).
3. No secrets in tracked files or in output.

Details: .claude/rules/01-guardrails.md.

## Rule files
| File | Applies to |
|---|---|
| .claude/rules/01-guardrails.md | whole project, always loaded |
| .claude/rules/10-playwright-pom.md | tests/**/*.ts, pages/**/*.ts |
| .claude/rules/20-data-management.md | tests/**/*.ts, pages/**/*.ts, scripts/**, jira-seed/** |
| .claude/rules/30-test-names.md | tests/**/*.spec.ts |

## Layout
- tests/blog/ browser tests · tests/support/ env wrapper, shared users
- pages/ Page Objects · env/ target, runIfEnv, envGuard
- safety/ isolated checks (node --test) · evidence/ task notes and raw drafts (not typechecked or run)

## Not yet in scope
Database, CI.

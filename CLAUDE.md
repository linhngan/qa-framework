# qa-framework
Playwright + TypeScript tests for the course apps (dev and prod only). See [README.md](README.md).

## Boundaries
- Targets come only from [env/target.ts](env/target.ts) (resolveTarget/getTarget). Never hard-code URLs.
- Only APP_ENV=dev|prod. Leave BASE_URL unset. Never add LOCAL_SANDBOX_DIR, local servers or other targets.
- Switching environments means a new process. Don't mutate process.env at runtime.
- Test helpers import [tests/support/env.ts](tests/support/env.ts), never playwright.config.ts.
- Locators: getByTestId (data-testid). Env-limited tests use [runIfEnv](env/runIfEnv.ts).
- Data-changing actions go through [envGuard](env/envGuard.ts) (throws on prod). No dry-run mode.
- Never read or print .env files, auth state or credentials. No secrets in the repo.
- Run prod (`npm run test:prod`) only when explicitly asked.
- Not yet in scope: Page Objects, Jira, database, MCP, CI.

## Commands
- `npm test` — browser tests on dev
- `npm run test:prod` — browser tests on prod (explicit)
- `npm run test:list` — list tests (dev)
- `npm run typecheck` — TypeScript check
- `npm run test:safety` — resolver checks, no browser

## Key files
[playwright.config.ts](playwright.config.ts) · [env/target.ts](env/target.ts) · [tests/support/env.ts](tests/support/env.ts) · [safety/](safety/) · [.claude/settings.json](.claude/settings.json)

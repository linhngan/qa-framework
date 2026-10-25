# qa-framework
A framework that tests the supplied course applications.

## Setup
Node 24. From this folder: `npm ci`, then `npx playwright install chromium`
(run here so the browser matches the project's Playwright 1.61.1).
`npm ci` also runs `prepare` (`husky`), which turns on the Git hooks below.

## Commands
- `npm test`: browser tests on dev (always dev, even if your shell sets APP_ENV)
- `npm run test:prod`: browser tests on prod, selected on purpose
- `npm run test:list`: list tests on dev
- `npm run typecheck`: TypeScript check (TypeScript 6.0.3, the newest that typescript-eslint 8.64.0 supports)
- `npm run lint`: ESLint, including our `.mjs` scripts
- `npm run format:check` / `npm run format`: check or apply Prettier
- `npm run test:safety`: target and helper checks; no browser, no network

## Environments
Only two targets exist: dev (https://dev.ai-orchestration-courses.com)
and prod (https://ai-orchestration-courses.com), resolved in env/target.ts.
APP_ENV must be exactly `dev` or `prod`; missing means dev. Leave BASE_URL unset.
The target is fixed for the whole run: to switch, start a new command.
Prod is never chosen by accident; only `npm run test:prod` selects it.

## What the safety helpers do not stop
- `runIfEnv` only skips tests that call it; a test without it runs on prod.
- `envGuard` only blocks actions wrapped in it; a direct click that creates
  or deletes data is not blocked.
- The DEVELOPMENT banner check is a test, not a lock.
- Nothing stops someone from running `npm run test:prod` on purpose.

## Why retries are 0
A failure shows up on the first attempt, so flaky behaviour is not hidden,
and no step is repeated against a real site.

## Listing tests
`npm run test:list` should show 5 tests in 4 files, all in one project, [chromium].
Listing doesn't run tests, so on prod it still shows all 5; they are only skipped when run.

## Why "at least one" category (Task 04)
- Why at least one: dev data is shared and changes, and the requirement is only a non-empty list.
- When an exact count is right: when the test seeds its own data, or the number itself is the requirement.

## Project rules, Claude hooks and Git hooks
Three layers, each with a different reach. None of them replaces review.

**Project rules** (CLAUDE.md and .claude/rules/) tell Claude, and reviewers, how to work.
- Example: G2 says every data-changing spec starts with `runIfEnv(test, ['dev'])`.
- Limit: a rule is an instruction, not a lock. Items marked ⚠️ in the rule files have no check.

**Claude hooks** (.claude/settings.json, scripts/hooks/) run around Claude Code's own actions.
- Example: the PreToolUse guard refuses a Claude Edit that adds `.only` to a spec, before
  the file changes. Other hooks record edits in vault/_changelog/ and remind about the journal.
- Limit: they see only Claude Code's Edit and Write tools, not a shell command or your own
  editor, and the guard fails open on bad input.

**Git hooks** (.husky/, scripts/git-hooks/) run on every `git commit` and `git push` here,
whoever makes them.
- pre-commit: scans the staged content of every staged file, new ones included, for secret
  files (`.env`, `.env.*`, `*.pem`, `*.key`, `*.p12`, `id_rsa`, `id_ed25519`) and the Task 06
  token patterns, naming file, line and kind but never the value. `.env.example` may be
  staged, but its content is still scanned. Then lint-staged runs ESLint and a Prettier
  check on the staged files.
- pre-push: refuses any push whose destination is `refs/heads/main`, even
  `git push origin week-2:main`, then runs `npm run typecheck` and `npm run test:list`.
  No browser starts.
- Example: `git add .env && git commit` stops with
  `pre-commit: BLOCKED — .env is a protected secret file (.env)…`.
- Limit: hooks are local. They run only once `prepare` has activated them, and
  `--no-verify` or `HUSKY=0` skips them silently, which rule G7 forbids. The token check
  knows four prefixes only. No CI repeats these checks.
- `ALLOW_MAIN_PUSH=1 git push …` lifts only the main refusal, for an exceptional,
  approved push to main. Course work never uses it: weeks reach main through reviewed PRs.

**Lint and format scope.** Not linted or formatted: `evidence/*-raw-draft.ts` (archived
drafts, also excluded from TypeScript), `jira-seed/**` and `scripts/jira-seed.mjs`
(the supplied Jira pack). Prettier also leaves Markdown, `vault/`, `evidence/` and
`.claude/` unchanged. The lists live in scripts/lint-scope.mjs and .prettierignore.
The secret scan has no exclusions.

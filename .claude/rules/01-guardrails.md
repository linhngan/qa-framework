# Guardrails

Applies to the whole project, always. ⚠️ marks a mistake that our current checks would not catch.

## G1. Prod is read-only
- Do: on prod, only open pages and read. Never create, edit or delete anything.
- When: any command or test with APP_ENV=prod (`npm run test:prod`).
- Check: `npm run test:safety` proves `envGuard` throws on prod before its action runs. A reviewer confirms every write is wrapped (G3).
- ⚠️ `envGuard` only blocks what is wrapped in it. A direct click on a "Post comment" or "Delete" button is not blocked on prod, and no check looks for unwrapped writes.

## G2. Tests that change data run on dev only
- Do: start the `test.describe` with `runIfEnv(test, ['dev'])` (env/runIfEnv.ts). It skips the group unless the selected env is listed, and throws on an empty list or a name other than dev/prod.
- When: every spec that creates, edits or deletes data.
- Check: `npm run test:safety` proves `runIfEnv` skips correctly, including inside Playwright. A reviewer confirms the call is present.
- ⚠️ A spec without the call runs on prod. Nothing detects a missing `runIfEnv`.

## G3. Wrap each write in envGuard and say what it does
- Do: call the write through `envGuard(() => ...)` (env/envGuard.ts), inside a `test.step` whose title names the actual action:
  `await test.step('Create comment "qa-auto-…" on the first article', () => envGuard(() => article.postComment(text)));`
  `envGuard` takes only the action. Don't add parameters to it, and don't add a dry-run mode.
- The spec owns both wrappers: Page Objects expose the write as a method (`postComment`), and the spec puts `test.step` and `envGuard` around the call. Page Objects don't import `test` or call `envGuard`.
- When: every data-changing call, including cleanup.
- Check: `npm run typecheck` (safety/types.check.ts confirms `envGuard` keeps the action's return type). A reviewer reads the step titles in the test report.

## G4. Human approval before changing an outside system
- Do: before a run or action that changes something outside this folder, describe exactly what will change and wait for approval. This includes:
  - dev data, through a data-changing test run;
  - Jira, through `node scripts/jira-seed.mjs` without `--dry-run`;
  - GitHub, through push, PR or review changes.
- Approval covers only the described activity, not related or follow-up changes.
- When: always.
- Check: .claude/settings.json asks before `git push` and `npm run test:prod`. Otherwise, review of the transcript or PR.
- ⚠️ .claude/settings.json allows `npm test` without a prompt. Once a data-changing test exists, `npm test` writes to dev without asking. `scripts/jira-seed.mjs` is not in the ask list either.

## G5. No secrets in tracked files or output
- Do: never read, print or commit .env files, login state (`.auth/`, `*storageState*.json`), tokens or keys. The course demo account in tests/support/users.ts is the only login kept in the repo.
- When: always, including chat output, logs and evidence notes.
- Check: .gitignore ignores `.env` and `.env.*` (it un-ignores `.env.example`, which does not exist yet), `.auth/`, `*storageState*.json` and key files. .claude/settings.json denies Claude's Read tool access to `.env`, `.env.*` and login state, and denies Claude's file-editing tools (Edit, Write) on any `.env*` file (`Edit(.env*)`, Task 10). The pre-commit secret scan (G7) refuses staged secret files and four token patterns.
- ⚠️ The deny rules cover only Claude's built-in file tools, not shell commands such as `cat .env`, so don't rely on them. The commit scan knows four token patterns only; a secret in another format pasted into a `.ts` or `.md` file still passes.

## G6. Keep isolated safety checks separate
- Do: keep isolated checks in `safety/` (target and helpers, `*.test.ts`) or `safety-tests/` (hooks, Git hooks, settings, spec notes, `*.test.mjs`), run by `npm run test:safety` (`node --test "safety/**/*.test.ts" "safety-tests/**/*.test.mjs"`). They use no browser, no app URL and no network. Never put them under `tests/`.
- When: adding or changing safety checks.
- Check: `npm run test:list` shows only specs from `tests/`. `npm run test:safety` reports its own count, separate from browser tests.

## G7. Never bypass a failing Git hook
- Do: when the pre-commit or pre-push hook fails, read its message and fix the cause. Never skip it with `--no-verify` (or `-n` on `git commit`) or `HUSKY=0`, and never ask someone else to. `ALLOW_MAIN_PUSH=1` is only for an exceptional, approved push to main (G4), never for course work: weeks reach main by reviewed PRs.
- When: every `git commit` and `git push`, including fixups and amends.
- Check: .husky/pre-commit scans staged content for secret files and tokens (G5), then runs lint-staged. .husky/pre-push refuses refs/heads/main, then runs `npm run typecheck` and `npm run test:list`. `npm run test:safety` covers both scripts.
- ⚠️ Git hooks are local: they run only after `npm install` activates them (`prepare`), and `--no-verify` or `HUSKY=0` skips them silently. Nothing on GitHub repeats these checks yet (no CI).

## G8. Change tiers and cross-impact
- Do: before proposing a change, find the file's tier below and follow that tier's steps. A file not listed is SHARED until classified.
- When: every Edit or Write of a project file, by Claude or a person.

| Tier | Meaning | Before approving a change |
|---|---|---|
| CRITICAL | A safety control, its wiring or its proof | Human approval with the exact change; say what could break (table below); `npm run test:safety` with new or updated checks, never weakened; a live re-check of the affected control; its own commit |
| SHARED | Imported or read by more than one file | A CROSS-IMPACT record for every use site, then `npm run typecheck`, `npm run lint` and the affected specs |
| FULL CONTROL | Nothing depends on it | Edit freely. G1–G7 and the guard's seven refusal checks still apply |
| GENERATED | Written by a tool | Never edit by hand. Change the source or the generator and regenerate |

CRITICAL, and what could break:

| Path | What could break |
|---|---|
| `env/target.ts` | Wrong target or prod by accident; the pinned target changes mid-run |
| `env/runIfEnv.ts` | Data-changing specs run on prod, or every test silently skips |
| `env/envGuard.ts` | A write runs on prod |
| `tests/support/env.ts` | Imported by nothing today; if reused or edited, it could resolve the target differently from `getTarget()` |
| `playwright.config.ts` | Retries hide failures, `testDir` drops tests, `baseURL` stops coming from `getTarget()` |
| `package.json` | `npm test` loses `APP_ENV=dev`, `prepare` stops activating Husky, `test:safety` misses checks |
| `.gitignore` | `.env`, `.auth/` or key files become committable |
| `.claude/settings.json` | Claude hooks unwired, deny/ask lists changed, with no error |
| `.husky/pre-commit`, `.husky/pre-push` | Secret scan, lint-staged or the main-push refusal stops running |
| `scripts/hooks/guard.mjs` | Claude edits stop being refused or warned, silently (it fails open) |
| `scripts/hooks/session-preflight.mjs` | Wrong session-start facts |
| `scripts/hooks/stop-worklog.mjs` | Every turn held open (it exits 2), or the journal reminder disappears |
| `scripts/vault-sync.mjs` | The changelog stops recording, or records wrong lines |
| `scripts/git-hooks/scan-staged.mjs` | Secret files or tokens get committed |
| `scripts/git-hooks/pre-push-check.mjs` | A push to main, or with broken types, stale spec notes or broken vault links, goes through |
| `scripts/git-hooks/spec-notes.mjs` | A commit stages the wrong notes, overwrites unstaged work, or skips the staging-safety checks |
| `scripts/jira-seed.mjs` | Unintended writes to Jira (G4) |
| `CLAUDE.md`, `.claude/rules/01-guardrails.md` | A guardrail is weakened or lost |
| `safety/target.test.ts`, `safety/helpers.test.ts`, `safety/types.check.ts`, `safety/support/child.ts`, `safety/fixtures/helpers-child.ts`, `safety/fixtures/playwright/playwright.config.ts`, `safety/fixtures/playwright/run-if-env.fixture.ts` | Proof of G1 and G2 disappears while the remaining checks still pass |
| `safety-tests/guard.test.mjs`, `safety-tests/vault-log.test.mjs`, `safety-tests/worklog.test.mjs`, `safety-tests/git-hooks.test.mjs`, `safety-tests/vault-sync.test.mjs`, `safety-tests/settings.test.mjs` | Proof of the hooks disappears while the remaining checks still pass |

- SHARED: `pages/BasePage.ts` (parent of every Page Object), `pages/BlogListPage.ts`, `pages/LoginPage.ts`, `pages/CategoriesPage.ts`, `pages/ArticleDetailPage.ts`, `tests/support/users.ts` (D2), `tsconfig.json`, `eslint.config.mjs`, `lint-staged.config.mjs`, `scripts/lint-scope.mjs`, `.prettierrc.json`, `.prettierignore`, `.mcp.json`, `.github/CODEOWNERS`, `.claude/rules/10-playwright-pom.md`, `.claude/rules/20-data-management.md`, `.claude/rules/30-test-names.md`, `.claude/commands/worklog.md`, `README.md`, `jira-seed/README.md`, `jira-seed/jira-seed.json`, `jira-seed/jira-seed.schema.json`, `jira-seed/fixtures/*.json`, `evidence/task02-note.md` and `evidence/task04-note.md` (P9 names them as the verified test-ID record).
- FULL CONTROL: `tests/blog/*.smoke.spec.ts` (nothing imports a spec), the other `evidence/task*-note.md`, `evidence/week2-baseline.md`, `vault/_map.md`, `vault/_raw/.gitkeep`, `vault/03-framework/hook-lifecycle-map.md`, `vault/12-progress-report/**`.
- Spec notes `vault/tests/**/*.md` are split: the block between `<!-- generated:start -->` and `<!-- generated:end -->` is GENERATED (`npm run vault:sync`), and the text outside it is FULL CONTROL. `vault/_context.md` is FULL CONTROL.
- GENERATED: `vault/_changelog/*.md` (scripts/vault-sync.mjs), `package-lock.json` (npm), `jira-seed/jira-seed.md` (`node scripts/jira-seed.mjs --emit-md`), `.husky/_/` (husky), `playwright-report/`, `test-results/`, `.playwright-mcp/`. `evidence/*-raw-draft.ts` are archived and frozen: never edited, never regenerated.
- Generated notes are regenerated: a hand edit is overwritten on the next run, or leaves the output disagreeing with its source. Fix the source (the JSON, the script, `package.json`) and regenerate.
- Files under `tests/` or `pages/` are not FULL CONTROL just because they sit next to specs: `tests/support/users.ts` is SHARED, `tests/support/env.ts` is CRITICAL, and every Page Object is SHARED.

CROSS-IMPACT format, one line per use site:
```
changed symbol -> used-by file:line -> breaking / behavioral / safe -> action
```
breaking: does not compile or run unless the caller changes. behavioral: still runs but does something different. safe: no effect.

- Check: for every CRITICAL path, the PreToolUse guard prints `guard: WARN — shared file; review the affected callers before approving` (stdout JSON, exit 0) after its seven refusal checks pass. `npm run test:safety` covers the list, path normalization, quiet ordinary edits and refusal priority.
- ⚠️ The guard reads its own coded list (`CRITICAL_PATHS` in scripts/hooks/guard.mjs). Editing this table does not update that list, and editing the list does not update this table: change both together. The warning covers only Claude's Edit and Write tools, not shell commands. It never warns for SHARED files, and it fails open, so an error silently drops it. The warning does not enforce approval: it exits 0, never asks for or records a decision, and the edit goes ahead under whatever permission mode is active. Human approval for a CRITICAL change is a process step that only review of the transcript or PR can confirm.

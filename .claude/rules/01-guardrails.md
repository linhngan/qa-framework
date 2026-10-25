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
- Check: .gitignore ignores `.env` and `.env.*` (it un-ignores `.env.example`, which does not exist yet), `.auth/`, `*storageState*.json` and key files. .claude/settings.json denies Claude's Read tool access to `.env`, `.env.*` and login state.
- ⚠️ Neither stops a secret pasted into a `.ts` or `.md` file, and nothing scans commits for secrets. The deny list is not verified to block shell commands such as `cat .env`, so don't rely on it.

## G6. Keep isolated safety checks separate
- Do: keep isolated checks in `safety/`, run by `npm run test:safety` (`node --test "safety/**/*.test.ts"`). They use no browser, no app URL and no network. Never put them under `tests/`.
- When: adding or changing safety checks.
- Check: `npm run test:list` shows only specs from `tests/`. `npm run test:safety` reports its own count, separate from browser tests.

## G7. Never bypass a failing Git hook
- Do: when the pre-commit or pre-push hook fails, read its message and fix the cause. Never skip it with `--no-verify` (or `-n` on `git commit`) or `HUSKY=0`, and never ask someone else to. `ALLOW_MAIN_PUSH=1` is only for an exceptional, approved push to main (G4), never for course work: weeks reach main by reviewed PRs.
- When: every `git commit` and `git push`, including fixups and amends.
- Check: .husky/pre-commit scans staged content for secret files and tokens (G5), then runs lint-staged. .husky/pre-push refuses refs/heads/main, then runs `npm run typecheck` and `npm run test:list`. `npm run test:safety` covers both scripts.
- ⚠️ Git hooks are local: they run only after `npm install` activates them (`prepare`), and `--no-verify` or `HUSKY=0` skips them silently. Nothing on GitHub repeats these checks yet (no CI).

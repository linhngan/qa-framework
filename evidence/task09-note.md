# Task 09: change tiers, cross-impact and the critical-path warning

Date: 2026-10-25 · Branch: `week-2` (from `2643735`) · Not committed yet.

## Additional file class
**Class:** hook and automation scripts:
- `scripts/hooks/guard.mjs`, `scripts/hooks/session-preflight.mjs`, `scripts/hooks/stop-worklog.mjs`
- `scripts/vault-sync.mjs`
- `scripts/git-hooks/scan-staged.mjs`, `scripts/git-hooks/pre-push-check.mjs`

**Tier chosen by the user:** CRITICAL. The evidence supports it. All six are in the coded list, and each is tested.

**Corrections to the stated reasons, from the inspection:**
- "A break is silent": precisely, `guard.mjs` fails open on any error, while `scan-staged.mjs` fails closed on Git errors. A logic bug in either still passes silently.
- "Only proof is simulated": overstated. Live checks exist (hook-lifecycle-map.md; Task 08 disposable repos), but they cover only part. For the guard, only check 3 has been seen refusing live.
- "They protect G2/G3/G5/G7": true for `guard.mjs`, `scan-staged.mjs` and `pre-push-check.mjs`. `vault-sync.mjs`, `session-preflight.mjs` and `stop-worklog.mjs` protect records and workflow instead. They are still CRITICAL because they run on every event, and `stop-worklog.mjs` exits 2, which holds a turn open.
- Added to the tier for the same reason as the scripts: their wiring, `.claude/settings.json`, `.husky/pre-commit`, `.husky/pre-push` and `package.json` (`prepare`). A changed command string disables a hook as surely as a broken script. `1175701` fixed exactly that kind of break, which came after `c2ca38c`.

## Tiers (G8, .claude/rules/01-guardrails.md)
- **CRITICAL (30 paths):**
  - env: `env/target.ts`, `env/runIfEnv.ts`, `env/envGuard.ts`, `tests/support/env.ts`;
  - config: `playwright.config.ts`, `package.json`, `.gitignore`;
  - hook wiring: `.claude/settings.json`, `.husky/pre-commit`, `.husky/pre-push`;
  - the six hook scripts above, plus `scripts/jira-seed.mjs`;
  - rules: `CLAUDE.md`, `.claude/rules/01-guardrails.md`;
  - proof: 7 files under `safety/`, 4 under `safety-tests/`.

  G8 lists what could break for each.
- **SHARED:** the 5 Page Objects, `tests/support/users.ts`, lint/format/TypeScript configs, `.mcp.json`, `.github/CODEOWNERS`, rules 10–30, `.claude/commands/worklog.md`, `README.md`, `jira-seed/README.md`, the Jira source JSON, `evidence/task02-note.md`, `evidence/task04-note.md`.
- **FULL CONTROL:** specs, the other task notes, `evidence/week2-baseline.md`, `vault/_map.md`, `vault/_raw/.gitkeep`, `vault/03-framework/hook-lifecycle-map.md`, journals.
- **GENERATED:** `vault/_changelog/*.md`, `package-lock.json`, `jira-seed/jira-seed.md`, `.husky/_/`, reports, `.playwright-mcp/`. Raw drafts are frozen. Generated notes are regenerated, so fix their source instead.
- **Shared files that looked like FULL CONTROL, corrected:**
  - `tests/support/users.ts` is SHARED;
  - `tests/support/env.ts` is CRITICAL;
  - all Page Objects are SHARED;
  - rules 10–30 and `README.md` are SHARED;
  - `safety/**` and `safety-tests/**` are CRITICAL;
  - `evidence/task02-note.md` and `evidence/task04-note.md` are SHARED, not FULL CONTROL like the other notes: rule P9 (`.claude/rules/10-playwright-pom.md:48`) names them as the verified test-ID record, so a change there changes what the rule allows. Found in the review after implementation.
- **Previously unclassified, now listed:** `jira-seed/README.md` (SHARED: supplied documentation for the Jira pack) and `vault/_raw/.gitkeep` (FULL CONTROL: keeps an empty folder, read by nothing). Every tracked file is now covered by G8, by name or glob.

## Dependency evidence
How each assignment follows from real use sites (`git grep`, 2026-10-25).

| File | Used by (file:line) | Tier |
|---|---|---|
| `pages/BasePage.ts` | imported and extended by `pages/ArticleDetailPage.ts:2,4`, `pages/BlogListPage.ts:2,4`, `pages/CategoriesPage.ts:2,4`, `pages/LoginPage.ts:2,4`; `banner` asserted at `tests/blog/home.smoke.spec.ts:16–17` | SHARED |
| `pages/BlogListPage.ts` | `tests/blog/home.smoke.spec.ts:3,8,11–12,16–17,21`; `tests/blog/article-detail.smoke.spec.ts:4,11–13`; `tests/blog/category-filter.smoke.spec.ts:3,10–15` | SHARED (3 specs) |
| `pages/LoginPage.ts` | `tests/blog/categories.smoke.spec.ts:4,11–13` | SHARED |
| `pages/CategoriesPage.ts` | `tests/blog/categories.smoke.spec.ts:3,15–19` | SHARED |
| `pages/ArticleDetailPage.ts` | `tests/blog/article-detail.smoke.spec.ts:3,15–18` | SHARED |
| `tests/support/users.ts` | `tests/blog/categories.smoke.spec.ts:5,13`; rule D2 | SHARED |
| `scripts/lint-scope.mjs` | `eslint.config.mjs:8`, `lint-staged.config.mjs:5` | SHARED |
| `tsconfig.json` | `npm run typecheck`; ESLint `projectService` at `eslint.config.mjs:45` | SHARED |
| `evidence/task02-note.md`, `evidence/task04-note.md` | rule P9, `.claude/rules/10-playwright-pom.md:48` | SHARED |
| `env/target.ts` | `playwright.config.ts:2,4`, `env/runIfEnv.ts:1`, `env/envGuard.ts:1`, `tests/support/env.ts:3`, `safety/target.test.ts:4`, `safety/fixtures/helpers-child.ts:3` | CRITICAL |
| `env/runIfEnv.ts` | every spec: `home.smoke.spec.ts:6`, `article-detail.smoke.spec.ts:7`, `category-filter.smoke.spec.ts:6`, `categories.smoke.spec.ts:8`; `safety/types.check.ts:8,11`; `safety/fixtures/helpers-child.ts:69`; `safety/fixtures/playwright/run-if-env.fixture.ts:5,12,19` | CRITICAL |
| `env/envGuard.ts` | `safety/types.check.ts:13,15`, `safety/fixtures/helpers-child.ts:37,50`; no spec yet (G3 for future writes) | CRITICAL |
| `tests/support/env.ts` | no importers | CRITICAL (an env resolver; see G8) |
| Hook scripts | `.claude/settings.json:25,33,40,41,48,55`; `.husky/pre-commit:3`, `.husky/pre-push:3`; `safety-tests/guard.test.mjs:13`, `vault-log.test.mjs:13`, `worklog.test.mjs:14–15`, `git-hooks.test.mjs:16–18` | CRITICAL |
| `tests/blog/*.smoke.spec.ts` | no imports. `safety-tests/guard.test.mjs:15` and `safety-tests/git-hooks.test.mjs:302` use `tests/blog/home.smoke.spec.ts` only as a path string and never read the file | FULL CONTROL |
| Other task notes, `week2-baseline.md`, `vault/_map.md`, `vault/_raw/.gitkeep`, hook map, journals | read by no code or rule; earlier notes only mention them as history | FULL CONTROL |

## The three changes, classified
| Change | Tier | Impact | Action |
|---|---|---|---|
| Rename `LoginPage.submitButton` | SHARED | breaking inside `LoginPage.ts` only; safe for callers | rename all three in one edit; typecheck; run the categories spec |
| Add a method to `BlogListPage` (precedent: `filterByCategory`, `869ed8d`) | SHARED | safe (additive) | typecheck, lint, and the new caller's spec |
| Widen `AppEnv` (`env/target.ts:1`) | CRITICAL | breaking (`CANONICAL_BASE_URLS` :14; `safety/types.check.ts:11`) and behavioral (`envGuard.ts:12` blocks only `'prod'`, so a new env allows writes) | stop: conflicts with CLAUDE.md "never … add … other targets"; needs explicit approval and an `envGuard` redesign |

## Completed impact record: `submitButton` → `signInButton` (not performed)
```
LoginPage.submitButton (pages/LoginPage.ts:7, declaration)
  -> pages/LoginPage.ts:13 (assignment, getByTestId('login-submit'))      -> breaking -> rename in the same edit; test ID unchanged
  -> pages/LoginPage.ts:23 (login(): this.submitButton.click())           -> breaking -> rename in the same edit
  -> tests/blog/categories.smoke.spec.ts:13 (calls login(), not the field) -> safe     -> no change; run this spec on dev
  -> evidence/task02-note.md:28 (records the Task 02 field name)          -> safe     -> leave it: a record of Task 02
  -> data-testid 'login-submit' (app side)                                -> safe     -> unchanged, so behaviour is the same
Checks: npm run typecheck, npm run lint, npm test (categories spec passes)
```
Source: `git grep -n "submitButton\|login-submit"` (2026-10-25) matched exactly these lines. The rename was not performed.

## Guard change (scripts/hooks/guard.mjs)
- **Order unchanged.** The seven refusal checks run first, with the same messages. A refusal still exits 2 with one stderr line and nothing on stdout.
- **Input validation split out.** It moved into `proposal()`, so the refusal checks and the warning read the same parsed Edit or Write.
- **New warning.** If nothing refuses and the target is on `CRITICAL_PATHS`, the guard exits 0 and prints one line to stdout:
  `{"systemMessage":"guard: WARN — shared file; review the affected callers before approving","hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":"guard: WARN — shared file; review the affected callers before approving"}}`.
  There is no `permissionDecision`. Ordinary edits stay silent.
- **The warning does not enforce approval.** It is advisory only: it exits 0, never asks for or records a decision, and the edit goes ahead under whatever permission mode is active. In this session (auto mode), all 6 warned edits were applied immediately after the reminder (see Live observations). Human approval for a CRITICAL change (G8) is a process step that only review of the transcript or PR can confirm.
- **Path normalization (`projectKey`):**
  1. `\` → `/` in both the path and the root;
  2. made relative to `CLAUDE_PROJECT_DIR` (or cwd); a relative input is taken as relative to the root;
  3. `path.posix.normalize` (`.`, `..`);
  4. anything outside the root is not listed;
  5. compared case-insensitively.

## Coded-list boundary
`CRITICAL_PATHS` is an explicit list of 30 existing files, with no folders or globs. It is maintained by hand: **editing the G8 Markdown table does not update this list, and editing the list does not update the table.** The guard file, G8 and this note all say so. `safety-tests/guard.test.mjs` keeps its own copy of the 30 paths and checks that each exists and is warned for. So if one of the three copies changes and the others don't, they are out of step until updated by hand. The plan said 31 paths; the actual count is 30, a miscount in the plan.

What the list does not cover:
- SHARED files (no warning by design);
- shell commands such as `sed` or `prettier --write`;
- symlinks, which are not resolved;
- a guard error, which fails open and drops the warning.

## Tests (isolated, simulated payloads)
`safety-tests/guard.test.mjs`: 34 → 72 tests (38 new). Each pipes made-up JSON to the guard. No critical file is edited by the tests.
- **Coded list:** 30 paths, each exists. The reviewed hook class (6 scripts) is listed and warned for.
- **Warning JSON:** each of the 30 paths with both an Edit and a Write gives exit 0, empty stderr, one stdout line that is exactly `{systemMessage, hookSpecificOutput: {hookEventName: "PreToolUse", additionalContext}}`, and no `permissionDecision`.
- **Normalization warns** for: a relative path, `./`, `..`, `\` separators, mixed case, and a Windows-style root.
- **Quiet:**
  - a spec, `pages/BlogListPage.ts`, `pages/LoginPage.ts`, `tests/support/users.ts`, an evidence note;
  - look-alikes (`.bak`, `.tsx`, `tests/env/target.ts`, `.orig`, `.husky/_/pre-commit`);
  - paths outside the project (`../`, a sibling folder, the temp directory);
  - Read, Bash and MultiEdit events, an Edit with missing fields, malformed JSON.
- **Refusals come first:** a secret marker in Write or Edit to `scripts/hooks/guard.mjs`, `env/target.ts` or `.claude/settings.json` exits 2 with the secret reason and empty stdout.
- **Known limit, tested:** checks 3–7 cover only `*.spec.ts`, and no spec is critical. A `test.skip` change in `env/runIfEnv.ts` therefore gets the warning, not a refusal.

## Live observations
- The WARN appeared as `PreToolUse:Edit hook additional context: guard: WARN — shared file; review the affected callers before approving` for 6 real Claude Edits: `safety-tests/guard.test.mjs` (the `existsSync` import and 2 Prettier layout edits) and `.claude/rules/01-guardrails.md` (G8, then the 2 review fixes). Every one was applied straight away: the reminder did not pause or block any of them.
- Edits of `vault/03-framework/hook-lifecycle-map.md` and `README.md` (not critical) stayed silent.
- **A real silent break, seen while building this.** The guard change went in as 3 consecutive Edits. Between the second (`decide()` now takes the parsed edit) and the third (the main block updated to match), the guard on disk was inconsistent. It would have thrown on the third Edit's own check and failed open without a warning. The final file is consistent and fully tested. This is the risk the CRITICAL tier describes; future guard changes should go in one Edit or Write.
- **Process deviation:** the 38-test block was first appended to `safety-tests/guard.test.mjs` with a shell heredoc, so the Claude guard did not see that change. Its content has nothing the guard refuses (verified by running the suite). Every later change to a critical file went through Edit, including the 2 Prettier fixes, which were applied by hand rather than with `prettier --write`.

## Commands and results
| Command | Result |
|---|---|
| `npm run format:check` | exit 0. The first run flagged `safety-tests/guard.test.mjs`; fixed with 2 Edits |
| `npm run lint` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm run test:safety` | tests 196, pass 196, fail 0 (158 earlier + 38 new) |
| `npm test -- --reporter=list` | 5 passed (3.7s), [chromium], retries 0 |

## Unchanged
- `.claude/settings.json`, `.husky/*` and `package.json` (permissions and hook wiring);
- the seven refusal checks and their messages;
- every spec and Page Object.

The example rename was not performed.

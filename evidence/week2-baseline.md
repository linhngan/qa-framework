# Week 2 baseline

## 2026-10-15: starting baseline on week-2

**Branch:** `week-2`, created from `week-1` (stacked; PR #1 week-1 → main is still open and awaiting review).
**Commit:** `9ec79e8` "Week 1: first useful test project" (0 commits ahead of `week-1`).
**Remote:** `origin` = `git@github.com:linhngan/qa-framework.git`; `week-2` published with upstream `origin/week-2`.

### Environment
- Node v24.21.0, Playwright 1.61.1, Chromium build 1228
- Target: dev (`APP_ENV`, `BASE_URL` and `LOCAL_SANDBOX_DIR` all unset in the shell; `npm test` sets `APP_ENV=dev`)
- Config: one project `chromium`, `retries: 0`, `testDir: 'tests'`
- `.env`: not present, ignored by `.gitignore`, not tracked

### Commands and results
| Command | Result |
|---|---|
| `npm run typecheck` | exit 0, no errors |
| `npm run test:safety` | tests 43, pass 43, fail 0 (exit 0) |
| `npx playwright test --list` | Total: 3 tests in 2 files, all `[chromium]` (exit 0) |
| `npm test -- --reporter=list` | 3 passed (8.6s), exit 0 |

### Tests discovered and passed
1. `blog/home.smoke.spec.ts:11` Blog home (dev smoke) › banner is visible and identifies DEVELOPMENT
2. `blog/home.smoke.spec.ts:17` Blog home (dev smoke) › first article card is visible and at least one card exists
3. `blog/categories.smoke.spec.ts:9` Categories (dev smoke) › signed-in author sees the category list with at least one item

### Notes
- `env/target.ts`, `env/runIfEnv.ts` and `env/envGuard.ts` are unchanged from Week 1.
- Week 1 is not reviewed or merged yet; this baseline is the unreviewed `week-1` state.

## 2026-10-19: Jira seed import (reported by me; not observed by Claude)

### Seed package
- Package version: `2026-09-16` (`version` in `jira-seed/jira-seed.json`)
- Files: `jira-seed/` (seed JSON, Markdown view, schema, README, 4 fixtures) and `scripts/jira-seed.mjs`
- Checked by Claude before the import: the extracted copy matches `jira-seed.zip` (same 9 files, sizes and checksum); the ZIP stays outside the repo
- Checked by Claude before the import: Node v24.21.0; intended run folder `/Users/ngannguyen/Documents/testing/codemify/qa-framework`

### Real-import result (as I reported it)
```
created 158, reused 0, placeholders 4 (deleted), API calls 169
   ok: all 158 keys match the course (SCRUM-5..SCRUM-162)
```
- Key map: none generated. The script writes `vault/sources/jira/key-map.md` only when keys drift; all keys matched.

### Item I opened
- [SCRUM-108](https://linhngan.atlassian.net/browse/SCRUM-108): TC-UI-001, "Environment banner shows DEVELOPMENT on the dev target" (subtask of SCRUM-9; labels in the seed: automated, blog, env-dev-prod, ui)
- What the selected test should prove: env-banner is visible and article cards render on the homepage; runs on dev and prod (the banner text differs by APP_ENV); tag `@smoke`.

### Private Week 3 database request
- Status: REPLY RECEIVED

### Since the starting baseline
- PR #1 (week-1 → main) was approved and merged on 2026-10-19 (`main` = `ab1fa85`, tag `week1-end`); the note above about Week 1 being unreviewed describes the state on 2026-10-15.
- `week-2` gained `c3d38c8` (Task 04 README note) and `34ec23c` (removed the redundant count check). Browser tests have not been re-run since `34ec23c`.

### Credentials
- `.env` exists, is ignored (`git check-ignore .env` → `.env`) and is not tracked (`git ls-files .env` → no output). Its contents were not read.

---
paths:
  - "tests/**/*.ts"
  - "pages/**/*.ts"
  - "scripts/**"
  - "jira-seed/**"
---

# Test data

Applies when working on browser tests, Page Objects, shared test data (tests/support/users.ts) and setup files (`scripts/`, `jira-seed/`). ⚠️ marks a mistake that our current checks would not catch. Data-changing actions also follow .claude/rules/01-guardrails.md (dev only, `envGuard`, approval).

## D1. Known seed data first
- Do: read existing dev records (for example the seeded articles and categories) before creating new ones. Create records only when the scenario needs them.
- Check: review.

## D2. Import shared test data
- Do: import shared data, such as `AUTHOR` from tests/support/users.ts. Never copy its email or password into a spec or Page Object.
- Check: `grep -rn "@codemify.test" tests pages` should match only tests/support/users.ts.

Rules D3–D5 apply once a test creates or changes data. No current test does.

## D3. Recognizable, unique names for created records
- Do: name every created record with the prefix `qa-auto-` plus a value unique to the run or test, for example `` `qa-auto-${test.info().testId}-${Date.now()}` ``.
- Check: review.
- ⚠️ Fixed names collide when tests run in parallel (the suite already uses 2 workers), and the failure looks random.

## D4. Clean up the test's own records, even on failure
- Do: record the IDs the test creates and delete them in `test.afterEach` or a fixture, inside `test.step` and `envGuard` (G3), so cleanup runs even when an assertion fails.
- Check: review.
- ⚠️ Cleanup placed after the assertions is skipped when the test fails, and nothing reports leftover records.

## D5. Never delete other records
- Do: delete only by the IDs this test created. Never delete by search or prefix alone, never "delete all", and never touch another test's or another person's records.
- Check: review.
- ⚠️ Deleting everything with the prefix can remove another run's records in the middle of its test.

## D6. Approved setup scripts and APIs only
- Do: use only setup scripts and APIs that a later lesson approves. None is approved for app data yet.
- `scripts/jira-seed.mjs` is for Jira only: run `node scripts/jira-seed.mjs --dry-run` first (offline, no .env), and get approval before a real run (G4).
- Check: review of the transcript.

## D7. Database checks are read-only
- Do: once database work is in scope, use read-only queries (SELECT) for verification only. The project has no database access yet.
- Check: review every query added for database work; until then there is no database code to check.

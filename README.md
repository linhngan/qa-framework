# qa-framework
A framework that tests the supplied course applications.

## Setup
Node 24. From this folder: `npm ci`, then `npx playwright install chromium`
(run here so the browser matches the project's Playwright 1.61.1).

## Commands
- `npm test`: browser tests on dev (always dev, even if your shell sets APP_ENV)
- `npm run test:prod`: browser tests on prod, selected on purpose
- `npm run test:list`: list tests on dev
- `npm run typecheck`: TypeScript check
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
`npx playwright test --list` should show 3 tests in one project, [chromium]:
2 in tests/blog/home.smoke.spec.ts and 1 in tests/blog/categories.smoke.spec.ts.
Listing doesn't run tests, so on prod it still shows all 3; they are only skipped when run.

## Why "at least one" category (Task 04)
- Why at least one: dev data is shared and changes, and the requirement is only a non-empty list.
- When an exact count is right: when the test seeds its own data, or the number itself is the requirement.

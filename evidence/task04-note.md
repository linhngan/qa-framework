# Task 04: review drafts and add them to the active suite

Branch `week-2`, starting from `f21bbd0`. Target dev (`{"env":"dev","baseURL":"https://dev.ai-orchestration-courses.com"}` from `getTarget()`, with `APP_ENV=dev` and with it unset).

Starting baseline (2026-10-24): `npm test -- --project=chromium --retries=0` → 3 passed.

## Test 4: article detail (TC-UI-030, SCRUM-121)

- Raw draft: `evidence/task01-raw-draft.ts`, unchanged (`dcfe8831fb82ab581a4e1f0e36429f89e7e9e985a6009eb2261da46df572da42`, identical to `73328a4`).
- Active test: `tests/blog/article-detail.smoke.spec.ts`. A visitor opens the first article from the blog list and sees the same title on its `/articles/<slug>` page.

Review findings applied:

| Finding | Draft line | Rule | Change |
|---|---|---|---|
| V1 raw locators in the test | 10–12, 15, 16 | P3 (`.claude/rules/10-playwright-pom.md:21`) | `BlogListPage.openFirstArticle()`, `ArticleDetailPage.detail`, `ArticleDetailPage.title` |
| V2 name did not say who acts | 7 | N1 (`.claude/rules/30-test-names.md:9`) | `visitor who opens the first article sees the same title on its article page` |
| Option A (approved) | 8 | — | `blog.open()` instead of `page.goto('/')` |
| Option C (approved) | — | — | comment linking TC-UI-030 / SCRUM-121 |

Option B (exact URL check) was not applied. Kept: the three assertions, `runIfEnv(test, ['dev'])` (TC-UI-030 is labelled `env-dev-prod`; widening to prod is a separate decision). `.first()` was judged not to be a P2 positional selector.

## Test 5: category filter (TC-UI-024, SCRUM-120)

- Active test: `tests/blog/category-filter.smoke.spec.ts`. A visitor filters the blog list by "Playwright" and sees at least one article, all labelled "Playwright". No exact count (P8).
- Page Object: `pages/BlogListPage.ts` gained `articleCategories`, `categorySelect`, `filterButton` and `filterByCategory(name)` (select by label, click Filter, wait for `category=` in the URL).
- Raw draft: `evidence/task04-raw-draft.ts`, copied with `cp -n` after the draft passed alone: `0f91a94db654c0ca56289a2a2c791374e4f5a9c7eb80ae9c2632856b4e43689b` for both files, `cmp` identical.

Review: one confirmed finding, V1 (P9, `.claude/rules/10-playwright-pom.md:48`): the three new test IDs were seen on dev but not recorded in evidence. Fixed by the table below; no test code changed, so the active test still matches the raw draft. Optional O1 (dropdown value check) and O2 (retrying per-card check) were not applied.

## Test ID evidence added in Task 04

| Class | Field | data-testid | Evidence |
|---|---|---|---|
| `BlogListPage` | `firstArticleLink` | `article-link` (inside first `article-item`) | Browser (Playwright MCP) on `/`, 2026-10-20 and 2026-10-24; used by the passing article-detail test |
| `ArticleDetailPage` | `detail` | `article-detail` | Browser on `/articles/seeding-test-data-without-tears`, 2026-10-24 (one `article`); passing article-detail test |
| `ArticleDetailPage` | `title` | `article-title` | Browser, same page, 2026-10-24 (one `h1`); passing article-detail test |
| `BlogListPage` | `categorySelect` | `category-select` | Browser on `/`, 2026-10-24: `<select name="category">`, options All categories, AI-Assisted Testing, Career, Playwright, QA Fundamentals; passing category-filter test |
| `BlogListPage` | `filterButton` | `filter-submit` | Browser on `/`, 2026-10-24: `<button type="submit">Filter</button>` in a GET form (`action="/"`); passing category-filter test |
| `BlogListPage` | `articleCategories` | `article-category` (inside each `article-item`) | Browser on `/`, 2026-10-24: 6 labels unfiltered; after filtering by Playwright (`/?search=&category=playwright`) 2 cards, both "Playwright"; passing category-filter test |

## Verification (2026-10-24)

| Check | Command | Result |
|---|---|---|
| Test 4 alone | `npx cross-env APP_ENV=dev playwright test tests/blog/article-detail.smoke.spec.ts` | 1 passed |
| Test 5 alone | `npx cross-env APP_ENV=dev playwright test tests/blog/category-filter.smoke.spec.ts` | 1 passed |
| Typecheck | `npm run typecheck` | exit 0; `tsc --listFilesOnly` lists no `evidence/` file |
| Discovery | `npx playwright test --list` | 5 tests in 4 files; no `evidence/` file |
| Full browser suite | `npx playwright test` | 5 passed |
| Safety (local, no browser) | `npm run test:safety` | 43 tests, 43 pass, 0 fail, 0 skipped |
| Rule searches | `grep -rnE 'getBy\|\.locator\(\|\$\$?\(' tests`; `grep -rnE 'waitForTimeout\|https://' tests pages` | none |

Lint and format: no tool is installed, so there is nothing to exclude.

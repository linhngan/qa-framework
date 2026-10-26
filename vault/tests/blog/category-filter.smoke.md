# Blog category filter (dev smoke)

<!-- generated:start -->
<!-- Managed by scripts/vault-sync.mjs --write. Edits between these markers are replaced. -->
- **Source:** [tests/blog/category-filter.smoke.spec.ts](../../../tests/blog/category-filter.smoke.spec.ts)
- **SHA-256:** `0f91a94db654c0ca56289a2a2c791374e4f5a9c7eb80ae9c2632856b4e43689b`
- **Parser:** typescript 6.0.3 · ok
- **Tests (1):**
  - Blog category filter (dev smoke) › visitor who filters by Playwright sees only Playwright articles
- **Page Object imports:**
  - `BlogListPage` from [pages/BlogListPage.ts](../../../pages/BlogListPage.ts)
<!-- generated:end -->

## What this spec checks
- **TC-UI-024 (SCRUM-120), "the category filter narrows the list to that category".** A visitor picks `Playwright` in `category-select` and presses `filter-submit`. `BlogListPage.filterByCategory()` then waits for a URL with a `category` parameter.
- **Assertions:** at least one card is visible, and every `article-category` label is exactly `Playwright`.
- **Scope:** dev only through `runIfEnv(test, ['dev'])`.
- **Evidence:**
  - Test IDs `category-select`, `filter-submit` and `article-category` were seen in the browser on 2026-10-24. Filtering by Playwright gave 2 cards, both "Playwright" (evidence/task04-note.md, Test 5; rule P9).
  - The test does not assert the count of 2, because dev data changes.
  - Latest result: 5 passed on 2026-10-26 (evidence/task10-note.md).

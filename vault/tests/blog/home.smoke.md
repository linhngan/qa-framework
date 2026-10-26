# Blog home (dev smoke)

<!-- generated:start -->
<!-- Managed by scripts/vault-sync.mjs --write. Edits between these markers are replaced. -->
- **Source:** [tests/blog/home.smoke.spec.ts](../../../tests/blog/home.smoke.spec.ts)
- **SHA-256:** `043d4bd2165d49b94de8dfd9a541254bbe05b9584ad83227c16ef4c5fbfb3b19`
- **Parser:** typescript 6.0.3 · ok
- **Tests (2):**
  - Blog home (dev smoke) › banner is visible and identifies DEVELOPMENT
  - Blog home (dev smoke) › first article card is visible and at least one card exists
- **Page Object imports:**
  - `BlogListPage` from [pages/BlogListPage.ts](../../../pages/BlogListPage.ts)
<!-- generated:end -->

## What this spec checks
- **Banner test:** the first guard against testing the wrong site. It opens `/` through `BlogListPage.open()`, then asserts that the `env-banner` element (`BasePage.banner`) is visible and contains `DEVELOPMENT`. The banner check is a test, not a lock (README, "What the safety helpers do not stop").
- **First card test:** the blog list renders at least one `article-item` card. It asserts only that the first card is visible, not a count, because dev data is shared and changes (README, "Why at least one").
- **Shared setup:** `test.beforeEach` creates one `BlogListPage` and opens `/` for both tests. `runIfEnv(test, ['dev'])` keeps the group to dev (G2).
- **Evidence:**
  - Test IDs `env-banner` and `article-item` were seen in the browser on 2026-10-20 (evidence/task02-note.md, Locator ownership; rule P9).
  - Latest result: `npm test`, 5 passed (4.7s) on 2026-10-26 (evidence/task10-note.md).

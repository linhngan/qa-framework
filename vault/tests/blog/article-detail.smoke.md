# Article detail (dev smoke)

<!-- generated:start -->
<!-- Managed by scripts/vault-sync.mjs --write. Edits between these markers are replaced. -->
- **Source:** [tests/blog/article-detail.smoke.spec.ts](../../../tests/blog/article-detail.smoke.spec.ts)
- **SHA-256:** `c29125724bd3dbdda4bee19e215f064f90379fa3f403ef64c4a949003ecae251`
- **Parser:** typescript 6.0.3 · ok
- **Tests (1):**
  - Article detail (dev smoke) › visitor who opens the first article sees the same title on its article page
- **Page Object imports:**
  - `ArticleDetailPage` from [pages/ArticleDetailPage.ts](../../../pages/ArticleDetailPage.ts)
  - `BlogListPage` from [pages/BlogListPage.ts](../../../pages/BlogListPage.ts)
<!-- generated:end -->

## What this spec checks
- **TC-UI-030 (SCRUM-121), "article page renders via slug navigation".** A visitor opens the first article from the list (`BlogListPage.openFirstArticle()` clicks `article-link` and returns the clicked title).
- **Three assertions:** the URL matches `/articles/<slug>`; `article-detail` is visible; `article-title` has exactly the clicked title.
- **Scope:** dev only through `runIfEnv(test, ['dev'])`. TC-UI-030 is labelled `env-dev-prod`, and widening it to prod is a separate decision (evidence/task04-note.md, Test 4). The exact-URL variant (option B) was not applied.
- **Evidence:**
  - Test IDs `article-link`, `article-detail` and `article-title` were seen in the browser on 2026-10-24 (evidence/task04-note.md; rule P9).
  - Latest result: 5 passed on 2026-10-26 (evidence/task10-note.md).

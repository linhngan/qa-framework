# Categories (dev smoke)

<!-- generated:start -->
<!-- Managed by scripts/vault-sync.mjs --write. Edits between these markers are replaced. -->
- **Source:** [tests/blog/categories.smoke.spec.ts](../../../tests/blog/categories.smoke.spec.ts)
- **SHA-256:** `5d58427cea1d49c625b24bee5576739d65dfe2db323b5a9a090bdd6f0af7ec5e`
- **Parser:** typescript 6.0.3 · ok
- **Tests (1):**
  - Categories (dev smoke) › signed-in author sees the category list with at least one item
- **Page Object imports:**
  - `CategoriesPage` from [pages/CategoriesPage.ts](../../../pages/CategoriesPage.ts)
  - `LoginPage` from [pages/LoginPage.ts](../../../pages/LoginPage.ts)
<!-- generated:end -->

## What this spec checks
- **Signed-in path:** the course author signs in through `LoginPage` (`login-email`, `login-password`, `login-submit`, then a wait for a path other than `/login`), opens `/categories`, and sees `category-list` with at least one `category-item`.
- **Login data:** imported as `AUTHOR` from `tests/support/users.ts`, never copied into the spec (D2). That import is not a Page Object, so the generated block does not list it.
- **Why "at least one":** dev data is shared and changes, and the requirement is only a non-empty list (README, "Why at least one").
- **Evidence:**
  - The login test IDs were seen in the browser on 2026-10-24 (evidence/task02-note.md).
  - `category-list` and `category-item` were **not browser-observed**: `/categories` redirects to `/login` when signed out. They were accepted on the evidence of this passing test (same note, rule P9).
  - Latest result: 5 passed on 2026-10-26 (evidence/task10-note.md).

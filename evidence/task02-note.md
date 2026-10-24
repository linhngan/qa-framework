# Task 02: Page Objects for the existing browser cases

Branch `week-2`, starting from `73328a4`. Target dev, selected by the project's resolver:

```
$ npx cross-env APP_ENV=dev node <scratch>/resolve.mjs   # imports env/target.ts → getTarget()
{"env":"dev","baseURL":"https://dev.ai-orchestration-courses.com"}
```

## Baseline before the refactor (2026-10-24)

| Check | Command | Result |
|---|---|---|
| Discovery | `npm run test:list` | 3 tests in 2 files, project `chromium` |
| Browser cases | `npm test -- --project=chromium --retries=0` | 3 passed (5.7s) |
| Typecheck | `npm run typecheck` | exit 0 |
| Safety (local, no browser) | `npm run test:safety` | 43 tests, 6 suites, 43 pass, 0 fail, 0 skipped |
| Task 01 archive | `shasum -a 256 evidence/task01-raw-draft.ts` | `dcfe8831fb82ab581a4e1f0e36429f89e7e9e985a6009eb2261da46df572da42` |

## Locator ownership

| Class | Field | data-testid | Evidence |
|---|---|---|---|
| `BasePage` | `banner` | `env-banner` | Browser (Playwright MCP) on `/`, `/articles/*` (2026-10-20) and `/login` (2026-10-24) |
| `BlogListPage` | `articleItems` | `article-item` | Browser on `/` (2026-10-20), 6 items |
| `LoginPage` | `emailInput` | `login-email` | Browser on `/login` (2026-10-24), `input type=email` |
| `LoginPage` | `passwordInput` | `login-password` | Browser on `/login` (2026-10-24), `input type=password` |
| `LoginPage` | `submitButton` | `login-submit` | Browser on `/login` (2026-10-24), `button type=submit` |
| `CategoriesPage` | `list` | `category-list` | **Not browser-observed.** `/categories` redirects to `/login` when signed out. Accepted on the evidence of the passing categories test (baseline and after refactor). |
| `CategoriesPage` | `items` | `category-item` (inside `list`) | Same as `list` |

Login behaviour moved from `tests/support/auth.ts` (`loginViaUi`) to `LoginPage.open()` + `LoginPage.login(email, password)`: same steps in the same order. Its one active consumer, `tests/blog/categories.smoke.spec.ts`, now uses `LoginPage`, and the helper was deleted after `git grep` found no other references.

## Verification after the refactor (2026-10-24)

| Check | Command | Result |
|---|---|---|
| Old helper references | `git grep -nE "support/auth\|loginViaUi" -- . ':!tests/support/auth.ts'` | none |
| Discovery | `npm run test:list` | 3 tests in 2 files, same titles |
| Browser cases | `npm test -- --project=chromium --retries=0` | 3 passed (3.9s) |
| Typecheck | `npm run typecheck` | exit 0; `tsc --listFilesOnly` includes all four `pages/*.ts` and no `evidence/` file |
| Safety (local, no browser) | `npm run test:safety` | 43 tests, 6 suites, 43 pass, 0 fail, 0 skipped |
| Task 01 archive | `shasum -a 256 evidence/task01-raw-draft.ts` | `dcfe8831…da42`, unchanged; `git diff --quiet 73328a4 -- evidence/task01-raw-draft.ts` exits 0 |

## Verification pass (2026-10-24, no source repairs)

### Results

| Check | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | exit 0 |
| Discovery on dev | `npx cross-env APP_ENV=dev playwright test --list` | 3 tests in 2 files, project `chromium` |
| Browser cases on dev | `npx cross-env APP_ENV=dev playwright test --project=chromium --retries=0` | 3 passed (3.5s) |
| Safety (local, no browser) | `npm run test:safety` | 43 tests, 6 suites, 43 pass, 0 fail, 0 skipped |
| Old helper references | `grep -rnE "support/auth\|loginViaUi" tests pages env safety playwright.config.ts` | none; `tests/support/` holds only `env.ts`, `users.ts` |
| Task 01 archive | `shasum -a 256 evidence/task01-raw-draft.ts` | `dcfe8831…da42`; `git diff --quiet 73328a4 -- evidence/task01-raw-draft.ts` exits 0 |

### Assertion comparison (pre-refactor `73328a4` vs now)

| Test | Before | After | Same? |
|---|---|---|---|
| banner identifies DEVELOPMENT | `page.goto('/')`; `getByTestId('env-banner')` `toBeVisible()`, `toContainText('DEVELOPMENT')` | `BlogListPage.open()` (`goto('/')`); `blog.banner` (`env-banner`) `toBeVisible()`, `toContainText('DEVELOPMENT')` | yes |
| first article card visible | `page.goto('/')`; `getByTestId('article-item').first()` `toBeVisible()` | `blog.open()`; `blog.articleItems.first()` (`article-item`) `toBeVisible()` | yes |
| signed-in author sees category list | `loginViaUi(page, AUTHOR)`; `goto('/categories')`; `category-list` `toBeVisible()`; its `category-item` `.first()` `toBeVisible()` | `LoginPage.open()` + `login(AUTHOR.email, AUTHOR.password)`; `CategoriesPage.open()`; `categories.list` `toBeVisible()`; `categories.items.first()` `toBeVisible()` | yes |

Unchanged in all three: test titles, `runIfEnv(test, ['dev'])`, the `AUTHOR` import from `tests/support/users`, relative `goto` paths (address from `getTarget()` via `baseURL`), no `.only`, extra skips, retries or projects. Login steps are the same, in the same order: `goto('/login')`, fill `login-email`, fill `login-password`, click `login-submit`, wait for a path other than `/login`.

### Locator search and ownership

- `grep -rnE "getBy(TestId|Role|Text|Label|Placeholder|AltText|Title)|\.locator\(|\$\$?\(|querySelector|frameLocator|data-testid" tests`: no matches.
- `grep -rn "page\." tests`: no matches; specs only pass `page` into Page Object constructors.
- `grep -rn "article-item" pages tests`: one match, `pages/BlogListPage.ts:9`. No duplicate ownership found.
- Every `getByTestId` in active code is in `pages/`: `BasePage` (`env-banner`), `BlogListPage` (`article-item`), `LoginPage` (`login-email`, `login-password`, `login-submit`), `CategoriesPage` (`category-list`, `category-item`).
- A future rename of `article-item` would change only `pages/BlogListPage.ts:9`. `evidence/task01-raw-draft.ts` also uses testids, but it is archived and outside typecheck and test discovery, so it is deliberately left unchanged.

Search limits: these are text searches. They would not catch a locator built from a variable or helper outside the searched folders, string selectors passed to `page.click()`-style calls (none exist, since `page.` has no matches), or testids that exist on the live page but are not used. They show where locators are written, not that each one still matches the app; the passing browser run is the evidence for that.

### Unverified items

- `category-list` and `category-item` still have not been observed in the browser (signed-out `/categories` redirects to `/login`). Accepted on the passing categories test, as agreed.

## Practice: Page Objects for the Task 01 draft

Supports the behaviour in `evidence/task01-raw-draft.ts` (archived, not active; Task 04 will review it and create the active version). The draft keeps its original imports and bytes.

| Draft line | Behaviour | Supported by |
|---|---|---|
| 8 | open the blog home | `BlogListPage.open()` (existing) |
| 10 | first card's title link (`article-item` → first → `article-link`) | `BlogListPage.firstArticleLink` (`pages/BlogListPage.ts`, added) |
| 11–12 | read that title, click it | `BlogListPage.openFirstArticle()` → returns the trimmed title (added) |
| 14 | URL is `/articles/<slug>` | stays in the test (page-level expected result) |
| 15 | article area visible (`article-detail`) | `ArticleDetailPage.detail` (`pages/ArticleDetailPage.ts`, new) |
| 16 | heading equals clicked title (`article-title`) | `ArticleDetailPage.title` (new) |

`ArticleDetailPage` extends `BasePage` (inherits `banner`). No `open()`: the draft reaches the page by clicking. No author, category, body or comment fields: the draft does not use them.

Locator evidence (Playwright MCP, read-only, 2026-10-24): home has 6 `article-item`; the first contains `article-link` (`a`, `/articles/seeding-test-data-without-tears`, "Seeding Test Data Without Tears"). Clicking it opened that URL, with exactly one `article-detail` (`article`) and one `article-title` (`h1`, same text).

Checks run after adding the classes:

| Check | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | exit 0; `tsc --listFilesOnly` includes `pages/ArticleDetailPage.ts` and no `evidence/` file |
| Task 01 archive | `shasum -a 256 evidence/task01-raw-draft.ts` | `dcfe8831…da42`; `git diff --quiet 73328a4 -- evidence/task01-raw-draft.ts` exits 0 |

### Practice verification (2026-10-24, no repairs)

| Check | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | exit 0; `tsc --listFilesOnly` lists all five `pages/*.ts` including `ArticleDetailPage.ts`, and no `evidence/` file |
| Discovery on dev | `npx cross-env APP_ENV=dev playwright test --list` | 3 tests in 2 files (same titles); no browser case added |
| Browser cases on dev | `npx cross-env APP_ENV=dev playwright test --project=chromium --retries=0` | 3 passed (4.1s) |
| Safety (local, no browser) | `npm run test:safety` | 43 tests, 6 suites, 43 pass, 0 fail, 0 skipped |
| Task 01 archive | `shasum -a 256 evidence/task01-raw-draft.ts` | `dcfe8831…da42`; `git diff --quiet 73328a4 -- evidence/task01-raw-draft.ts` exits 0 |
| Scope | `ls pages tests/blog`; `grep` of public members | one new class (`ArticleDetailPage`: `detail`, `title`); `BlogListPage` gained only `firstArticleLink` and `openFirstArticle()`; no `open()`, author, category, body or comment members; `tests/blog/` still holds only the two existing specs |

Typechecked vs executed:
- Typechecked: `ArticleDetailPage` and the `BlogListPage` additions compile under the project's strict settings.
- Executed: only the `BlogListPage` constructor line that builds `firstArticleLink`, because both home tests construct `BlogListPage`. Building a Playwright locator does not query the page, so this does not prove the link is found.
- Not executed: `openFirstArticle()`, `ArticleDetailPage.detail` and `ArticleDetailPage.title`. No active test uses them (`grep` finds them only in `pages/`). Task 04 will verify this behaviour through the reviewed active test.

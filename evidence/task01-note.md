# Task 01: explore the app with Playwright MCP and draft a test

Written 2026-10-26 from existing records, without rerunning anything:
- the commit `73328a4` ("Task 01: Playwright MCP and raw draft", 2026-10-21 01:26 +0700);
- the local MCP snapshots in `.playwright-mcp/`;
- the saved Claude Code session transcript of 2026-10-20, 17:50–18:20Z.

Where a fact comes only from the transcript, it says so.

## Setup
- **`.mcp.json`** (committed in `73328a4`) adds the `playwright` MCP server: `npx @playwright/mcp@latest --isolated --browser chromium`. It is enabled in `.claude/settings.local.json` (`enabledMcpjsonServers: ["playwright"]`).
- **First attempt:** creating `.mcp.json` was blocked once by Claude Code's auto-mode check as self-modification, and was not worked around (transcript, 18:04Z). You added the server yourself with `claude mcp add --scope project playwright …`, which appears in your shell history.

## Browser exploration (Playwright MCP, dev, read-only)
From the transcript (18:10–18:19Z). It matches the local snapshots `.playwright-mcp/page-2026-10-20T18-10-22-115Z.yml`, `…18-10-55-629Z.yml` and `…18-11-01-654Z.yml`, which show the blog header (`CodemifyQA`, `Blog`).
- **Gather:** `browser_navigate` to `https://dev.ai-orchestration-courses.com/` (title "Codemify QA Blog"). `browser_evaluate`: 6 `article-item` cards. The first `article-link` read "Seeding Test Data Without Tears" → `/articles/seeding-test-data-without-tears`.
- **Act:** `browser_click` on that link. The page moved to `/articles/seeding-test-data-without-tears`.
- **Verify:** that page had `article-detail` and an `h1` `article-title` with the same text.
- **Chosen scenario:** a visitor opens the first article and sees the same title on its page. It adds coverage the 3 existing tests (banner, first card, categories) did not have.

## The draft and its passing run
- The draft was created as `tests/blog/article-detail.smoke.spec.ts` after your approval (transcript, 18:16Z).
- **First run (18:16Z):** `cross-env APP_ENV=dev playwright test tests/blog/article-detail.smoke.spec.ts` → `1 passed (2.3s)`.
- **Requested run (18:18Z):** the target was confirmed as dev through the project's own `getTarget()`:
  ```
  {"env":"dev","baseURL":"https://dev.ai-orchestration-courses.com"}
  ```
  ```
  $ npm test -- tests/blog/article-detail.smoke.spec.ts --project=chromium --retries=0 --headed
    ✓  1 [chromium] › tests/blog/article-detail.smoke.spec.ts:7:3 › Article detail (dev smoke) › opening the first article card shows its title on the detail page (3.3s)
    1 passed (6.8s)
  ```
- **Hash right after that run:** `dcfe8831fb82ab581a4e1f0e36429f89e7e9e985a6009eb2261da46df572da42`.

## Archive
- The passing draft was moved to `evidence/task01-raw-draft.ts`, byte-identical, and no active copy remained in `tests/blog/` (transcript, 18:18–18:19Z).
- After archiving (18:19Z): the archive hash matched, the 3 original browser tests passed on dev, typecheck was clean, and 43 safety checks passed.
- **Still true on 2026-10-26:** `git diff --quiet 73328a4 -- evidence/task01-raw-draft.ts` exits 0. Typecheck, ESLint, Prettier, lint-staged and the test listing all exclude the draft. The staged secret scan still covers it.

## What happened next
- **Task 02:** added `BlogListPage.openFirstArticle()` and `ArticleDetailPage` to support the draft (evidence/task02-note.md, Practice).
- **Task 04:** reviewed the draft against the rules and made it the active `tests/blog/article-detail.smoke.spec.ts` (evidence/task04-note.md, Test 4).

## Limits of this note
- It was written six days after the work, from the transcript and the snapshots.
- `.playwright-mcp/` is ignored by Git (local only), so the snapshots it cites are not in the repository.
- The transcript is Claude Code's local session log, not a repository file.

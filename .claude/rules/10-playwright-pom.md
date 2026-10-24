---
paths:
  - "tests/**/*.ts"
  - "pages/**/*.ts"
---

# Playwright and Page Objects

Applies when working on browser tests (`tests/`) and Page Objects (`pages/`). ⚠️ marks a mistake that our current checks would not catch.

## P1. Locator priority
- Do: in Page Objects, use a verified `getByTestId` first, then `getByRole` with an accessible name, then `getByText`.
- Check: review of `pages/`.

## P2. No brittle CSS chains
- Do: no CSS chains, positional selectors or XPath, such as `locator('div > ul li:nth-child(2)')`.
- Check: review; `grep -rn "locator(" pages`.
- ⚠️ A brittle chain passes until the markup changes, and no check looks for one.

## P3. Tests use Page Objects, not raw locators
- Do: specs in `tests/` use Page Object fields and methods. No `getBy*`, `.locator(`, `$(` or `$$(` in `tests/`.
- Check: `grep -rnE 'getBy|\.locator\(|\$\$?\(' tests` should print nothing.
- ⚠️ This search is not automated; it only runs if a reviewer runs it.

## P4. One class per page
- Do: one class per page in `pages/<Name>Page.ts`, extending `BasePage` (shared `banner`). Locators are `readonly` fields set in the constructor.
- Check: `ls pages`; review.

## P5. Methods describe the user's intention
- Do: name methods for what the user wants, such as `open()`, `login(email, password)` or `openFirstArticle()`, not one method per click (`clickSubmit()`).
- Check: review.

## P6. No fixed waits
- Do: no `waitForTimeout` or sleeps. Use Playwright's auto-waiting `expect(...)` assertions and `waitForURL`.
- Check: `grep -rn waitForTimeout tests pages` should print nothing.
- ⚠️ Not automated, and a fixed wait often passes on a fast connection.

## P7. Assertions match the requirement
- Do: assert exactly what the requirement or test case states. Tests own expected values; Page Objects locate and act but do not assert.
- Check: review against the requirement or Jira test case.

## P8. No exact counts for shared, changing lists
- Do: on shared dev lists (articles, categories), assert "at least one" unless the requirement itself asks for a number, or the test created the records it counts. See README, "Why at least one".
- Check: `grep -rn toHaveCount tests`; review any match.
- ⚠️ An exact count passes today and fails when someone else adds data on dev.

## P9. Only verified test IDs
- Do: use a test ID only after it has been seen on live dev (Playwright MCP browser or a passing test) and recorded in evidence; today that is the ownership tables in evidence/task02-note.md and evidence/task04-note.md. Mark anything else as unverified; never present a guessed ID as verified.
- Check: compare `grep -rn getByTestId pages` with the evidence tables.
- ⚠️ A guessed ID in a Page Object member that no test uses still passes typecheck. Confirm every new member is used by at least one passing test.

## P10. Relative navigation only
- Do: navigate with relative paths (`goto('/login')`) so the address comes from `baseURL`. Test helpers import tests/support/env.ts, never playwright.config.ts.
- Check: `grep -rn "https://" tests pages` should print nothing.

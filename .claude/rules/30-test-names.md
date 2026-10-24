---
paths:
  - "tests/**/*.spec.ts"
---

# Test names

## N1. Names state the action and the expected result
- Do: name each test so its line in `npm run test:list` says who acts, what they do and what should result, so a reader understands it without opening the code. Use `test.describe` for the page or area, and the `test()` title for the action and expected result.
- When: adding or renaming any `test()` or `test.describe` in `tests/`.
- The title and the assertions must describe the same result. If the title says "at least one", the test must not assert an exact count (see P8 in .claude/rules/10-playwright-pom.md).

Good:
```
Categories (dev smoke) › signed-in author sees the category list with at least one item
```
Bad: `categories works`, `test 1`, `should load`.

- Check: run `npm run test:list` and read each line; each should make sense without the code.

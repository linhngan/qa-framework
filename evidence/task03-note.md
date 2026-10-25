# Task 03: clear project rules for AI

Written 2026-10-26 from existing records, without rerunning anything: the commit `f21bbd0` ("Add clear project rules for AI", 2026-10-24 21:42 +0700) and the saved Claude Code session transcript of 2026-10-24, 14:17–14:43Z. Where a fact comes only from the transcript, it says so.

## What was added (`f21bbd0`, 5 files)
| File | Role |
|---|---|
| `CLAUDE.md` | Short router: targets, teaching login, commands, three "Always" rules, the rule-file table. 46 lines at the time (the limit was 60 or fewer); 48 lines now |
| `.claude/rules/01-guardrails.md` | Whole project, always loaded: G1–G6 at the time (G7 was added in Task 08, G8 in Task 09) |
| `.claude/rules/10-playwright-pom.md` | `tests/**/*.ts`, `pages/**/*.ts`: locators, Page Objects, waits, assertions, verified test IDs |
| `.claude/rules/20-data-management.md` | tests, pages, `scripts/**`, `jira-seed/**`: seed data, naming, cleanup, approved scripts, read-only database |
| `.claude/rules/30-test-names.md` | `tests/**/*.spec.ts`: **the fourth, practice rule** (below) |

**The three named rule files** are 01 (guardrails), 10 (Playwright and Page Objects) and 20 (test data). Each rule has a "Do", a "When" and a "Check" line. ⚠️ marks a mistake the current checks would miss.

## The fourth practice rule: test names (N1)
Your additional rule, as given in the Task 03 brief (transcript, 14:17Z):

> Name tests so someone reading the test list can understand the action and expected result without opening the code.

It became N1 in `.claude/rules/30-test-names.md`:
- each `npm run test:list` line says who acts, what they do and what should result;
- `test.describe` names the area;
- the title and the assertions describe the same result ("at least one" means no exact count, linking to P8);
- it includes a good example and bad examples.

The plan checked that it adds something no required rule covers, and that it does not contradict them (transcript, 14:20–14:25Z). It was later applied when the drafts were reviewed (finding V2 in evidence/task04-note.md).

## Verification and repair (transcript, 14:29–14:43Z)
- **First check, 10 required checks:** 2 failed, 2 could not be verified from inside the session, the rest passed. `CLAUDE.md` was 46 lines; all four rule files existed and were in the table; `test:list` showed browser tests only; `test:safety` was 43/43.
- **Failures:**
  - D7 had no Check line;
  - two enforcement claims in G5 overstated what `.gitignore` and the settings deny list do.
- **Fixed and amended** into the same commit (`68877b6` → `f21bbd0`):
  - D7 got a Check line;
  - G5 now says `.gitignore` un-ignores `.env.example`, which does not exist yet;
  - G5 now says the deny list blocks Claude's Read tool only.
- **Not verified then:** that path-scoped rules load for matching files. That needed a fresh session.

## Limits of this note
- It was written two days after the work, from the transcript.
- Path-scoped rule loading has still not been checked on purpose. Later sessions edited `tests/` and `pages/` with these rules in force, but no step recorded which rule files were loaded.

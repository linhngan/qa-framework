# Task 06: Edit/Write guard (PreToolUse)

Branch `week-2`, starting from `e10da18` (Task 05), working tree clean apart from the untracked `.playwright-mcp/` snapshots. Claude Code 2.1.287, Node v24.21.0.

## Demonstration spec

`tests/blog/home.smoke.spec.ts` (real path `/Users/ngannguyen/Documents/testing/codemify/qa-framework/tests/blog/home.smoke.spec.ts`).
- Active: `runIfEnv(test, ['dev'])`, no skip, only or fixme, and both of its tests appear in `npm run test:list`.
- At the start of Task 06 it had no staged or unstaged changes; it matches `e10da18`.

## Files

- `scripts/hooks/guard.mjs`: the guard. Node built-ins only. It reads the event JSON on stdin and examines only that JSON; it never opens the target file and never applies the edit.
- `safety-tests/guard.test.mjs`: 26 isolated `node:test` checks at first, 34 after the hard-wait extension (see "Hard-wait extension"). Each passes simulated JSON through `spawnSync`'s `input` option. File paths point into a project folder that is never created, and there is no browser or network.
- `.claude/settings.json`: adds `PreToolUse` (see "Connection").
- `vault/03-framework/hook-lifecycle-map.md`: the guard row and its status.

`package.json` is unchanged: `test:safety` already runs `safety-tests/**/*.test.mjs`.

## What the guard checks

The checks run in this order, and the first match blocks.

| # | Check | Applies to | Blocks when |
|---|---|---|---|
| 1 | Protected filename | Edit, Write | The basename, after `\` → `/`, is `.env`, matches `.env.*`, `*.pem`, `*.key` or `*.p12`, or is `id_rsa` or `id_ed25519`. `.env.example` is exempt from this check only. |
| 2 | Secret-looking new text | Edit `new_string`, Write `content` | The text contains one of four detector strings: the Slack bot-token prefix, the Atlassian API-token prefix, the AWS access-key-ID prefix, or the PEM private-key header including its hyphens. |
| 3 | `.only` added | `*.spec.ts` | `.only` is in the new text but not the old text. |
| 4 | `.skip` added | `*.spec.ts` | `.skip` is in the new text but not the old text. |
| 5 | Fewer `expect(` | Edit on `*.spec.ts` | `new_string` has fewer than `old_string`. |
| 6 | Fewer `runIfEnv(` or `envGuard(` | Edit on `*.spec.ts` | Either helper has fewer calls. The two are counted separately. |
| 7 | Hard wait added (added later; see "Hard-wait extension") | Edit and Write on `*.spec.ts` | `waitForTimeout(` is in the new text but not the old text. It runs after check 4 and before checks 5–6. |

- **Write:** the old text is treated as empty, so checks 3–4 block any `.only` or `.skip` in the content. Checks 5–6 are **not** run for Write: without old text there is no baseline to compare.
- **Detector strings:** they are assembled from pieces in both the guard and the tests, comments included. This note describes them only by type.

**Results**
- **Blocked:** exit 2 and exactly one stderr line beginning `guard: BLOCKED — `.
- **Allowed:** exit 0, nothing on stdout or stderr.
- **Malformed or unreadable input:** exit 0, silent.
- **Unexpected errors:** caught, exit 0. The script uses `process.exitCode`, not `process.exit()`, so the stderr line is written in full before Node exits.

Refusal messages (`<path>` is relative to the project when the file is inside it):
```
guard: BLOCKED — <path> is a protected secret file (<basename>). Keep secrets outside the project; put documented placeholders in .env.example instead.
guard: BLOCKED — new text for <path> looks like <kind>. Remove it and load the real value from the environment, never from a tracked file.
guard: BLOCKED — <path> would gain .only, which runs only that test and silently skips the rest. Remove .only.
guard: BLOCKED — <path> would gain .skip. Do not skip tests to get a pass; fix the test, or use runIfEnv for environment gating.
guard: BLOCKED — <path> would gain waitForTimeout(, a fixed wait that passes or fails on timing. Wait for the condition the test actually needs instead: an auto-waiting expect(...) assertion such as toBeVisible(), or page.waitForURL() (P6).
guard: BLOCKED — this edit to <path> removes expect( calls (old N, new M). Keep every assertion; move it instead of deleting it, or ask a human to approve the removal.
guard: BLOCKED — this edit to <path> removes runIfEnv( calls (old N, new M). Specs that change data must keep runIfEnv(test, ['dev']) (G2).
guard: BLOCKED — this edit to <path> removes envGuard( calls (old N, new M). Every data-changing call stays wrapped in envGuard (G3).
```
`<kind>` is one of: a Slack bot token, an Atlassian API token, an AWS access key ID, a private key. No message repeats the matched text.

## Isolated checks (actual output)

```
$ npm run test:safety
> node --test "safety/**/*.test.ts" "safety-tests/**/*.test.mjs"
▶ guard quick sample
  ✔ protected-file Write to .env → 2
  ✔ Edit removing an assertion from a spec → 2
  ✔ ordinary comment-only Edit of a spec → 0
▶ guard initial checks: one blocked and one allowed example each
  ✔ 1 protected filename, blocked: .env, .env.*, *.pem, *.key, *.p12, id_rsa, id_ed25519, Windows separators
  ✔ 1 protected filename, allowed: .env.example and ordinary names
  ✔ 2 secret-looking new content, blocked: each detector kind, in Write content and Edit new_string
  ✔ 2 secret-looking new content, allowed: similar text that is not a detector string
  ✔ 3 .only added to a spec, blocked
  ✔ 3 .only, allowed: spec edit without .only
  ✔ 4 .skip added to a spec, blocked
  ✔ 4 .skip, allowed: spec edit without .skip
  ✔ 5 fewer expect( calls, blocked: a separate assertion deletion
  ✔ 5 fewer expect( calls, allowed: a combined edit that moves an assertion keeps its count
  ✔ 6 fewer runIfEnv( or envGuard( calls, blocked: each helper removed on its own
  ✔ 6 fewer runIfEnv( or envGuard( calls, allowed: an edit next to the helpers keeps both counts
▶ guard edge cases
  ✔ malformed or unreadable input → 0, silent
  ✔ removes all leading byte-order marks before parsing
  ✔ other tools are not examined
  ✔ counts the helpers separately: removing one while adding the other still blocks
  ✔ .env.example is exempt from the filename check only, not the content check
  ✔ checks run in order and report one reason: a protected file with secret content gets the filename reason
  ✔ Write treats old text as empty: .only or .skip anywhere in a spec blocks
  ✔ known limit: a whole-file Write cannot be checked for removed assertions or helpers
  ✔ known limit: .only or .skip already in the old text is not reported again
  ✔ known limit: .only, .skip and removals are checked only in *.spec.ts files
  ✔ known limit: filename matching is case-sensitive
ℹ tests 82
ℹ suites 12
ℹ pass 82
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
```
(Timings removed. The 56 earlier checks, 43 Week 1 and 13 Task 05, are in the same run and all passed.)

- **82 = 56 earlier + 26 guard checks:** 3 quick-sample, 12 blocked/allowed pairs and 11 edge cases or known limits.
- **What the assertions require:**
  - every blocked case: exit 2, empty stdout, one stderr line with the prefix, and the expected reason text;
  - every allowed case: exit 0 with empty stdout and stderr;
  - the secret test: the reason never contains the sample.
- **Malformed inputs tested:** `''`, `{not json`, `null`, `[]`, `{}`, a missing `tool_input`, a numeric `file_path`, a missing `old_string`, an empty `file_path`, and an unreadable stdin (`stdio: 'ignore'`). All → 0, silent.
- **Not covered by a test:** the unexpected-error branch, which cannot be triggered without a test-only backdoor. It is covered by reading the code only.

**Redaction check.** A search for the four detector strings was run, with the pattern assembled in the shell, over `guard.mjs`, `guard.test.mjs` and the saved test output. It found 0 matches in each.

## Command resolution (command string only, not a live hook)

The exact connection string `node scripts/hooks/guard.mjs` was run through `sh -c` with the three quick-sample inputs, with `CLAUDE_PROJECT_DIR` set to the project root:

| Run from | Protected Write `.env` | Edit removing an `expect(` | Comment-only Edit |
|---|---|---|---|
| project root | 2, `guard: BLOCKED — .env is a protected secret file (.env). …` | 2, `guard: BLOCKED — this edit to tests/blog/home.smoke.spec.ts removes expect( calls (old 2, new 1). …` | 0, silent |
| `tests/blog/` | 1, `MODULE_NOT_FOUND` | 1 | 1 |

- **Superseded:** the command was later corrected to `node "${CLAUDE_PROJECT_DIR}"/scripts/hooks/guard.mjs`, which gives 2 / 2 / 0 from both folders (see "Command correction").
- **From a subfolder** the relative path cannot be found. Exit 1 is a non-blocking error for PreToolUse, so the edit would go ahead unguarded. This is the same working-folder weakness Task 05 fixed for the recorder. The relative command was kept because Task 06 specifies it.
- **The project's real `.env`.** A `.env` exists at the project root (dated 2026-10-15, created before this task). It is ignored by Git. Only its directory entry was listed; neither the guard nor this check opened it.

## Official documentation (hooks reference, read through a web-fetch summary)

- **Exit codes on PreToolUse:**
  - exit 2 blocks the tool call, and stderr becomes the reason given to Claude;
  - exit 0 lets the call proceed;
  - any other code is a non-blocking error, and the call proceeds.
- **Hook order:** matching hooks run in parallel.
- **`onFailure: "block"`:** this option would make any failure block too, closing the fail-open gap. It is **not** used, because this course guard is meant to fail open.
- **Not stated outright:** the reference shows PostToolUse after the tool runs, but does not say explicitly that it is skipped when PreToolUse blocks. To be observed in the live check.
- **Field names:** `tool_input.file_path`, `old_string`, `new_string` and `content` are not listed in the hooks reference. They match the Edit and Write tool parameters, and the Task 05 recorder read `tool_input.file_path` live.

## Fails open

The guard lets an edit through, without blocking, when:
- the input is malformed, unreadable, or missing a required string field;
- an unexpected error occurs;
- the script or `node` cannot be found (exit 1). With the original relative command this happened whenever Claude Code's current folder was not the project root (shown above). The corrected command removes that case, but a missing `node` or a missing script would still fail open;
- the hook is not loaded or not approved in the session;
- the tool is not Edit or Write: Bash redirection or `sed`, NotebookEdit, and anything else outside the matcher;
- the edit is made outside Claude Code: in an editor or IDE, by hand, or by another program. Hooks run only for Claude Code's own tool calls, so such edits never reach the guard;
- the change falls into one of the known limits below.

**False alarm when moving an assertion.** Moving an `expect(` with two separate Edits, one deleting it and one adding it back elsewhere, is refused at the first Edit: that Edit on its own lowers the `expect(` count (check 5). The assertion is not really being removed, but the guard sees one Edit at a time and cannot know a second one will follow.

The suitable edit is a single combined Edit. Its `old_string` spans both places and includes the assertion; its `new_string` has the assertion in its new position. The count stays the same, so check 5 allows it.

Both halves are covered by isolated tests:
- `5 fewer expect( calls, blocked: a separate assertion deletion`;
- `5 fewer expect( calls, allowed: a combined edit that moves an assertion keeps its count`.

This has not been tried live.

**Known limits** (each has an allowed test showing it):
- a whole-file Write is not checked for removed assertions or helpers;
- `.only` or `.skip` already in the old text is not reported again;
- `.only`, `.skip` and removals are checked only in `*.spec.ts` files;
- filename matching is case-sensitive.

**Untested heuristics:**
- the detectors are plain substrings, so for example `.only` inside a comment in a spec blocks;
- an RSA- or EC-style key header is not matched, only the plain private-key header.

The guard and its test file have no exemption from secret scanning.

## Status

| Item | Status |
|---|---|
| Script verified | Yes: 34 isolated guard checks pass, covering checks 1–7 (26 for checks 1–6, then 8 for check 7), plus the command-string check from the project root (2 / 2 / 0) |
| Configured | Yes: `PreToolUse`, matcher `Edit\|Write`. The command is now `node "${CLAUDE_PROJECT_DIR}"/scripts/hooks/guard.mjs` (see "Command correction"); it was first added as `node scripts/hooks/guard.mjs` after the checks above passed |
| Live hook | Verified for two refusals of the `.only` check from the project root: the first with the relative command ("Live refusal"), the second with the corrected command ("Command correction"). Not tried in a session started from a subfolder; checks 1, 2 and 4–7 have not been tried live |

## Connection

Only the `PreToolUse` key was added to `.claude/settings.json`; `permissions` are identical to HEAD (`e10da18`), and the PostToolUse and SessionStart recorder hooks are unchanged:
```diff
   "hooks": {
+    "PreToolUse": [
+      {
+        "matcher": "Edit|Write",
+        "hooks": [
+          { "type": "command", "command": "node scripts/hooks/guard.mjs" }
+        ]
+      }
+    ],
     "PostToolUse": [
```
Configured hooks afterwards:
```
PreToolUse   | Edit|Write | node scripts/hooks/guard.mjs
PostToolUse  | Edit|Write | node "${CLAUDE_PROJECT_DIR}"/scripts/vault-sync.mjs --from-hook
SessionStart | (none)     | node "${CLAUDE_PROJECT_DIR}"/scripts/vault-sync.mjs --session-start
```

**Documentation edits after connecting.** The hook map and this note were edited after the connection. Each edit was an allowed Claude call that went through as expected. That does not prove the guard ran: an allowed call looks the same whether the guard returned 0 or did not run at all. Live proof needs a call the guard refuses.

## Live refusal (2026-10-25)

This was the same Claude Code session that built and connected the guard, continued from the project root on `week-2` at `e10da18`. No new session started: `sessions.log` still has only its 2026-10-24 line.

**Before the attempt**
- **Hooks configured:** the PreToolUse guard, the PostToolUse recorder and the SessionStart recorder, as listed under "Connection".
- **Spec clean:** `git diff --cached` and `git diff` of `tests/blog/home.smoke.spec.ts` were both empty.
- **Spec captured:** 23 lines, SHA-1 `b54e1e0…`, copied aside.
- **Logs captured:** `2026-10-24.md`, `2026-10-25.md` (29 lines) and `sessions.log` were copied aside.

**The attempt.** One **Claude Edit** (08:32Z) proposed appending `// Task 06 guard check: test.only(` after the import line `import { BlogListPage } from '../../pages/BlogListPage';`. That old text has no `.only`, and no test declaration was touched.

**The actual tool result:**
```
PreToolUse:Edit hook error: [node scripts/hooks/guard.mjs]: guard: BLOCKED — tests/blog/home.smoke.spec.ts would gain .only, which runs only that test and silently skips the rest. Remove .only.
```

**After the attempt**
- **Spec unchanged:** `cmp` with the copy matched byte for byte. SHA-1 is still `b54e1e0…`, `git status` shows nothing, and the comment does not appear in the file.
- **No log entry:** `2026-10-24.md`, `2026-10-25.md` (still 29 lines) and `sessions.log` were byte-identical to the copies. The refused call never reached PostToolUse, so the recorder logged nothing.
- **Nothing else involved:** no alternative was tried, no other tool wrote the comment, and the guard was not run by hand for this proof.

**Verified:** the PreToolUse guard, connected with `node scripts/hooks/guard.mjs`, ran live inside Claude Code from the project root and refused an Edit with exit 2. Its reason reached Claude as the tool error.

**Still unverified**
- The guard's live behaviour from a session started in a subfolder. The relative command was expected to fail open there; it has since been corrected (see "Command correction").
- The other checks live: filename, secret, `.skip`, `expect(` and the helpers.
- An allowed call that is shown to have passed through the guard.
- `/hooks`, and a fresh session.

These documentation edits were made after the comparison. They are not part of it.

## Hard-wait extension (check 7, 2026-10-25)

**Change.** One check was added to `scripts/hooks/guard.mjs`, right after the `.skip` check:
- **Edit** on a `*.spec.ts`: blocks when `waitForTimeout(` is in `new_string` but not in `old_string`.
- **Write** on a `*.spec.ts`: the old text is empty, so any `waitForTimeout(` in the whole content blocks.
- **Order:** check 7 runs after check 4 and before checks 5–6.
- **Unchanged:** checks 1–6, their tests and allowed examples, the settings, and the fail-open behaviour.
- **No active test was given a hard wait.** All samples were simulated JSON, and `tests/` and `pages/` have no changes.

**The new examples, run through the script directly.** These are isolated script runs with simulated input, not live hook runs:

| Input | Exit | stdout | stderr |
|---|---|---|---|
| Edit on `tests/blog/home.smoke.spec.ts`: add `await page.waitForTimeout(2000);` after `await blog.open();` | 2 | empty | `guard: BLOCKED — tests/blog/home.smoke.spec.ts would gain waitForTimeout(, a fixed wait that passes or fails on timing. Wait for the condition the test actually needs instead: an auto-waiting expect(...) assertion such as toBeVisible(), or page.waitForURL() (P6).` |
| Edit on the same spec: add `await page.waitForURL('**/blog');` and `await expect(blog.banner).toBeVisible();` after `await blog.open();` | 0 | empty | empty |
| Write of a whole spec containing `await page.waitForTimeout(500);` | 2 | empty | the same `would gain waitForTimeout(` reason |
| Write of a whole spec that waits only through `waitForURL` and `expect(...).toBeVisible()` | 0 | empty | empty |

**Isolated checks (actual output, timings removed):**
```
$ npm run test:safety
▶ guard hard-wait check (7)
  ✔ 7 hard wait added to a spec, blocked: Edit adding waitForTimeout(
  ✔ 7 hard wait, allowed: Edit adding a condition-based wait
  ✔ 7 hard wait, Write blocked: waitForTimeout( anywhere in whole spec content
  ✔ 7 hard wait, Write allowed: whole spec content that waits only on conditions
  ✔ 7 runs before the removal checks: adding a hard wait while deleting an assertion gets the hard-wait reason
  ✔ known limit: waitForTimeout( already in the old text is not reported again
  ✔ known limit: the hard-wait check covers only *.spec.ts files
  ✔ known limit: a space before the bracket is not matched (plain substring)
ℹ tests 90
ℹ suites 13
ℹ pass 90
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
```
- **90 = 82 earlier + 8 new.**
- **Earlier coverage, all still passing in the same run:**
  - the 3 quick-sample checks, the 12 blocked/allowed pairs for checks 1–6, and the 11 guard edge cases, with their test names unchanged;
  - the 13 vault-sync checks;
  - the 43 Week 1 checks.
- **Redaction:** a search for the four detector strings (pattern assembled in the shell) found 0 matches in the test output, `guard.mjs` and `guard.test.mjs`.

**Status of check 7**

| Item | Status |
|---|---|
| Configured | Yes, through the existing PreToolUse hook. The settings did not change |
| Script verified | Yes: the 8 checks above |
| Live hook | Not verified. Check 7 was added after the live refusal, which tested only check 3 |

## Final verification (2026-10-25)

**Browser suite on dev.** `npm test` (APP_ENV=dev) at 08:43Z, HEAD `e10da18` plus the uncommitted Task 06 files. `playwright.config.ts`, `tests/`, `pages/` and `env/` are unchanged from HEAD, with one `chromium` project and `retries: 0`.
```
Running 5 tests using 4 workers
  ✓ home.smoke › banner is visible and identifies DEVELOPMENT
  ✓ article-detail.smoke › visitor who opens the first article sees the same title on its article page
  ✓ category-filter.smoke › visitor who filters by Playwright sees only Playwright articles
  ✓ home.smoke › first article card is visible and at least one card exists
  ✓ categories.smoke › signed-in author sees the category list with at least one item
  5 passed (4.2s)
```
This matches the established baseline of 5 passed. Nothing was skipped or retried, and no assertion or configuration was changed.

**Other checks in the same review**
- **`npm run test:safety`:** tests 90, suites 13, pass 90, fail 0, cancelled 0, skipped 0.
- **`npm run typecheck`:** exit 0.
- **`npm run test:list`:** 5 tests in 4 files.
- **`.claude/settings.json` compared with HEAD:**
  - `permissions` are identical;
  - the PostToolUse and SessionStart recorder hooks are identical;
  - the only new key is `PreToolUse`.
- **Earlier checks unchanged:** `safety/`, `safety-tests/vault-log.test.mjs`, `scripts/vault-sync.mjs` and `package.json` have no diff from HEAD.
- **Detector strings:**
  - every detector string and sample in `guard.mjs` and `guard.test.mjs` is joined from pieces (`[...].join('')`);
  - a search of all tracked and new files, excluding `.playwright-mcp/`, found no literal detector string;
  - no scanner allowlist, exemption or config file was added.

## Command correction (2026-10-25, after commit `c2ca38c`)

**Problem.** The relative command `node scripts/hooks/guard.mjs` fails with `MODULE_NOT_FOUND` (exit 1) when Claude Code's current folder is not the project root (see "Command resolution"). PreToolUse treats exit 1 as non-blocking, so the guard failed open there.

**Change.** Only the PreToolUse `command` string in `.claude/settings.json` changed. It now uses the same quoted shell form as the Task 05 recorder:
```diff
-          { "type": "command", "command": "node scripts/hooks/guard.mjs" }
+          { "type": "command", "command": "node \"${CLAUDE_PROJECT_DIR}\"/scripts/hooks/guard.mjs" }
```
- **Unchanged, compared with HEAD:** `permissions`, the PostToolUse and SessionStart recorder hooks, and the matcher (`Edit|Write`).
- **Not touched:** `guard.mjs`, its tests, the demonstration spec, and every other file.
- The settings Edit was itself allowed and logged one recorder entry.

**Command-string check, repeated.** The new string was run through `sh -c` with the three quick-sample inputs and `CLAUDE_PROJECT_DIR` set to the project root. These were command-string runs, not live hooks.

| Run from | Protected Write `.env` | Edit removing an `expect(` | Comment-only Edit |
|---|---|---|---|
| project root | 2, `.env is a protected secret file (.env)` | 2, `removes expect( calls (old 2, new 1)` | 0, silent |
| `tests/blog/` | 2, the same reason | 2, the same reason | 0, silent |

Before the correction, `tests/blog/` gave exit 1 for all three.

**Isolated checks, repeated.** `npm run test:safety`: tests 90, suites 13, pass 90, fail 0, cancelled 0, skipped 0.

**Live refusal, repeated with the corrected command (09:00Z, same session, from the project root)**
- **Before:**
  - `tests/blog/home.smoke.spec.ts` was clean against HEAD (SHA-1 `b54e1e0…`) and copied aside;
  - `2026-10-24.md`, `2026-10-25.md` (41 lines) and `sessions.log` were copied aside.
- **The attempt.** One **Claude Edit** proposed the same harmless line after the import, `// Task 06 guard check: test.only(`. The replaced import line has no `.only`.
- **The actual tool result:**
  ```
  PreToolUse:Edit hook error: [node "${CLAUDE_PROJECT_DIR}"/scripts/hooks/guard.mjs]: guard: BLOCKED — tests/blog/home.smoke.spec.ts would gain .only, which runs only that test and silently skips the rest. Remove .only.
  ```
- **After:** the spec is byte-identical to the copy, and `git status` shows no change under `tests/`. All three log files are byte-identical to the copies, so the refused call added no entry.

**What this verifies**
- Claude Code reloaded the settings in this session without a restart: the bracketed command in the tool error is the new string.
- The corrected command refuses live from the project root.

**Still unverified**
- The live hook in a session started from a subfolder. Only the command string has been run from `tests/blog/`, and that is not a live hook.
- Whether `CLAUDE_PROJECT_DIR` is set as documented in such a session.

# Task 05: vault recorder and hooks

Branch `week-2`, starting from `869ed8d` (Task 04). Starting browser suite on dev: 5 passed.
Project root: /Users/ngannguyen/Documents/testing/codemify/qa-framework. Node v24.21.0, Git 2.54.0.

## Demonstration spec

`tests/blog/home.smoke.spec.ts`: outside `vault/`, unchanged since Task 02. Three Edits changed only a check comment; it was added on 2026-10-24 and its timestamp changed twice on 2026-10-25. A final Edit removed it (see "Comment removed" below), so the spec matches HEAD again.

## Files

- `scripts/vault-sync.mjs`: recorder (`--from-hook`, `--session-start`), Node built-ins only.
- `safety-tests/vault-log.test.mjs`: 11 isolated `node:test` checks, 13 after the commit-ID extension (below).
- `package.json`: `test:safety` now also runs `safety-tests/**/*.test.mjs`.
- `.claude/settings.json`: added `hooks` (PostToolUse `Edit|Write`, SessionStart); `permissions` unchanged.
- `vault/_map.md`, `vault/_raw/.gitkeep`, `vault/03-framework/hook-lifecycle-map.md`.

## Isolated checks

```
$ npm run test:safety
> node --test "safety/**/*.test.ts" "safety-tests/**/*.test.mjs"
ℹ tests 54
ℹ suites 9
ℹ pass 54
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
```
54 = the 43 Week 1 checks plus 11 vault-sync checks: PostToolUse and FileChanged path shapes, relative and absolute paths, vault exclusions, outside-project paths, malformed input and missing or non-string paths, leading byte-order marks, append-only behaviour, local-date filename with UTC entry time (TZ=Pacific/Kiritimati), missing Git information, write failure (exit 0, short stderr without input), and `--session-start`. Each runs in a temporary Git repository with `CLAUDE_PROJECT_DIR` set to it; the real project had no `vault/` folder after the run.

## Manual sample on the real project (before the hooks were connected)

Run as `printf '%s' '<json>' | CLAUDE_PROJECT_DIR="$PWD" node scripts/vault-sync.mjs --from-hook`. No file was edited; these are sample inputs.

| Input | Before | After | Exit |
|---|---|---|---|
| `{"hook_event_name":"PostToolUse","tool_name":"Edit","tool_input":{"file_path":"<root>/tests/blog/home.smoke.spec.ts"}}` | `vault/_changelog/` did not exist | `vault/_changelog/2026-10-24.md` created with 1 entry (below) | 0 |
| `{"hook_event_name":"PostToolUse","tool_name":"Write","tool_input":{"file_path":"<root>/vault/_map.md"}}` | 1 entry | 1 entry (ignored, unchanged) | 0 |

Entry written:
```
- 2026-10-24T15:56:13Z · Ngan Nguyen @ Ngans-MBP.lan · week-2 · tests/blog/home.smoke.spec.ts · last commit: Task 04: review drafts and add article detail and category filter tests
```

Git: `git check-ignore -v vault/_changelog/sessions.log` → `.gitignore:22:*.log` (ignored); `vault/_changelog/2026-10-24.md` is not ignored (untracked until committed with this task).

## sessions.log baseline

`vault/_changelog/sessions.log` does not exist (0 lines, no last line). No SessionStart hook has run yet.

## Live check in this session

After the hooks were added to `.claude/settings.json`, the same session picked them up:

| Claude tool call | Path | Changelog lines before → after |
|---|---|---|
| Edit (adding the hooks) | `.claude/settings.json` | 1 → 1 (hooks not yet configured when this call ran) |
| Write | `vault/_map.md` | 1 → 1 (vault path, ignored) |
| Write | `vault/03-framework/hook-lifecycle-map.md` | 1 → 1 (vault path, ignored) |
| Write | `evidence/task05-note.md` | 1 → 2 (logged by the PostToolUse hook) |

Line added by the hook:
```
- 2026-10-24T15:57:10Z · Ngan Nguyen @ Ngans-MBP.lan · week-2 · evidence/task05-note.md · last commit: Task 04: review drafts and add article detail and category filter tests
```
The next Edit of the note added the third line (15:57:27Z).

## Recording check in a new session

New Claude Code session started from the project root, branch `week-2`. Before anything was edited:

- **Hook sources.** Only `.claude/settings.json` defines hooks. `.claude/settings.local.json`, `~/.claude/settings.json` and `~/.claude/settings.local.json` define none. One PostToolUse command for `Edit|Write`.
- **SessionStart fired; the source is not recorded.** `vault/_changelog/sessions.log` (absent at the earlier baseline) now has 1 line: `- session START 2026-10-24T16:00:28Z`.
  - The line was written before this session's first command (16:00:46Z).
  - The hook has no matcher, so per the official hooks reference it fires for `startup`, `resume`, `clear`, `compact` and `fork`. The recorder ignores the input's `source` field, so the line proves a SessionStart event fired. It does not prove the session was a fresh `startup`.
- **Changelog baseline.** `vault/_changelog/2026-10-24.md`: 5 lines (header, blank line, 3 entries from earlier, at 15:56:13Z, 15:57:10Z and 15:57:27Z). Copied aside; SHA-1 `378d0ca…`.
- **Spec location.** `tests/blog/home.smoke.spec.ts` resolves to `<root>/tests/blog/`, outside `vault/`.

One tool call: **Claude's Edit tool** (no shell command, no manual vault-sync run) added this line after the imports:
```
// Task 05 recording check 2026-10-24T16:01:00Z (comment only)
```
The timestamp in the comment was written by hand as a unique marker. It is not the hook's time.

After the edit, `diff baseline current`:
```
5a6
> - 2026-10-24T16:00:59Z · Ngan Nguyen @ Ngans-MBP.lan · week-2 · tests/blog/home.smoke.spec.ts · last commit: Task 04: review drafts and add article detail and category filter tests
```
- **PostToolUse with the demonstration spec: verified.** Exactly 1 new entry, 5 → 6 lines. The first 5 lines still hash to `378d0ca…`, so the log was only appended to.
- The new entry shows path `tests/blog/home.smoke.spec.ts`, branch `week-2` and a UTC time of 16:00:59Z. The shell clock read 16:00:46Z just before the edit and 16:01:04Z just after.
- The line at 15:56:13Z for the same path came from the earlier manual sample, not from this Edit.
- **Behaviour unchanged.** `npm run typecheck` passed. `npm run test:list` still lists the same 2 tests in this file, 5 tests in total. The comment stays in place for now; nothing undid it.

This note and `vault/03-framework/hook-lifecycle-map.md` were updated after the comparison. Editing the map (inside vault/) adds no entry, and editing this note adds one `evidence/task05-note.md` entry. Those entries are not part of the check above.

## Recording check, second run (2026-10-25)

Same session, continued on the next local day (+07). Before anything was edited:

- **Hook sources.** Unchanged: only `.claude/settings.json` defines hooks.
- **Baseline.**
  - `vault/_changelog/2026-10-25.md` did not exist.
  - `2026-10-24.md` had 8 lines (6 entries) and `sessions.log` had 1 line. Both were copied aside.
- **Spec location.** `tests/blog/home.smoke.spec.ts` is still outside `vault/`.

One tool call: **Claude's Edit tool**. It changed the existing check comment's timestamp, so the spec still has a single comment line:
```
// Task 05 recording check 2026-10-25T07:32:00Z (comment only)
```

After the edit:
```
$ cat vault/_changelog/2026-10-25.md      (new file)
# 2026-10-25

- 2026-10-25T07:31:55Z · Ngan Nguyen @ Ngans-MBP.lan · week-2 · tests/blog/home.smoke.spec.ts · last commit: Task 04: review drafts and add article detail and category filter tests
```
- **One new entry: verified.**
  - The file name follows the local date (2026-10-25), and the entry time is in UTC.
  - The entry shows branch `week-2` and the spec's path. Its time of 07:31:55Z falls between the clock readings before (07:31:48Z) and after (07:32:01Z) the edit.
- **Older files unchanged.** `cmp` shows `2026-10-24.md` and `sessions.log` byte-identical to the baseline. sessions.log gained no line because this was the same session, so SessionStart did not run again.
- **Behaviour unchanged.** `npm run typecheck` passed. `npm run test:list` still lists the same 2 tests in this file, 5 tests in total.

This section and the hook map were written after the comparison. They are not part of it.

## Extension: commit ID in each entry (2026-10-25)

Each new entry now ends with ` · **commit:** <id>`, taken from `git rev-parse --short HEAD` through the existing `git()` helper. The ID is `unknown` if Git fails, both outside a repository and in a repository with no commits; both cases exit 128 with nothing on stdout. Entries stay one line each. Older entries are not rewritten. The script still only appends.

Changes:
- `scripts/vault-sync.mjs`: one added field in the `--from-hook` entry.
- `safety-tests/vault-log.test.mjs`:
  - `entryPattern()` now requires the commit field. By default it must equal `shortHead()`, which runs `git rev-parse --short HEAD` in the temporary repository, so every existing entry check also compares the real ID.
  - The append-only test now adds an old-format line (no commit field) and checks it stays unchanged.
  - The no-repository test expects `commit: unknown`.
  - New: with `core.abbrev 12` and a second commit, the entry ends with the 12-character ID. This proves the script assumes no fixed length.
  - New: in a repository with no commits, the entry has `last commit: unknown` and `**commit:** unknown`, and the branch is still recorded.

```
$ npm run test:safety
ℹ tests 56
ℹ suites 9
ℹ pass 56
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
```
56 = 43 Week 1 checks + 13 vault-sync checks (was 11). The vault-exclusion, outside-project, malformed-input and append-only checks all pass.

### Live check with the commit ID

- **Baseline.**
  - `vault/_changelog/2026-10-25.md` had 10 lines, SHA-1 `1a1d8c8…`.
  - Short HEAD was `869ed8d` on `week-2`.
  - Lines 5–10 came from the 6 Edits that made the change above: 1 to the script, 5 to the test file. They already carry `**commit:** 869ed8d`. Lines 3–4 are older entries without the field.
- **The tool call.** One **Claude Edit** of `tests/blog/home.smoke.spec.ts` changed only the comment timestamp:
  `// Task 05 recording check 2026-10-25T07:40:00Z (comment only)`.
  The recorder was not run by hand.
- `diff baseline current`:
  ```
  10a11
  > - 2026-10-25T07:39:58Z · Ngan Nguyen @ Ngans-MBP.lan · week-2 · tests/blog/home.smoke.spec.ts · last commit: Task 04: review drafts and add article detail and category filter tests · **commit:** 869ed8d
  ```
- **Results.**
  - **Entry count.** Exactly 1 new entry. The first 10 lines still hash to `1a1d8c8…`, and `2026-10-24.md` and `sessions.log` are byte-identical to the baseline.
  - **Commit field.** It records `869ed8d`. That equals the measured HEAD ID before the edit and `git rev-parse --short HEAD` after it.
  - **Time.** 07:39:58Z, between the clock readings of 07:39:53Z before and 07:40:06Z after.

### Browser suite on dev

`npm test` (APP_ENV=dev, `playwright.config.ts` unchanged, nothing skipped):
```
Running 5 tests using 4 workers
  ✓ home.smoke › banner is visible and identifies DEVELOPMENT
  ✓ article-detail.smoke › visitor who opens the first article sees the same title on its article page
  ✓ category-filter.smoke › visitor who filters by Playwright sees only Playwright articles
  ✓ home.smoke › first article card is visible and at least one card exists
  ✓ categories.smoke › signed-in author sees the category list with at least one item
  5 passed (4.1s)
```
This matches the Task 04 baseline of 5 passed. The config sets no `workers`, so the count of 4 is Playwright's default for this machine. Rule D3 says "2 workers"; that number does not match this run and was not changed.

This section was written after the comparison and is not part of it.

## Not verified yet

- **Hook working folder.** Fixed after commit `bdee6ca` (see "Working-folder fix" below), but only checked from the project root. A session started from a subfolder (`cd tests/blog && claude`) has not been tried, so two things are still unknown:
  - whether that session loads the project settings;
  - whether it logs one entry to the project's `vault/_changelog/` with the path `tests/blog/…`.
- **Which hook command is loaded.** From the project root, the old and new commands give the same entry, and the transcript does not record which string ran. Confirm with `/hooks`.
- **`CLAUDE_PROJECT_DIR` inside a hook.** The official hooks reference describes it, but its value has never been seen inside one of our hooks.
- **New SessionStart command.** It has not run yet; no session has started since the change.
- **Rule conflict, unresolved.** `.claude/rules/01-guardrails.md` G6 says isolated checks live in `safety/`; the new checks are in `safety-tests/` as specified. G6 was not edited.

## Comment removed (2026-10-25)

- **Baseline.** `2026-10-25.md` had 13 lines; HEAD was `869ed8d`.
- **The tool call.** One **Claude Edit** removed the check comment from `tests/blog/home.smoke.spec.ts`.
- `diff baseline current`:
  ```
  13a14
  > - 2026-10-25T07:47:13Z · Ngan Nguyen @ Ngans-MBP.lan · week-2 · tests/blog/home.smoke.spec.ts · last commit: Task 04: review drafts and add article detail and category filter tests · **commit:** 869ed8d
  ```
- **Results.**
  - Exactly 1 new entry. `2026-10-24.md` and `sessions.log` are byte-identical to the baseline.
  - `git diff -- tests/blog/home.smoke.spec.ts` is empty, so the spec matches HEAD.

## Steps from the earlier plan, and where they stand

The plan written before the new session listed these steps:
1. **New session, SessionStart line.** Done (see "Recording check in a new session").
2. **Comment Edit on the spec, then removal.** Done, but as several Edits rather than two:
   - one added the comment (2026-10-24);
   - two changed its timestamp (2026-10-25);
   - one removed it (above).

   Each of these Edits added exactly one entry.
3. **An Edit inside `vault/` adds no line.** Seen each time the hook map was edited after a comparison: only the `evidence/task05-note.md` Edits added entries.
4. **`npm test` and `npm run test:safety`.** 5 passed and 56 passed. The safety count is now 56 (not 54) after the commit-ID extension.

## Working-folder fix (2026-10-25, after commit `bdee6ca`)

Claude Code 2.1.287, checked against the official hooks reference (code.claude.com/docs/en/hooks), which was read through a web-fetch summary.

**Cause.**
- The docs say shell-form hooks run in Claude Code's current folder. The earlier commands used the relative path `scripts/vault-sync.mjs`, so they worked only when that folder was the project root.
- The command string alone, run from `tests/blog/` with empty input:
  - Old command: `Error: Cannot find module '…/qa-framework/tests/blog/scripts/vault-sync.mjs'`, exit 1. Claude Code would report this as a non-blocking hook error and leave the edit unlogged.
  - New command: exit 0.
- These were tests of the command string only, not hook runs. The logs were byte-identical before and after.
- The problem was in the hook connection. The recorder already reads `CLAUDE_PROJECT_DIR`.

**Change.** In `.claude/settings.json`, only the two `command` strings changed, from `node scripts/vault-sync.mjs …` to the docs' quoted shell form:
```
PostToolUse  | Edit|Write | node "${CLAUDE_PROJECT_DIR}"/scripts/vault-sync.mjs --from-hook
SessionStart | (none)     | node "${CLAUDE_PROJECT_DIR}"/scripts/vault-sync.mjs --session-start
```
- `permissions` are unchanged, the file parses correctly, and no other hooks exist.
- Exec form (`"command": "node"` plus `args`), which the docs prefer, was not used: the docs give no minimum version for it, and it is untested on 2.1.287.
- The 2 Edits that made the change each added one `.claude/settings.json` entry (08:02:23Z).
- The transcript's only other hook record, `PostToolUse:Bash` at 07:49:39Z, is Claude Code's built-in "/ultrareview" tip after the commit. It is not a project hook.

**Check 1, settings reloaded: partly verified.**
- The docs say edits to hook settings are picked up automatically.
- Hooks kept recording after the change (below). From the project root, though, the old and new commands produce the same entry, so this does not prove which one ran.
- `/hooks` has not been checked.

**Check 2, live recording from the project root: verified.**
- **Baseline.** `2026-10-25.md` had 19 lines; HEAD was `bdee6ca` on `week-2`.
- **Edit 1** (one Claude Edit) added `// Task 05 recording check 2026-10-25T08:03:00Z (comment only)`:
  ```
  19a20
  > - 2026-10-25T08:02:56Z · Ngan Nguyen @ Ngans-MBP.lan · week-2 · tests/blog/home.smoke.spec.ts · last commit: Task 05: add verified automatic change recording · **commit:** bdee6ca
  ```
- **Edit 2** (one Claude Edit) removed the comment:
  ```
  20a21
  > - 2026-10-25T08:03:06Z · Ngan Nguyen @ Ngans-MBP.lan · week-2 · tests/blog/home.smoke.spec.ts · last commit: Task 05: add verified automatic change recording · **commit:** bdee6ca
  ```
- **Results.**
  - **Entry count.** Each Edit added exactly 1 entry.
  - **Older content.** Earlier lines are unchanged byte for byte, and `2026-10-24.md` and `sessions.log` match the baseline.
  - **Spec.** It matches HEAD again.
  - **Commit field.** It records `bdee6ca`, equal to the measured HEAD ID. Earlier entries recorded `869ed8d`, so the field now visibly follows HEAD.
- The recorder was not run by hand.

**Check 4, isolated checks: verified.** `npm run test:safety`: tests 56, pass 56, fail 0, cancelled 0, skipped 0.

**Check 3, a session started from a subfolder: not run.** It needs a new session started by a person; see "Not verified yet".

# Task 07: startup summary and daily-note reminder

Branch `week-2`, starting from `1175701` (Task 06), working tree clean apart from the untracked `.playwright-mcp/` snapshots. Claude Code 2.1.287, Node v24.21.0.

## Files

- `scripts/hooks/session-preflight.mjs`: a five-line startup summary for SessionStart. Node built-ins only. It always exits 0 with empty stderr.
- `scripts/hooks/stop-worklog.mjs`: a daily-note reminder for Stop, plus a `--path` mode that prints today's journal path. Node built-ins only.
- `.claude/commands/worklog.md`: the `/worklog` command that appends a `## HH:MM` entry to today's journal.
- `safety-tests/worklog.test.mjs`: 21 isolated `node:test` checks. Each runs in a temporary Git repository with a local test author (`Test Student`), an empty global Git config, `TZ=Pacific/Kiritimati` and `spawnSync` input.
- `.claude/settings.json`: a second SessionStart command and a new Stop hook (see "Settings").
- `vault/03-framework/hook-lifecycle-map.md`: rows and notes for the two new hooks.

`package.json` is unchanged; `test:safety` already runs `safety-tests/**/*.test.mjs`. `vault/_map.md` is unchanged: adding `12-progress-report/` to it was proposed but not approved.

## Startup summary (`session-preflight.mjs`)

**Output.** Exactly five lines:

| Line | Source | Fallback |
|---|---|---|
| `Date:` | the local `YYYY-MM-DD` | — |
| `Branch:` | `git branch --show-current` | `no-branch` (detached HEAD or Git failure) |
| `Uncommitted files:` | non-empty lines of `git status --porcelain --untracked-files=all` | `unknown` if Git fails |
| `Latest journal:` | the newest `YYYY-MM-DD.md` anywhere under `vault/12-progress-report/` | `none yet` |
| `Map: vault/_map.md` | fixed | — |

**How it counts and searches**
- **Git:** runs through `execFileSync('git', [...])`, one argument per array item, with no shell.
- **Uncommitted files:** `--untracked-files=all` lists each file inside a new folder on its own line. Porcelain v1 quotes unusual names on one line. A rename counts as one entry.
- **Latest journal:** "newest" means the latest date in the filename. A tie between folders is settled by path. Symbolic links are not followed.
- **Independence:** the script reads no other hook's output, so it does not depend on handler order.

## Daily-note reminder (`stop-worklog.mjs`)

**The journal path:** `vault/12-progress-report/<slug>/<local date>.md`. The slug comes from `git config user.name`: trimmed, lowercased, each run of characters outside `a-z0-9` replaced by `-`, edge hyphens trimmed. If nothing is left, it is `student`. `--path` prints that path and never reads stdin.

**Decisions, in order:**
1. Strip leading byte-order marks and parse the JSON. Malformed or unreadable input, or a non-object, exits 0.
2. `stop_hook_active: true` exits 0. This is the retry after a reminder.
3. No qualifying uncommitted file and no commit today exits 0.
   - Qualifying extensions are `.ts`, `.mjs`, `.json`, `.md` and `.sh`.
   - "Today" compares `git log -1 --format=%ct` with the current time, both as **local** calendar dates.
4. Today's journal has a line matching `^## ([01]\d|2[0-3]):[0-5]\d`: exit 0.
5. Otherwise print one line on stderr and exit 2.

Unexpected errors are caught and exit 0, through `process.exitCode`.

**Refusal text:**
```
worklog: BLOCKED — today's work has no journal entry yet. Run /worklog to append a "## HH:MM" entry to vault/12-progress-report/ngan-nguyen/2026-10-25.md (Did, Worked / didn't, Next), then finish.
```

## Script results (direct runs, not live hooks)

**On the real project (read-only), 2026-10-25:**
```
$ node scripts/hooks/session-preflight.mjs
Date: 2026-10-25
Branch: week-2
Uncommitted files: 17
Latest journal: none yet
Map: vault/_map.md
exit 0

$ node scripts/hooks/stop-worklog.mjs --path
vault/12-progress-report/ngan-nguyen/2026-10-25.md
exit 0
```
- **The count of 17 is correct:** the 12 `.playwright-mcp/` files, the modified changelog, and the 4 new Task 07 files.
- **`none yet` is correct:** `vault/12-progress-report/` does not exist yet.

| Case | Where | Exit | Output |
|---|---|---|---|
| Clean empty repository (no commits, no files) | temporary repo | 0 | silent |
| Activity (untracked `notes.md`) without today's heading | temporary repo | 2 | `worklog: BLOCKED — … vault/12-progress-report/demo-student/2026-10-25.md …` |
| Activity today, no journal | real project | 2 | the refusal text above |
| Valid `## 14:05` heading in today's journal | temporary repo | 0 | silent |
| Retry, `stop_hook_active: true` | real project | 0 | silent |
| Malformed input `{bad` | real project | 0 | silent |

**Command strings.** Both hook command strings were run through `sh -c` from the project root and from `tests/blog/`. The preflight printed the same five lines from both folders and exited 0, and the Stop retry input exited 0 from both.

## Isolated checks (actual output, timings removed)

```
$ npm run test:safety
▶ session-preflight
  ✔ prints exactly five lines, counting nested untracked files one by one
  ✔ finds the newest YYYY-MM-DD.md anywhere under vault/12-progress-report
  ✔ falls back to no-branch on a detached HEAD
  ✔ falls back to no-branch and unknown outside a Git repository, still exiting 0
▶ stop-worklog --path and slug
  ✔ --path prints today's journal path without reading stdin
  ✔ builds the slug from the trimmed, lowercased Git user.name, falling back to student
  ✔ names the journal by local date, not UTC date
▶ stop-worklog decisions
  ✔ clean empty repository (no commits, no files) → 0
  ✔ activity without today's heading → 2, naming the exact path and /worklog
  ✔ a valid "## HH:MM" heading in today's journal → 0
  ✔ a journal without a "## HH:MM" line still → 2
  ✔ retry with stop_hook_active true → 0, even with activity
  ✔ malformed or unreadable input → 0, even with activity
  ✔ removes all leading byte-order marks before parsing
  ✔ a nested untracked qualifying file in a new folder counts as activity → 2
  ✔ only non-qualifying changes and no commit today → 0
  ✔ each qualifying extension counts as activity: .ts .mjs .json .md .sh
  ✔ a clean tree with a commit today → 2
  ✔ a clean tree whose last commit is two local days old → 0
  ✔ compares commit dates by local calendar day: just after local midnight counts as today
  ✔ outside a Git repository → 0
ℹ tests 111
ℹ suites 16
ℹ pass 111
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
```
- **111 = 90 earlier + 21 new.** The earlier 90 are in the same run and all passed: 43 Week 1, 13 recorder and 34 guard.
- **Slug cases tested:** `"  Ngan NGUYEN  "` → `ngan-nguyen`, `"O'Brien, Jr."` → `o-brien-jr`, `"---"` → `student`, unset → `student`.
- **Local-date test:** a commit one minute after local midnight in UTC+14, which is the previous day in UTC, counts as today.
- **Not covered by a test:** the unexpected-error branches, which cannot be triggered without a test-only backdoor. They are covered by reading the code only.

## Official documentation (hooks reference, raw page)

- **SessionStart stdout:** on exit 0, plain-text stdout is "added to Claude's context", capped at 10,000 characters per hook. Matching hooks run in parallel.
- **Stop exit 2:** "Prevents Claude from stopping, continues the conversation", and stderr is shown to Claude as a hook-error notice.
- **`stop_hook_active`:** it is `true` "when Claude Code is already continuing as a result of a stop hook".
- **Continuation cap:** Claude Code also caps stop-hook continuations at 8 in a row.
- **Not stated in the reference:** whether a `/worklog` command can be run by Claude itself when the reminder appears, or only by a person. To be seen in the live check.

## Settings

Only these additions. `permissions`, the PreToolUse guard, the PostToolUse recorder and the existing SessionStart recorder are identical to HEAD:
```diff
     "SessionStart": [
       {
         "hooks": [
-          { "type": "command", "command": "node \"${CLAUDE_PROJECT_DIR}\"/scripts/vault-sync.mjs --session-start" }
+          { "type": "command", "command": "node \"${CLAUDE_PROJECT_DIR}\"/scripts/vault-sync.mjs --session-start" },
+          { "type": "command", "command": "node \"${CLAUDE_PROJECT_DIR}\"/scripts/hooks/session-preflight.mjs" }
         ]
       }
-    ]
+    ],
+    "Stop": [
+      {
+        "hooks": [
+          { "type": "command", "command": "node \"${CLAUDE_PROJECT_DIR}\"/scripts/hooks/stop-worklog.mjs" }
+        ]
+      }
+    ]
```
Both were connected only after the isolated checks above passed.

## Limitations

- **Activity is broad.** The Task 05 recorder modifies `vault/_changelog/<date>.md` after every Edit or Write, and that is a qualifying `.md` change. So in practice any Claude edit counts as activity.
- **The reminder runs at every turn end.** Stop fires whenever Claude finishes responding, not once per session. Until today's journal has an entry, every turn with activity gets the reminder once; the retry is allowed.
- **The slug is personal data.** `ngan-nguyen`, from the Git user name, becomes part of a committed path. Non-ASCII letters become hyphens.
- **"Today" comes from the last commit only.** `git log -1`: a commit made today followed by a backdated commit would not count.
- **The summary repeats.** SessionStart also fires on `resume`, `clear`, `compact` and `fork`.
- **Timing edge in one test.** The local-date test cannot run in the first minute after midnight in UTC+14; it fails with an explicit message then.
- **Not covered by `npm run typecheck`.** `tsconfig.json` includes only `env`, `tests`, `pages`, `safety` and the config file, so the `.mjs` scripts rely on their `node:test` checks.

## Live sequence (2026-10-25, same session, project root)

The settings change was the last edit of its turn, after the final changelog entry at 09:50:12Z. Exact reminder times were not captured; only the order below was observed.

1. **First turn end after connecting: reminder.** Claude Code held the turn open with:
   ```
   Stop hook feedback:
   [node "${CLAUDE_PROJECT_DIR}"/scripts/hooks/stop-worklog.mjs]: worklog: BLOCKED — today's work has no journal entry yet. Run /worklog to append a "## HH:MM" entry to vault/12-progress-report/ngan-nguyen/2026-10-25.md (Did, Worked / didn't, Next), then finish.
   ```
   The bracketed command is the configured Stop command. Claude replied without writing the journal.
2. **The retry ended the turn.** No second reminder appeared, and the next user turn started normally. This fits `stop_hook_active: true` → exit 0. The retry input itself was not captured.
3. **Next turn end: reminder again.** The same reminder text appeared once more. It comes once per turn end while the work exists and today's journal has no entry. That turn's retry also ended normally.
4. **Check (10:43Z), direct runs on the real project, not hooks:**
   - `node scripts/hooks/stop-worklog.mjs --path` printed `vault/12-progress-report/ngan-nguyen/2026-10-25.md`, exit 0.
   - `{"stop_hook_active":false}` on stdin printed the same reminder, **exit 2**.
   - `vault/12-progress-report/` does not exist: **no journal entry existed**, so there was no entry to compare with the day's work. `/worklog` has not been run.

**No entry was created or deleted to produce a result.** The missing-entry refusal above is real: no journal existed at any point. The isolated proofs still stand:
- `activity without today's heading → 2`;
- `a valid "## HH:MM" heading in today's journal → 0`;
- the temporary-repository runs in "Script results".

**Startup summary: not received.** The preflight was connected partway through this session, and no SessionStart has run since (`sessions.log` still has only its 2026-10-24 line). When asked, Claude reported that no five-line summary had been supplied. The direct-run lines in "Script results" were not substituted for it.

## SessionEnd extension (`vault-sync.mjs --session-end`)

**Change**
- **New mode:** `scripts/vault-sync.mjs` gains `--session-end`, which appends `- session END <UTC>Z · commit: <short HEAD> · uncommitted: <count>` to `vault/_changelog/sessions.log`.
- **New helper:** `gitCount()` returns `unknown` only when Git fails, so a clean tree reads `0`.
- **The count** is the number of non-empty lines from `git status --porcelain --untracked-files=all`, taken before the append.
- **Unchanged:** `--from-hook` and `--session-start`. The usage text lists the new mode.

**Isolated checks.** `npm run test:safety`: tests 118, suites 17, pass 118, fail 0, cancelled 0, skipped 0. That is 111 earlier plus 7 new:
```
▶ vault-sync --session-end
  ✔ logs END with a UTC time, the short HEAD ID and the uncommitted count, nested untracked files included
  ✔ reports 0, not unknown, for a clean tree
  ✔ uses "unknown" for the commit in a repository with no commits, still counting files
  ✔ uses "unknown" for both outside a Git repository and exits 0
  ✔ appends after existing START and END lines without changing them, never counting the ignored sessions.log
  ✔ accepts SessionEnd JSON on stdin without needing it
  ✔ exits 0 and reports a write failure briefly
```
The temporary projects commit a `.gitignore` containing `*.log`, as the real project does.

**Timing.** The reference gives SessionEnd hooks a 1.5 s default budget.
- **Measured:** three runs against a scratch clone of the project took 0.07 s each, and the clone's log read `uncommitted: 12` for its 12 copied `.playwright-mcp/` files.
- **Margin:** the hook still sets `"timeout": 5`.
- **Real log untouched:** this was not a run on the real project, and the real `sessions.log` was unchanged.

**Settings.** One addition. Permissions and every other hook are identical:
```diff
+    "SessionEnd": [
+      {
+        "hooks": [
+          { "type": "command", "command": "node \"${CLAUDE_PROJECT_DIR}\"/scripts/vault-sync.mjs --session-end", "timeout": 5 }
+        ]
+      }
+    ]
```

**Git.** `git check-ignore -v vault/_changelog/sessions.log` gives `.gitignore:22:*.log`, and the file is not tracked.

## Review (2026-10-25, 11:00Z)

**Real START/END proof: none yet.** The full, relevant excerpt of `vault/_changelog/sessions.log` (nothing to redact):
```
- session START 2026-10-24T16:00:28Z
```
- **One line only:** it was written by the Task 05 recorder with its earlier relative-path command.
- **No START line from the current command, and no END line:** no session has started, been cleared or ended since those hooks were connected.
- **Not substituted:** a manual run of the recorder on the real project was not used as proof.

**Journal: none.** `vault/12-progress-report/` does not exist, and `/worklog` has not been run.

**Checks**
- **`npm run test:safety`:** 118 / 118 passed.
- **`npm run typecheck`** (`tsc --noEmit`): exit 0. It does not cover the `.mjs` hook scripts.

**Configured hooks**
```
PreToolUse   | Edit|Write | node "${CLAUDE_PROJECT_DIR}"/scripts/hooks/guard.mjs
PostToolUse  | Edit|Write | node "${CLAUDE_PROJECT_DIR}"/scripts/vault-sync.mjs --from-hook
SessionStart | (none)     | node "${CLAUDE_PROJECT_DIR}"/scripts/vault-sync.mjs --session-start
SessionStart | (none)     | node "${CLAUDE_PROJECT_DIR}"/scripts/hooks/session-preflight.mjs
Stop         | (none)     | node "${CLAUDE_PROJECT_DIR}"/scripts/hooks/stop-worklog.mjs
SessionEnd   | (none)     | node "${CLAUDE_PROJECT_DIR}"/scripts/vault-sync.mjs --session-end   (timeout 5)
```
Permissions, PreToolUse and PostToolUse are identical to HEAD.

**`vault/_map.md` is out of date:** it still describes `sessions.log` as "one line per session start". Changing it was proposed but not approved.

## Status

| Hook | Configured | Script verified | Live hook |
|---|---|---|---|
| SessionStart `session-preflight.mjs` | Yes | Yes: 4 checks, plus direct runs on the real project | Not verified: no SessionStart has run since it was connected, and no summary reached Claude |
| Stop `stop-worklog.mjs` | Yes | Yes: 17 checks, plus direct runs | **Verified for the reminder and the retry.** It refused at two turn ends with the exact path and `/worklog`, and each retry ended the turn. The "entry exists → 0" case has not been seen live, because no journal exists yet |
| `/worklog` command | Yes (file exists) | Not applicable: instructions for Claude, not a script | Not verified: not run yet |
| SessionEnd `vault-sync.mjs --session-end` | Yes (`timeout: 5`) | Yes: 7 checks; 0.07 s per run | **Pending:** no END line in `sessions.log` yet |

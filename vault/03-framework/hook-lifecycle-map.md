---
id: hook-lifecycle-map
type: guide
---

# Hook lifecycle map

Which Claude Code hooks this project uses, what they run, and how far each one is proven.

- **Configured**: the connection exists in .claude/settings.json.
- **Script verified**: the script's isolated checks passed (`npm run test:safety`), with no live hook involved.
- **Live hook**: seen working through Claude Code itself, with the evidence named (see evidence/task05-note.md and evidence/task06-note.md).

The three are tracked separately: a configured hook whose script passes its checks is still not a verified live hook.

## Timeline

- 2026-10-24, Task 05: added scripts/vault-sync.mjs and its isolated checks (safety-tests/vault-log.test.mjs).
- 2026-10-24, Task 05: added the PostToolUse and SessionStart hooks to .claude/settings.json. No hooks existed before.
- 2026-10-24, Task 05: both hooks verified live in a new session. Only the project settings define hooks (`.claude/settings.local.json`, `~/.claude/settings.json` and `~/.claude/settings.local.json` have none), so one Edit gives one line.
- 2026-10-25, Task 05: second PostToolUse check. One Edit of the demonstration spec created `vault/_changelog/2026-10-25.md` with one line (07:31:55Z). The day change started a new local-date file and left the 2026-10-24 file unchanged.
- 2026-10-25, Task 05: each new entry now ends with ` · **commit:** <id>`, taken from `git rev-parse --short HEAD`, or `unknown` when Git has no commit. Older entries were not rewritten. `npm run test:safety`: 56 passed. One Edit of the demonstration spec then added one entry ending `**commit:** 869ed8d`, matching the measured HEAD ID (07:39:58Z).
- 2026-10-25, Task 05: one Edit removed the check comment from the demonstration spec and added one entry (07:47:13Z). The spec matches HEAD again.
- 2026-10-25, after commit `bdee6ca`: both commands now start the script through `"${CLAUDE_PROJECT_DIR}"` instead of the relative path `scripts/`. From the project root, an Edit adding a comment and an Edit removing it each added one entry ending `**commit:** bdee6ca`, matching the measured HEAD ID (08:02:56Z, 08:03:06Z). `npm run test:safety`: 56 passed.
- 2026-10-25, Task 06: added scripts/hooks/guard.mjs and its isolated checks (safety-tests/guard.test.mjs). `npm run test:safety`: 82 passed (56 earlier + 26 guard checks). The guard was then connected as a PreToolUse hook.
- 2026-10-25, Task 06: the first live refusal. One Claude Edit proposing `// Task 06 guard check: test.only(` in the demonstration spec was refused by the PreToolUse guard. The spec stayed byte-identical, and the recorder added no entry, so a refused call does not reach PostToolUse.
- 2026-10-25, Task 06: added check 7, which blocks `waitForTimeout(` newly added to a `*.spec.ts` by Edit or Write. `npm run test:safety`: 90 passed (82 earlier + 8 hard-wait checks). Check 7 is script-verified only; it has not run live.
- 2026-10-25, after commit `c2ca38c`: the guard command now starts the script through `"${CLAUDE_PROJECT_DIR}"`. The repeated live `.only` refusal (09:00Z) showed the new command in the tool error, so the settings were reloaded without a restart.
- 2026-10-25, Task 07: added scripts/hooks/session-preflight.mjs, scripts/hooks/stop-worklog.mjs, the `/worklog` command (.claude/commands/worklog.md) and safety-tests/worklog.test.mjs. `npm run test:safety`: 111 passed (90 earlier + 21 new). The preflight was then connected as a second SessionStart command, and stop-worklog as a Stop hook. Neither has run live yet.
- 2026-10-25, Task 07: the Stop reminder was seen live at several turn ends, and each retry ended the turn.
- 2026-10-25, Task 07: added `--session-end` to scripts/vault-sync.mjs. `npm run test:safety`: 118 passed (111 earlier + 7 new). It was then connected as a SessionEnd hook with `timeout: 5`. No END line yet.

## Hook settings

| Event | Matcher | Command | Configured | Script verified | Live hook |
|---|---|---|---|---|---|
| PreToolUse | `Edit\|Write` | `node "${CLAUDE_PROJECT_DIR}"/scripts/hooks/guard.mjs` | Yes (Task 06; the command was corrected from `node scripts/hooks/guard.mjs` after commit `c2ca38c`) | Yes: 34 guard checks pass, covering all seven checks. The corrected command string gave 2 / 2 / 0 for the quick sample from both the project root and `tests/blog/` | **Verified for check 3 (`.only`), from the project root.** A Claude Edit adding a comment with `.only` to `tests/blog/home.smoke.spec.ts` was refused twice: at 08:32Z with the relative command and at 09:00Z with the corrected one. The tool error named the corrected command, and both times the file was unchanged and no log entry was added. Not seen in a session started from a subfolder. Checks 1, 2 and 4–7 have not been tried live |
| PostToolUse | `Edit\|Write` | `node "${CLAUDE_PROJECT_DIR}"/scripts/vault-sync.mjs --from-hook` | Yes (Task 05) | Yes: 12 vault-sync `--from-hook` checks (the 13th covers `--session-start`) | Verified from the project root. Each Claude Edit of `tests/blog/home.smoke.spec.ts` added exactly one line (first 2026-10-24T16:00:59Z; latest 2026-10-25T08:03:06Z), and vault paths add none. Not yet seen from a session started in a subfolder |
| SessionStart | omitted, so it fires for `startup`, `resume`, `clear`, `compact` and `fork` | `node "${CLAUDE_PROJECT_DIR}"/scripts/vault-sync.mjs --session-start` | Yes (Task 05) | Yes: 1 vault-sync check | Fired once, with the earlier relative-path command: `- session START 2026-10-24T16:00:28Z`. The line does not record which source fired it. The current command has not run yet |
| SessionStart (same group, runs in parallel with the recorder) | omitted | `node "${CLAUDE_PROJECT_DIR}"/scripts/hooks/session-preflight.mjs` | Yes (Task 07) | Yes: 4 preflight checks. A direct run on the project printed the five lines | **Not verified.** No session has started since it was connected |
| Stop | none (Stop has no matcher) | `node "${CLAUDE_PROJECT_DIR}"/scripts/hooks/stop-worklog.mjs` | Yes (Task 07) | Yes: 17 stop-worklog checks. A direct run on the project gave 2 with the reminder; retry and malformed input gave 0 | **Verified for the reminder and the retry** (2026-10-25, from the project root). It held two turn ends open with the exact journal path and `/worklog`, and each retry ended the turn. "Entry exists → 0" has not been seen live: no journal exists yet |
| SessionEnd | omitted, so it fires for every reason: `clear`, `resume`, `logout`, `prompt_input_exit` and `other` | `node "${CLAUDE_PROJECT_DIR}"/scripts/vault-sync.mjs --session-end`, `timeout: 5` | Yes (Task 07) | Yes: 7 `--session-end` checks. 0.07 s per run against a scratch clone, against a 1.5 s default budget | **Pending.** No session has ended since it was connected: `sessions.log` has no END line |

## PreToolUse guard

Before an Edit or Write runs, Claude Code pipes the proposed call to `scripts/hooks/guard.mjs` on stdin. The guard examines only that JSON: it never opens the file and never applies the edit. It has seven checks. The first match blocks, so there is one reason per refusal.

| # | Check | Applies to | Blocks when |
|---|---|---|---|
| 1 | Protected filename | Edit, Write, any file | The basename, after `\` → `/`, is `.env`, matches `.env.*` (except `.env.example`), `*.pem`, `*.key` or `*.p12`, or is `id_rsa` or `id_ed25519`. Case-sensitive |
| 2 | Secret-looking new text | Edit `new_string`, Write `content`, any file | The text contains one of four detector strings: the Slack bot-token prefix, the Atlassian API-token prefix, the AWS access-key-ID prefix, or the PEM private-key header. `.env.example` is still checked |
| 3 | `.only` added | Edit, Write, `*.spec.ts` | `.only` is in the new text but not the old text |
| 4 | `.skip` added | Edit, Write, `*.spec.ts` | `.skip` is in the new text but not the old text |
| 7 | Hard wait added | Edit, Write, `*.spec.ts` | `waitForTimeout(` is in the new text but not the old text. The reason points to waiting on the actual condition instead (P6) |
| 5 | Fewer `expect(` | Edit only, `*.spec.ts` | `new_string` has fewer than `old_string` |
| 6 | Fewer `runIfEnv(` or `envGuard(` | Edit only, `*.spec.ts` | Either helper has fewer calls, each counted separately |

- **Order:** the rows are listed in the order the checks run. Check 7 runs after check 4 and before checks 5–6, so an Edit that both adds a hard wait and deletes an assertion gets the hard-wait reason. It keeps the number 7 because it was added after the original six.
- **Write:** the old text is treated as empty, so checks 3, 4 and 7 examine the whole new content. Checks 5 and 6 need an old-text baseline and are skipped for Write.
- **Known limits:**
  - a marker already in the old text is not reported again;
  - checks 3–7 cover only `*.spec.ts`;
  - matching is plain substrings: a space in `waitForTimeout (500)` is not matched, while `.only` in a comment is.

Exit 2 with one `guard: BLOCKED — …` line refuses the call. Per the official hooks reference, that stderr line becomes the reason given to Claude. Anything else exits 0 silently. Details and messages: evidence/task06-note.md.

**The guard fails open.** Malformed input, an unexpected error, a tool outside `Edit|Write` (Bash, NotebookEdit), or a hook that does not run at all lets the edit through. Its command was first the relative path `scripts/hooks/guard.mjs`, which failed from a subfolder with `MODULE_NOT_FOUND` and exit 1. PreToolUse treats exit 1 as non-blocking, so the edit would have gone ahead unguarded. The command now starts the script through `"${CLAUDE_PROJECT_DIR}"`, like the recorder commands below, and that string gives the same results from `tests/blog/` as from the root. A missing `node` or a missing script would still fail open. The reference documents `onFailure: "block"` to make failures block instead; it is not used here.

The guard and the recorder both match `Edit|Write`. A blocked call never runs, so the recorder logs nothing for it. The reference does not state that outright, but it was observed in the first live refusal: all three log files were byte-identical before and after.

Shell-form hooks run in Claude Code's current folder, which is not always the project root. Both recorder commands therefore start the script through `"${CLAUDE_PROJECT_DIR}"`, which the official hooks reference describes as always set to "the project root where the session started", with the placeholder quoted as the docs advise for shell form. The script itself also finds the project root from `CLAUDE_PROJECT_DIR`, falling back to the working folder.

With the earlier relative path `node scripts/vault-sync.mjs`, a hook run from another folder fails. Running that command string from `tests/blog/` gave `Cannot find module …/tests/blog/scripts/vault-sync.mjs` and exit 1, which Claude Code reports as a non-blocking hook error; the edit itself still happens but goes unlogged. The new string, run from the same folder with empty input, exited 0. Both were tests of the command string only, not hook runs, and neither wrote to the log.

Not yet verified: a session started from a subfolder, both whether it loads these project settings and whether it logs to the project's `vault/_changelog/`. The value of `CLAUDE_PROJECT_DIR` has never been seen inside one of our hooks. The docs prefer exec form (`"command": "node"` plus `args`) for path placeholders; it is not used because the docs give no minimum version for it and it has not been tested on Claude Code 2.1.287.

## What the hook receives on stdin

When a hook fires, Claude Code runs the command and pipes a short JSON description of the event into it, the same way you pipe text into a program on the command line. For an Edit or Write, that JSON includes `tool_input.file_path`: the file that was just edited. The script reads it, turns it into a path relative to the project (with forward slashes), and appends one line to `vault/_changelog/<local date>.md`. Input it cannot use (no path, broken JSON, a file outside the project) is ignored. Either way the script exits 0, so logging never blocks the session.

## Loop protections

1. **Only Claude's Edit and Write tools trigger it.** The `Edit|Write` matcher fires only when Claude uses those tools. The script writes its log with Node's file functions, which is not a Claude tool call, so its own write cannot start another PostToolUse.
2. **It ignores `vault/`.** Any path that is `vault` or inside `vault/` is dropped before anything is written. So even if Claude edits a changelog file directly, or a file watcher sees the script's own write, nothing is logged.

## FileChanged watcher

Not enabled for this exercise. No watcher existed before Task 05, so nothing was removed. The script already accepts a top-level `file_path` (the FileChanged input shape), so a watcher could be added later without changing it; loop protection 2 would stop it logging the script's own writes.

## Startup summary and daily-note reminder (Task 07)

**SessionStart preflight.** It prints five lines that Claude Code adds to Claude's context:
- the local date;
- the branch, or `no-branch`;
- the uncommitted file count, from `git status --porcelain --untracked-files=all`, or `unknown`;
- the newest `YYYY-MM-DD.md` under `vault/12-progress-report/`, or `none yet`;
- `Map: vault/_map.md`.

It always exits 0. It runs in parallel with the recorder and does not depend on it.

**Stop reminder.** When Claude finishes a turn, `stop-worklog.mjs` reads the Stop JSON.
- **When it reminds:** there is work today and `vault/12-progress-report/<slug>/<local date>.md` has no `## HH:MM` entry. It then exits 2 with `worklog: BLOCKED — …`, naming that path and `/worklog`. Per the official reference, exit 2 keeps the turn going and shows the reason to Claude.
- **What counts as work today:** a `.ts`, `.mjs`, `.json`, `.md` or `.sh` file uncommitted, or a commit with today's local date.
- **The retry:** `stop_hook_active: true` exits 0, so the reminder appears at most once per turn end. The reference also caps stop-hook continuations at 8 in a row.
- **Everything else exits 0:** malformed input, no work, an existing entry, and unexpected errors.

**`/worklog`** (.claude/commands/worklog.md) gets the path from `stop-worklog.mjs --path`, takes the time from `date +%H:%M`, and appends a `## HH:MM` entry with Did, Worked / didn't and Next bullets. It never includes secrets.

**How they fit with the earlier hooks**
- **Recorder:** journal writes are inside `vault/`, so they add no changelog line.
- **Guard:** it allows `.md` files apart from its filename and secret checks.
- **Activity:** because the recorder's changelog is a qualifying `.md` change, almost any Claude edit counts as work today.

## Session end (Task 07)

The earlier "future proposal" for SessionEnd is now configured, as a `sessions.log` line rather than a journal line. When a session ends, `vault-sync.mjs --session-end` appends:
```
- session END <UTC>Z · commit: <short HEAD> · uncommitted: <count>
```
- **The count** uses `git status --porcelain --untracked-files=all`, so files inside new folders count one by one. It is `unknown` only if Git fails.
- **The commit** is `unknown` when there is no commit.
- **The log stays out of Git:** `sessions.log` is ignored (`.gitignore:22:*.log`) and is never counted.
- **Ending a session in the CLI:** use `/clear` (it ends this session and starts a new one, so START and preflight run too) or `/exit`.
- **Ending a session in the VS Code panel:** the docs do not say whether closing a tab ends the session. The proof is an END line appearing in `sessions.log`.

## Hook roles and blocking

From the official hooks reference ("exit code 2 behavior per event"):

| Event | When it runs | Our hooks | Can it block? |
|---|---|---|---|
| SessionStart | A session starts, resumes, is cleared, compacted or forked | Recorder `--session-start`; `session-preflight.mjs`, whose stdout goes to Claude's context | **No.** Exit 2 only shows stderr to the user |
| PreToolUse | Before each matching tool call (`Edit\|Write`) | `guard.mjs` | **Yes.** Exit 2 blocks the tool call, and stderr is shown to Claude |
| PostToolUse | After a matching tool call succeeds | Recorder `--from-hook` | **No.** The tool has already run; exit 2 only shows stderr to Claude |
| Stop | Claude finishes responding | `stop-worklog.mjs` | **Yes.** Exit 2 stops Claude from finishing and continues the turn. `stop_hook_active` and the 8-continuation cap prevent loops |
| SessionEnd | The session ends | Recorder `--session-end` | **No.** It cannot block ending; exit 2 only shows stderr to the user |
| FileChanged | A watched file changes | none: not enabled (see "FileChanged watcher") | **No** |

Every hook here fails open, so a script that cannot run never stops the session. Only PreToolUse and Stop can hold work back, and only by exiting 2 on purpose.

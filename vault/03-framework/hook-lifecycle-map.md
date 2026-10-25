---
id: hook-lifecycle-map
type: guide
---

# Hook lifecycle map

Which Claude Code hooks this project uses, what they run, and how far each one is proven.

- **Configured**: present in .claude/settings.json.
- **Verified**: seen working, with the evidence named (see evidence/task05-note.md).
- **Planned**: described for a later task; not in the settings.

## Timeline

- 2026-10-24, Task 05: added scripts/vault-sync.mjs and its isolated checks (safety-tests/vault-log.test.mjs).
- 2026-10-24, Task 05: added the PostToolUse and SessionStart hooks to .claude/settings.json. No hooks existed before.
- 2026-10-24, Task 05: both hooks verified live in a new session. Only the project settings define hooks (`.claude/settings.local.json`, `~/.claude/settings.json` and `~/.claude/settings.local.json` have none), so one Edit gives one line.
- 2026-10-25, Task 05: second PostToolUse check. One Edit of the demonstration spec created `vault/_changelog/2026-10-25.md` with one line (07:31:55Z). The day change started a new local-date file and left the 2026-10-24 file unchanged.
- 2026-10-25, Task 05: each new entry now ends with ` · **commit:** <id>`, taken from `git rev-parse --short HEAD`, or `unknown` when Git has no commit. Older entries were not rewritten. `npm run test:safety`: 56 passed. One Edit of the demonstration spec then added one entry ending `**commit:** 869ed8d`, matching the measured HEAD ID (07:39:58Z).
- 2026-10-25, Task 05: one Edit removed the check comment from the demonstration spec and added one entry (07:47:13Z). The spec matches HEAD again.
- 2026-10-25, after commit `bdee6ca`: both commands now start the script through `"${CLAUDE_PROJECT_DIR}"` instead of the relative path `scripts/`. From the project root, an Edit adding a comment and an Edit removing it each added one entry ending `**commit:** bdee6ca`, matching the measured HEAD ID (08:02:56Z, 08:03:06Z). `npm run test:safety`: 56 passed.

## Hook settings

| Event | Matcher | Command | Status |
|---|---|---|---|
| PostToolUse | `Edit\|Write` | `node "${CLAUDE_PROJECT_DIR}"/scripts/vault-sync.mjs --from-hook` | Verified live from the project root. Each Claude Edit of `tests/blog/home.smoke.spec.ts` added exactly one line (first 2026-10-24T16:00:59Z; latest 2026-10-25T08:03:06Z); vault paths add none. Not yet seen from a session started in a subfolder |
| SessionStart | omitted, so it fires for `startup`, `resume`, `clear`, `compact` and `fork` | `node "${CLAUDE_PROJECT_DIR}"/scripts/vault-sync.mjs --session-start` | Fired live once with the earlier relative-path command: `- session START 2026-10-24T16:00:28Z` (file was absent before). The line does not record which source fired it. The new command has not run yet; no session has started since the change |
| Task 06 guard | — | — | Planned for Task 06. Not installed |

Shell-form hooks run in Claude Code's current folder, which is not always the project root. Both commands therefore start the script through `"${CLAUDE_PROJECT_DIR}"`, which the official hooks reference describes as always set to "the project root where the session started", with the placeholder quoted as the docs advise for shell form. The script itself also finds the project root from `CLAUDE_PROJECT_DIR`, falling back to the working folder.

With the earlier relative path `node scripts/vault-sync.mjs`, a hook run from another folder fails. Running that command string from `tests/blog/` gave `Cannot find module …/tests/blog/scripts/vault-sync.mjs` and exit 1, which Claude Code reports as a non-blocking hook error; the edit itself still happens but goes unlogged. The new string, run from the same folder with empty input, exited 0. Both were tests of the command string only, not hook runs, and neither wrote to the log.

Not yet verified: a session started from a subfolder, both whether it loads these project settings and whether it logs to the project's `vault/_changelog/`. The value of `CLAUDE_PROJECT_DIR` has never been seen inside one of our hooks. The docs prefer exec form (`"command": "node"` plus `args`) for path placeholders; it is not used because the docs give no minimum version for it and it has not been tested on Claude Code 2.1.287.

## What the hook receives on stdin

When a hook fires, Claude Code runs the command and pipes a short JSON description of the event into it, the same way you pipe text into a program on the command line. For an Edit or Write, that JSON includes `tool_input.file_path`: the file that was just edited. The script reads it, turns it into a path relative to the project (with forward slashes), and appends one line to `vault/_changelog/<local date>.md`. Input it cannot use (no path, broken JSON, a file outside the project) is ignored. Either way the script exits 0, so logging never blocks the session.

## Loop protections

1. **Only Claude's Edit and Write tools trigger it.** The `Edit|Write` matcher fires only when Claude uses those tools. The script writes its log with Node's file functions, which is not a Claude tool call, so its own write cannot start another PostToolUse.
2. **It ignores `vault/`.** Any path that is `vault` or inside `vault/` is dropped before anything is written. So even if Claude edits a changelog file directly, or a file watcher sees the script's own write, nothing is logged.

## FileChanged watcher

Not enabled for this exercise. No watcher existed before Task 05, so nothing was removed. The script already accepts a top-level `file_path` (the FileChanged input shape), so a watcher could be added later without changing it; loop protection 2 would stop it logging the script's own writes.

## Future proposal (documentation only, not configured)

```
Event: SessionEnd.
Matcher: omitted, so it would apply to all session endings.
Behavior: append a closing journal line so a reviewer can see when the session ended.
```

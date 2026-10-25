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

## Hook settings

| Event | Matcher | Command | Configured | Script verified | Live hook |
|---|---|---|---|---|---|
| PreToolUse | `Edit\|Write` | `node scripts/hooks/guard.mjs` | Yes (Task 06) | Yes: 34 guard checks pass, covering all seven checks. The command string, run from the project root, gave 2 / 2 / 0 for the quick sample | **Verified for one refusal, check 3 (`.only`), from the project root** (2026-10-25T08:32Z): a Claude Edit adding a comment with `.only` to `tests/blog/home.smoke.spec.ts` was refused with the guard's `.only` reason. The file was unchanged and no log entry was added. Not seen from a subfolder. Checks 1, 2 and 4–7 have not been tried live, and check 7 was added after the live refusal |
| PostToolUse | `Edit\|Write` | `node "${CLAUDE_PROJECT_DIR}"/scripts/vault-sync.mjs --from-hook` | Yes (Task 05) | Yes: 12 vault-sync `--from-hook` checks (the 13th covers `--session-start`) | Verified from the project root. Each Claude Edit of `tests/blog/home.smoke.spec.ts` added exactly one line (first 2026-10-24T16:00:59Z; latest 2026-10-25T08:03:06Z), and vault paths add none. Not yet seen from a session started in a subfolder |
| SessionStart | omitted, so it fires for `startup`, `resume`, `clear`, `compact` and `fork` | `node "${CLAUDE_PROJECT_DIR}"/scripts/vault-sync.mjs --session-start` | Yes (Task 05) | Yes: 1 vault-sync check | Fired once, with the earlier relative-path command: `- session START 2026-10-24T16:00:28Z`. The line does not record which source fired it. The current command has not run yet |

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

**The guard fails open.** Malformed input, an unexpected error, a tool outside `Edit|Write` (Bash, NotebookEdit), or a hook that does not run at all lets the edit through. Its command uses the relative path `scripts/hooks/guard.mjs`, as Task 06 specifies, unlike the recorder commands below. Run from a subfolder, it fails with `MODULE_NOT_FOUND` and exit 1, which PreToolUse treats as non-blocking, so the edit would go ahead unguarded. The reference documents `onFailure: "block"` to make failures block instead; it is not used here.

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

## Future proposal (documentation only, not configured)

```
Event: SessionEnd.
Matcher: omitted, so it would apply to all session endings.
Behavior: append a closing journal line so a reviewer can see when the session ended.
```

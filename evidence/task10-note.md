# Task 10: narrow permission rules and the secret-file deny

Date: 2026-10-26 · Branch: `week-2` (from `d976596`) · Not committed yet.

## Official syntax checked
Source: https://code.claude.com/docs/en/permissions, read 2026-10-26.
- "Rules are evaluated in order: deny, then ask, then allow. The first match in that order determines the outcome, and rule specificity doesn't change the order."
- "A rule with no `*` matches one exact command." `Bash(npm run build)` does not match `npm run build --watch`.
- Compound commands are split on `&&`, `||`, `;`, `|`, `|&`, `&` and newlines, and every part must match an allow rule. An ask rule like `Bash(git clean *)` "still prompts you for `cd /tmp && git clean -f` … even in auto mode".
- "An allow rule won't match past an assignment of any other variable". Only certain known-safe variables (for example `NODE_ENV`) are stripped, so `APP_ENV=dev npm test` would not match `Bash(npm test)`.
- Read and Edit rules use gitignore syntax. `./path` is relative to the current directory, and a bare name such as `.env*` matches "at any depth". "`Edit` rules apply to all built-in tools that edit files" (Write and NotebookEdit included).

## Final rules (`.claude/settings.json`)
| List | Rule | Status | Reason |
|---|---|---|---|
| deny | `Read(./.env)` | kept (Week 1) | Claude's file tools never read the real secrets file at the root |
| deny | `Read(./.env.*)` | kept (Week 1) | the same for any `.env.<name>` at the root, including test fixtures |
| deny | `Read(./**/.auth/**)` | kept (Week 1) | no reading of saved login state |
| deny | `Read(./**/*storageState*.json)` | kept (Week 1) | no reading of Playwright storage-state files |
| deny | `Edit(.env*)` | **added** | Claude cannot create or change any `.env*` file at any depth (Edit, Write, NotebookEdit). Side effect: it cannot write a placeholder `.env.example` either |
| ask | `Bash(git push *)` | kept (Week 1) | every push waits for a person (G4); it still prompts inside compound commands and in auto mode |
| ask | `Bash(npm run test:prod*)` | kept (Week 1) | prod runs only on an explicit request |
| allow | `Bash(npm test)` | kept, exact | the reviewed dev test command; the script sets `APP_ENV=dev` itself (`cross-env APP_ENV=dev playwright test`) |
| allow | `Bash(npm run test:list)` | kept, exact | lists dev tests; no browser |
| allow | `Bash(npm run typecheck)` | kept, exact | `tsc --noEmit`: reads only; no network or browser |
| allow | `Bash(npm run test:safety)` | kept, exact | isolated checks; no browser or network |
| allow | `Bash(npm run lint)` | **added**, exact | the additional command (see below): `eslint --max-warnings=0 .`, reads only |

The hooks (PreToolUse, PostToolUse, SessionStart, Stop, SessionEnd) are unchanged, checked by comparing them with `HEAD`. There is no `*` in any allow rule, and no `Bash(node *)`, `Bash(npx *)` or MCP-tool allowance.

**Competing settings:**
- `~/.claude/settings.json` repeats `Read(./.env)`, `Read(./.env.*)` and the ask rule `Bash(git push *)`. The duplicates are harmless.
- `.claude/settings.local.json` has no permission rules (only `enabledMcpjsonServers: ["playwright"]`). There is no managed settings file.
- No settings level has an allow rule that overlaps these denies, and an allow rule could not override a deny anyway.

## Loaded rules and mode: user observations
**None supplied yet.** The user has not reported what `/permissions` shows (whether `Edit(.env*)` and `Bash(npm run lint)` are loaded, and from which source) or which permission mode is active. Claude's own session context says the session runs in auto mode. That is not an observation of the interface, so it is not recorded as verified.

## Harmless fixture test (`Read(./.env.*)`)
- **Fixture:** `.env.permission-check` at the project root, created by the user to contain only `COURSE_DEMO=not-a-secret`. Claude never saw its contents, so the content is as stated by the user, not verified.
- **Attempt:** one real Read-tool call on `/Users/ngannguyen/Documents/testing/codemify/qa-framework/.env.permission-check`.
- **Actual result:** `File is in a directory that is denied by your permission settings.`, returned as a tool error. No content came back.
- **Tested rule:** the permanent `Read(./.env.*)`. It is present in both project and user settings, and no exact-file rule was added. The message does not name which source matched. Its wording says "directory", although the rule is a file pattern.
- **No retry** through Bash, Grep or any other tool. The real `.env` was not used.
- **Cleanup:** at review time (2026-10-26) the fixture **still exists**. A `test -e` existence check, which does not read the file, found it. Git shows it as ignored (`!!`), and it was never committed. Removal is the user's step and is not done yet.

## Allowed command test
- **`npm test`**, run through the Bash tool (zsh) from the project root as the exact command, with no `cd`, pipe, prefix or flags.
  - Result: `cross-env APP_ENV=dev playwright test`, Running 5 tests using 4 workers, **5 passed (4.7s)**, [chromium], retries 0.
  - **Permission observation: unverified.** Claude cannot see whether a prompt was shown, and the user has not reported it.
  - Earlier tasks ran `npm test -- --reporter=list`, which the exact rule does not cover. That variant was not allowed and is no longer used.
- **`npm run lint`**, run through the Bash tool as the exact command, after the rule was added.
  - Output: `> eslint --max-warnings=0 .` with no findings.
  - The output did not show the exit code, so a second, compound command (`cd … && npm run -s lint; echo "exit $?"`) was run only to read it: `exit 0`. That second form is not the exact allow-rule form.
  - **Permission observation: unverified**, for the same reason.

## Task 09 warning
Observed for both settings edits, each a Claude Edit of `.claude/settings.json`: adding `Edit(.env*)`, then adding `Bash(npm run lint)`. Each returned `PreToolUse:Edit hook additional context: guard: WARN — shared file; review the affected callers before approving` and was applied. The warning does not enforce approval; the approval for both came from the user in the conversation.

## Additional command choice
- **Asked about:** `/mcp`. Rejected. It is a Claude Code slash command typed by the user, not a tool call, so no permission rule can match it. The nearest rule, `mcp__playwright__*`, would be a whole-server allowance, including `browser_run_code_unsafe`. It was also used only once in shell history and in 2 prompts this week.
  - What `/mcp` controls here: the `playwright` server from `.mcp.json` (`npx @playwright/mcp@latest --isolated --browser chromium`, not version-pinned) and `enabledMcpjsonServers` in the Git-ignored `.claude/settings.local.json`.
- **Chosen:** `npm run lint`, as `Bash(npm run lint)` (exact).
  - **Reason:** named in 8 of the user's prompts this week (Tasks 08–09). It reads only: no `--fix`, no network, no browser, no data.
  - **Limit:** ESLint runs code. `eslint.config.mjs`, `scripts/lint-scope.mjs` and the plugins in `node_modules` run without a prompt whenever lint runs. Those two files are SHARED, so the guard does not warn when they are edited, and the allow rule approves the command string, not what it runs.
- Not chosen: `npm run format:check` (read-only, but in 1 prompt); `npm run format` (writes files); `git push` (must stay an ask rule).

## Permission rules versus guard.mjs
- **Permission rules** (`.claude/settings.json`) are enforced by Claude Code itself on tool calls, before a tool runs. They match the tool name and its path or command, and decide deny, ask or allow.
  - Example: the Read-tool call on `.env.permission-check` was refused by `Read(./.env.*)`. No hook was involved.
- **guard.mjs** is a PreToolUse hook. It examines the content of a proposed Edit or Write and can refuse it (exit 2) or remind about it (the Task 09 WARN).
  - Example: an Edit that adds `.only` to a spec is refused, whatever the permission mode. A permission rule cannot see what an edit adds.
- **Coverage limit both share:** neither covers what a Bash command does to files. `cat .env`, `sed -i` or a heredoc append bypass both layers. That last one actually happened to `safety-tests/guard.test.mjs` in Task 09. The guard sees only Claude's Edit and Write tools, and Read/Edit rules cover only built-in file tools. An allowed Bash command such as `npm run lint` runs whatever code it loads.

## Checks
| Command | Result |
|---|---|
| `npm run format:check` | exit 0 (`.claude/` is excluded from Prettier) |
| `npm run lint` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm run test:safety` | 196 pass, 0 fail |

## Not done / unresolved
- The fixture `.env.permission-check` has not been removed (user step).
- `/permissions` (loaded rules, sources, active mode) and whether `npm test` or `npm run lint` prompted are not reported, so they are unverified.
- G5's Check line does not yet mention `Edit(.env*)`, and there is no `safety-tests/settings.test.mjs` proof for the CRITICAL settings file. Both are planned but not approved.
- Not committed.

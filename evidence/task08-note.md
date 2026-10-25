# Task 08: lint, format and Git hooks

Date: 2026-10-25 · Branch: `week-2` (from `cc02215`) · Node v24.21.0 · Git 2.54.0 · Not committed yet.

## Compatibility, checked before installation
`npm view <pkg>@<version> engines peerDependencies` for each package in the course set:

| Package | Needs | Result on this project |
|---|---|---|
| typescript-eslint 8.64.0 | eslint `^8.57 \|\| ^9 \|\| ^10`, typescript `>=4.8.4 <6.1.0`, Node `>=21.1` | OK only with TypeScript 6.0.x |
| eslint 10.7.0 | Node `^20.19 \|\| ^22.13 \|\| >=24` | OK |
| @eslint/js 10.0.1 | eslint `^10` (optional) | OK |
| eslint-plugin-playwright 2.10.5 | eslint `>=8.40` | OK |
| eslint-config-prettier 10.1.8 | eslint `>=7` | OK |
| prettier 3.9.5, husky 9.1.7 | Node `>=14` / `>=18` | OK |
| lint-staged 17.0.8 | Node `>=22.22.1` | OK |
| @playwright/test 1.61.1 | no TypeScript peer | unchanged |

**TypeScript change: 7.0.2 → 6.0.3.** typescript-eslint 8.64.0 supports TypeScript below 6.1.0. TypeScript 7 (the native port) is outside that range, so keeping it would have needed `--force` or `--legacy-peer-deps`, which the task rules out. The tsconfig uses no option that TypeScript 6 deprecates (`types` is already explicit). `npm run typecheck` passed on 6.0.3 before any other change.

Install: the exact course command, without `--force` or `--legacy-peer-deps`. No peer warnings. `found 0 vulnerabilities`. npm noted that `fsevents@2.3.2` (Playwright's optional macOS dependency, already present) has install scripts not covered by allowScripts. Playwright stayed at 1.61.1.

Installed (`npm ls --depth=0`): @eslint/js 10.0.1, eslint 10.7.0, eslint-config-prettier 10.1.8, eslint-plugin-playwright 2.10.5, husky 9.1.7, lint-staged 17.0.8, prettier 3.9.5, typescript 6.0.3, typescript-eslint 8.64.0. Unchanged: @playwright/test 1.61.1, @types/node 24.19.2, cross-env 10.1.0.

## Configuration
- `.prettierrc.json`: single quotes, semicolons, trailing commas, `printWidth` 120 (closest to the existing style), LF.
- `.prettierignore`: raw drafts, the Jira pack, Markdown, `vault/`, `evidence/`, `.claude/`, generated output. Markdown, notes, rules and Claude settings stay byte-identical.
- `eslint.config.mjs` (flat): `@eslint/js` recommended for `**/*.mjs` (Node globals declared inline, no extra package). For `**/*.ts`: `@eslint/js` + typescript-eslint recommended, plus the typed rule `@typescript-eslint/no-floating-promises`, which treats node:test's `describe`/`it`/`test` as known-safe calls. `eslint-plugin-playwright` flat/recommended on `tests/**/*.ts`, with `no-focused-test` and `no-skipped-test` raised to error on `tests/**/*.spec.ts`. `eslint-config-prettier` comes last.
- runIfEnv: the Playwright rules do not apply to `env/`, so the conditional `test.skip(...)` in env/runIfEnv.ts is not flagged. Specs call `runIfEnv(test, ['dev'])`, which `no-skipped-test` does not match, so G2 gating still lints clean.
- `scripts/lint-scope.mjs`: one exclusion list shared by eslint.config.mjs and lint-staged.config.mjs.
- `tsconfig.json`: added `"exclude": ["evidence/*-raw-draft.ts"]`. `include` is unchanged, so all active TypeScript is still checked.
- `package.json` scripts added: `lint` (`eslint --max-warnings=0 .`), `format`, `format:check`, `prepare` (`husky`). `test`, `test:prod`, `test:list`, `typecheck` and `test:safety` are unchanged.

## Git hooks
- `npm run prepare` set `core.hooksPath=.husky/_`. `.husky/_/` holds Husky's own `.gitignore`, so it is not tracked.
- `.husky/pre-commit`: `node scripts/git-hooks/scan-staged.mjs || exit 1`, then `npx --no-install lint-staged`.
  - The scan reads `git diff --cached --raw -z --no-renames --diff-filter=ACMT` and each staged blob with `git cat-file blob <sha>`, using argument arrays (no shell). So it checks staged content, new files included, not the working tree.
  - It refuses `.env`, `.env.*` (except `.env.example`), `*.pem`, `*.key`, `*.p12`, `id_rsa` and `id_ed25519` in any folder, and the four Task 06 markers in any staged file. It reports file, line and kind, never the value.
  - It has no allowlist. The detector prefixes are assembled from pieces in scan-staged.mjs, guard.mjs and both test files, so all four pass their own scan.
  - It fails closed if Git cannot be read.
- `lint-staged.config.mjs`: `*.{ts,mjs}` → `eslint --max-warnings=0 --no-warn-ignored` + `prettier --check`; `*.{json,yml,yaml}` → `prettier --check`. Excluded paths are filtered out first. `--check` rather than `--write`, so a commit never changes files silently.
- `.husky/pre-push`: `node scripts/git-hooks/pre-push-check.mjs`. It reads `<local ref> <local sha> <remote ref> <remote sha>` lines from stdin and refuses any destination `refs/heads/main`, including `week-2:main` and deletes. `ALLOW_MAIN_PUSH=1` (exactly `1`) lifts only that refusal. It is documented in README for exceptional, approved use and was not used in this exercise. Then `npm run typecheck` and `npm run test:list`; no browser starts.

## Exclusions
| Path | TypeScript | ESLint | Prettier | lint-staged | Secret scan |
|---|---|---|---|---|---|
| `evidence/*-raw-draft.ts` | excluded | excluded | excluded | excluded | **scanned** |
| `jira-seed/**`, `scripts/jira-seed.mjs` | not in `include` | excluded | excluded | excluded | **scanned** |
| Our `.mjs` (scripts/, safety-tests/, configs) | not typechecked | **linted** | formatted | linted + checked | scanned |
| Markdown, `vault/`, `evidence/`, `.claude/` | n/a | n/a | excluded | n/a | scanned |

Coverage limit: `.mjs` files are linted but not typechecked. Their behaviour is covered by `npm run test:safety`.

## Changes to existing files and why
- Literal U+FEFF characters in 3 scripts and 2 tests became `﻿` escapes, because ESLint's `no-irregular-whitespace` flagged them. Behaviour is identical, and the BOM checks still pass.
- safety/helpers.test.ts: `suite: any` became a small `JsonSuite` interface (`no-explicit-any`). The assertions are unchanged.
- `prettier --write .` reformatted 9 existing files (layout only): .mcp.json, env/runIfEnv.ts, env/target.ts, safety/helpers.test.ts, safety/target.test.ts, safety-tests/{guard,vault-log,worklog}.test.mjs, scripts/hooks/session-preflight.mjs.
- No spec, Page Object, assertion, `runIfEnv` call or test title changed.
- `.claude/settings.json` and the Claude hooks are unchanged.
- Docs: G7 added to .claude/rules/01-guardrails.md, new commands in CLAUDE.md, a new README section, and the README listing note updated from 3 tests to 5.

## Commands and results
| Command | Result |
|---|---|
| `npm run format:check` | All matched files use Prettier code style, exit 0 |
| `npm run lint` | 0 errors, 0 warnings, exit 0 |
| `npm run typecheck` | exit 0 (TypeScript 6.0.3) |
| `npm run test:safety` | tests 158, pass 158, fail 0 (118 earlier + 40 in safety-tests/git-hooks.test.mjs) |
| `npm test -- --reporter=list` | 5 passed (4.3s), 1 project [chromium], retries 0 |

The first lint run gave 31 errors (BOM characters, node:test calls, one `any`). The first format check flagged 9 files. Both were fixed as described above, without disabling any rule for the files concerned.

## Disposable verification (real Husky hooks)
Set up in the session scratchpad: a copy of the tracked and new files (no `.env`, no `.playwright-mcp/`, no journal), with `node_modules` symlinked. It had its own `git init`, a separate global Git config, `npx husky`, and a local bare repo as `origin`. GitHub was not involved.

| # | Action | Result |
|---|---|---|
| 0 | Commit all 76 files | passed (scan clean, lint-staged ran) |
| 1 | `git add -f .env` + commit | `pre-commit: BLOCKED — .env is a protected secret file`, exit 1 |
| 2 | New file with a fake assembled AWS-style key | `BLOCKED — pages/Leak.ts:1 looks like an AWS access key ID`, exit 1; value not in output (0 occurrences) |
| 3 | Placeholder-only `.env.example` | committed |
| 4 | TS file with a floating promise | ESLint `no-floating-promises`, exit 1 |
| 4b | Lint-clean but unformatted TS | `prettier --check` failed, exit 1 |
| 5 | `evidence/task99-raw-draft.ts` with `.only` and a bad import | committed (excluded from lint/format; scan still ran) |
| 6 | Spec with `test.only` / `test.skip` | `no-focused-test` and `no-skipped-test` errors, exit 1 |
| 7 | `git push origin week-2` | typecheck + `Total: 5 tests in 4 files`, pushed |
| 8 | `git push origin week-2:main` | `pre-push: BLOCKED — this push updates refs/heads/main`, exit 1 |
| 9 | local `main` → `main` | blocked, exit 1 |

Afterwards the bare remote held only `refs/heads/week-2`. In the copy, the `node_modules` symlink was committed, because `.gitignore`'s `node_modules/` matches directories only. This happens only in the copy; the real project has a real `node_modules/` folder.

## Not verified / limits
- No real commit or push in this repository has gone through the hooks yet (nothing is committed for Task 08).
- `HUSKY=0` and `--no-verify` skip all of this silently. G7 forbids them, but only review enforces G7. There is no CI.
- The token check knows four prefixes. A secret in any other format passes.
- ESLint does not typecheck `.mjs` files.

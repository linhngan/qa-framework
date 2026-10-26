#!/usr/bin/env node
/**
 * spec-notes.mjs — the spec-note steps of .husky/pre-commit (Task 11).
 *
 *   node scripts/git-hooks/spec-notes.mjs precheck   refuse unsafe staging, before anything is written
 *   node scripts/git-hooks/spec-notes.mjs refresh    write and stage the selected specs' notes, then check them
 *
 * Selected specs are the staged changes to tests/**\/*.spec.ts, read NUL-delimited from
 * `git diff --cached --name-status -z -M`: added, modified, deleted, and both paths of
 * a rename. With no selected spec, both steps exit 0 without output.
 *
 * The root is always the Git top level, never an inherited CLAUDE_PROJECT_DIR, so a
 * hook started from another project's session cannot act on that project.
 * Exit 0 when safe or done, 1 when refused. Git is called with argument arrays only,
 * and only the selected specs' own notes are ever staged (never `git add .`).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SYNC = fileURLToPath(new URL('../vault-sync.mjs', import.meta.url));
const SPEC = /^tests\/.+\.spec\.ts$/;

function topLevel() {
  // Only the final newline is removed: a folder name may itself end in a space.
  return execFileSync('git', ['rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).replace(/\n$/, '');
}

/** Staged spec paths (old and new for a rename), plus the renames for reporting. */
function selectedSpecs(root) {
  const out = execFileSync(
    'git',
    ['--literal-pathspecs', 'diff', '--cached', '--name-status', '-z', '-M', '--diff-filter=ACDMRT', '--', 'tests/'],
    { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const fields = out.split('\0');
  const specs = [];
  const renames = [];
  for (let i = 0; i < fields.length && fields[i] !== '';) {
    const status = fields[i];
    if (status.startsWith('R') || status.startsWith('C')) {
      const [from, to] = [fields[i + 1], fields[i + 2]];
      if (status.startsWith('R')) {
        specs.push(from);
        if (SPEC.test(from) || SPEC.test(to)) renames.push([from, to]);
      }
      specs.push(to);
      i += 3;
    } else {
      specs.push(fields[i + 1]);
      i += 2;
    }
  }
  return { specs: [...new Set(specs.filter((p) => SPEC.test(p)))], renames };
}

function refuse(lines) {
  for (const line of lines) process.stderr.write(`pre-commit: BLOCKED — ${line}\n`);
  return 1;
}

async function main(step) {
  if (step !== 'precheck' && step !== 'refresh') {
    process.stderr.write('usage: spec-notes.mjs precheck | refresh\n');
    return 2;
  }
  let root;
  let selected;
  try {
    root = topLevel();
    selected = selectedSpecs(root);
  } catch (err) {
    return refuse([`could not read the staged files (${String(err?.message).split('\n')[0]})`]);
  }
  const { specs, renames } = selected;
  if (specs.length === 0) return 0;
  for (const [from, to] of renames) process.stderr.write(`pre-commit: renamed spec ${from} → ${to}\n`);

  if (step === 'precheck') {
    // vault-sync.mjs reads its root when it loads, so pin it to this repository first.
    process.env.CLAUDE_PROJECT_DIR = root;
    const { stagingProblems } = await import('../vault-sync.mjs');
    const problems = stagingProblems(specs);
    return problems.length > 0 ? refuse(problems) : 0;
  }

  const env = { ...process.env, CLAUDE_PROJECT_DIR: root };
  const options = { cwd: root, env, stdio: ['ignore', 'inherit', 'inherit'] };
  const write = spawnSync(process.execPath, [SYNC, '--write', '--stage', '--files', ...specs], options);
  if (write.status !== 0) return refuse([`spec notes were not refreshed (vault-sync exit ${write.status})`]);
  const check = spawnSync(process.execPath, [SYNC, '--check', '--files', ...specs], options);
  if (check.status !== 0) return refuse([`spec notes are not current after refresh (vault-sync exit ${check.status})`]);
  return 0;
}

process.exitCode = await main(process.argv[2]);

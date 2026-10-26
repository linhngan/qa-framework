// Isolated checks for scripts/hooks/session-preflight.mjs and scripts/hooks/stop-worklog.mjs.
// Each test runs the scripts by absolute path inside a fresh temporary Git repository with
// a local test author, an empty global Git config and CLAUDE_PROJECT_DIR pointed at that
// repository. Hook input goes through spawnSync's input option. No network, and nothing
// touches the real project's vault/.
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PREFLIGHT = fileURLToPath(new URL('../scripts/hooks/session-preflight.mjs', import.meta.url));
const WORKLOG = fileURLToPath(new URL('../scripts/hooks/stop-worklog.mjs', import.meta.url));
const TZ = 'Pacific/Kiritimati'; // UTC+14, so the local date is often not the UTC date
const STOP = JSON.stringify({ session_id: 'test', hook_event_name: 'Stop', stop_hook_active: false });

let sandbox;
let project;
let env;

function gitIn(...args) {
  execFileSync('git', args, { cwd: project, env, stdio: 'ignore' });
}

function makeRepo({ name = 'Test Student', commit = true } = {}) {
  gitIn('init', '-q', '-b', 'test-branch');
  if (name !== null) gitIn('config', 'user.name', name);
  gitIn('config', 'user.email', 'test@example.invalid');
  if (commit) commitAt(Math.floor(Date.now() / 1000), 'init');
}

/** Commits (empty allowed) with author and committer time set to the given Unix seconds. */
function commitAt(seconds, message) {
  const stamp = `${seconds} +0000`;
  execFileSync('git', ['commit', '-q', '--allow-empty', '-m', message], {
    cwd: project,
    env: { ...env, GIT_AUTHOR_DATE: stamp, GIT_COMMITTER_DATE: stamp },
    stdio: 'ignore',
  });
}

function put(rel, content = 'x\n') {
  mkdirSync(path.dirname(path.join(project, rel)), { recursive: true });
  writeFileSync(path.join(project, rel), content);
}

function run(script, args = [], input = '', options = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: project,
    input,
    encoding: 'utf8',
    env: { ...env, CLAUDE_PROJECT_DIR: project },
    ...options,
  });
}

function localToday(timeZone = TZ) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(),
  );
}

function journal(slug = 'test-student') {
  return `vault/12-progress-report/${slug}/${localToday()}.md`;
}

function assertAllowed(result) {
  assert.equal(result.status, 0, `exit code (stderr: ${result.stderr})`);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
}

function assertReminder(result, rel = journal()) {
  assert.equal(result.status, 2, `exit code (stderr: ${result.stderr})`);
  assert.equal(result.stdout, '');
  assert.equal(
    result.stderr,
    `worklog: BLOCKED — today's work has no journal entry yet. Run /worklog to append a "## HH:MM" entry to ${rel} (Did, Worked / didn't, Next), then finish.\n`,
  );
}

beforeEach(() => {
  sandbox = mkdtempSync(path.join(tmpdir(), 'worklog-'));
  project = path.join(sandbox, 'project');
  mkdirSync(path.join(sandbox, 'home'));
  mkdirSync(project);
  const gitconfig = path.join(sandbox, 'gitconfig');
  writeFileSync(gitconfig, '');
  env = {
    PATH: process.env.PATH,
    HOME: path.join(sandbox, 'home'),
    TZ,
    GIT_CONFIG_GLOBAL: gitconfig,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CEILING_DIRECTORIES: sandbox,
  };
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

describe('session-preflight', () => {
  it('prints exactly five lines, counting nested untracked files one by one', () => {
    makeRepo();
    put('tracked.ts');
    gitIn('add', 'tracked.ts');
    commitAt(Math.floor(Date.now() / 1000), 'add tracked');
    put('tracked.ts', 'changed\n');
    put('new/a/b.ts');
    put('new/c.md');
    const result = run(PREFLIGHT);
    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    assert.equal(
      result.stdout,
      `Date: ${localToday()}\nBranch: test-branch\nUncommitted files: 3\nLatest journal: none yet\nMap: vault/_map.md\n`,
    );
  });

  it('finds the newest YYYY-MM-DD.md anywhere under vault/12-progress-report', () => {
    makeRepo();
    put('vault/12-progress-report/x/2026-10-20.md');
    put('vault/12-progress-report/y/2026-10-22.md');
    put('vault/12-progress-report/y/notes.md');
    put('vault/12-progress-report/z/deep/2026-10-21.md');
    const lines = run(PREFLIGHT).stdout.split('\n');
    assert.equal(lines[3], 'Latest journal: vault/12-progress-report/y/2026-10-22.md');
  });

  it('falls back to no-branch on a detached HEAD', () => {
    makeRepo();
    gitIn('checkout', '-q', '--detach');
    assert.equal(run(PREFLIGHT).stdout.split('\n')[1], 'Branch: no-branch');
  });

  it('falls back to no-branch and unknown outside a Git repository, still exiting 0', () => {
    const result = run(PREFLIGHT);
    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    const lines = result.stdout.split('\n');
    assert.equal(lines.length, 6); // five lines plus the final newline
    assert.equal(lines[1], 'Branch: no-branch');
    assert.equal(lines[2], 'Uncommitted files: unknown');
  });
});

describe('stop-worklog --path and slug', () => {
  it("--path prints today's journal path without reading stdin", () => {
    makeRepo();
    const result = run(WORKLOG, ['--path'], undefined, { stdio: ['ignore', 'pipe', 'pipe'] });
    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    assert.equal(result.stdout, `${journal()}\n`);
  });

  it('builds the slug from the trimmed, lowercased Git user.name, falling back to student', () => {
    const cases = [
      ['  Ngan NGUYEN  ', 'ngan-nguyen'],
      ["O'Brien, Jr.", 'o-brien-jr'],
      ['---', 'student'],
      [null, 'student'],
    ];
    for (const [name, slug] of cases) {
      rmSync(project, { recursive: true, force: true });
      mkdirSync(project);
      makeRepo({ name, commit: false });
      assert.equal(run(WORKLOG, ['--path']).stdout, `${journal(slug)}\n`, `slug for ${JSON.stringify(name)}`);
    }
  });

  it('names the journal by local date, not UTC date', () => {
    makeRepo();
    assert.ok(run(WORKLOG, ['--path']).stdout.endsWith(`/${localToday(TZ)}.md\n`));
  });
});

describe('stop-worklog decisions', () => {
  it('clean empty repository (no commits, no files) → 0', () => {
    makeRepo({ commit: false });
    assertAllowed(run(WORKLOG, [], STOP));
  });

  it("activity without today's heading → 2, naming the exact path and /worklog", () => {
    makeRepo({ commit: false });
    put('notes.md');
    assertReminder(run(WORKLOG, [], STOP));
  });

  it('a valid "## HH:MM" heading in today\'s journal → 0', () => {
    makeRepo({ commit: false });
    put('notes.md');
    put(journal(), `# ${localToday()}\n\n## 14:05\n- **Did:** tests\n`);
    assertAllowed(run(WORKLOG, [], STOP));
  });

  it('a journal without a "## HH:MM" line still → 2', () => {
    makeRepo({ commit: false });
    put('notes.md');
    put(journal(), `# ${localToday()}\n\n## Notes\n- not a timed entry\n## 25:00 not a time\n`);
    assertReminder(run(WORKLOG, [], STOP));
  });

  it('retry with stop_hook_active true → 0, even with activity', () => {
    makeRepo({ commit: false });
    put('notes.md');
    assertAllowed(run(WORKLOG, [], JSON.stringify({ hook_event_name: 'Stop', stop_hook_active: true })));
  });

  it('malformed or unreadable input → 0, even with activity', () => {
    makeRepo({ commit: false });
    put('notes.md');
    for (const input of ['', '{bad', 'null', '[]', '42']) assertAllowed(run(WORKLOG, [], input));
    assertAllowed(run(WORKLOG, [], undefined, { stdio: ['ignore', 'pipe', 'pipe'] }));
  });

  it('removes all leading byte-order marks before parsing', () => {
    makeRepo({ commit: false });
    put('notes.md');
    assertReminder(run(WORKLOG, [], `\uFEFF\uFEFF${STOP}`));
  });

  it('a nested untracked qualifying file in a new folder counts as activity → 2', () => {
    makeRepo({ commit: false });
    put('new/a/b.ts');
    assertReminder(run(WORKLOG, [], STOP));
  });

  it('only non-qualifying changes and no commit today → 0', () => {
    makeRepo({ commit: false });
    put('image.png');
    put('notes.txt');
    assertAllowed(run(WORKLOG, [], STOP));
  });

  it('each qualifying extension counts as activity: .ts .mjs .json .md .sh', () => {
    for (const ext of ['.ts', '.mjs', '.json', '.md', '.sh']) {
      rmSync(project, { recursive: true, force: true });
      mkdirSync(project);
      makeRepo({ commit: false });
      put(`file${ext}`);
      assertReminder(run(WORKLOG, [], STOP));
    }
  });

  it('a clean tree with a commit today → 2', () => {
    makeRepo();
    assertReminder(run(WORKLOG, [], STOP));
  });

  it('a clean tree whose last commit is two local days old → 0', () => {
    makeRepo({ commit: false });
    commitAt(Math.floor(Date.now() / 1000) - 2 * 86400, 'old');
    assertAllowed(run(WORKLOG, [], STOP));
  });

  it('compares commit dates by local calendar day: just after local midnight counts as today', () => {
    // In UTC+14, one minute after local midnight is still the previous day in UTC.
    const [y, m, d] = localToday(TZ).split('-').map(Number);
    const localMidnight = Date.UTC(y, m - 1, d) / 1000 - 14 * 3600;
    const seconds = localMidnight + 60;
    assert.ok(seconds <= Date.now() / 1000, 'test needs the current time to be past 00:01 local in Kiritimati');
    assert.notEqual(
      new Date(seconds * 1000).toISOString().slice(0, 10),
      localToday(TZ),
      'sample is on a different UTC day',
    );
    makeRepo({ commit: false });
    commitAt(seconds, 'just after local midnight');
    assertReminder(run(WORKLOG, [], STOP));
  });

  it('outside a Git repository → 0', () => {
    put('notes.md');
    assertAllowed(run(WORKLOG, [], STOP));
  });
});

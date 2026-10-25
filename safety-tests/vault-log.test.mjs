// Isolated checks for scripts/vault-sync.mjs. Each test runs the script by
// absolute path inside a fresh temporary Git repository, with CLAUDE_PROJECT_DIR
// pointed at that repository, so nothing touches the real project's vault/.
// No editing tools, no network.
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('../scripts/vault-sync.mjs', import.meta.url));
const TZ = 'Pacific/Kiritimati'; // UTC+14, so the local date is often not the UTC date
const ENTRY_TIME = String.raw`\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z`;

let sandbox; // holds home/, gitconfig and project/
let project;
let env;

function gitIn(dir, ...args) {
  execFileSync('git', args, { cwd: dir, env, stdio: 'ignore' });
}

function makeRepo(dir) {
  gitIn(dir, 'init', '-q', '-b', 'test-branch');
  gitIn(dir, 'config', 'user.name', 'Test User');
  gitIn(dir, 'config', 'user.email', 'test@example.invalid');
  gitIn(dir, 'commit', '-q', '--allow-empty', '-m', 'init');
}

function run(args, input = '') {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: project,
    input,
    encoding: 'utf8',
    env: { ...env, CLAUDE_PROJECT_DIR: project },
  });
}

function hook(payload) {
  return run(['--from-hook'], typeof payload === 'string' ? payload : JSON.stringify(payload));
}

function localDates() {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
  return new Set([fmt.format(new Date())]);
}

const changelogDir = () => path.join(project, 'vault', '_changelog');

function changelogFiles() {
  return existsSync(changelogDir()) ? readdirSync(changelogDir()).filter((f) => f.endsWith('.md')) : [];
}

function entries() {
  const files = changelogFiles();
  assert.equal(files.length, 1, `expected one daily log, found ${files.join(', ') || 'none'}`);
  return readFileSync(path.join(changelogDir(), files[0]), 'utf8').split('\n').filter((l) => l.startsWith('- '));
}

function shortHead() {
  return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: project, env, encoding: 'utf8' }).trim();
}

function entryPattern(rel, { name = 'Test User', branch = 'test-branch', subject = 'init', commit = shortHead() } = {}) {
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `^- ${ENTRY_TIME} · ${esc(name)} @ .+ · ${esc(branch)} · ${esc(rel)} · last commit: ${esc(subject)} · \\*\\*commit:\\*\\* ${esc(commit)}$`,
  );
}

beforeEach(() => {
  sandbox = mkdtempSync(path.join(tmpdir(), 'vault-log-'));
  const home = path.join(sandbox, 'home');
  project = path.join(sandbox, 'project');
  mkdirSync(home);
  mkdirSync(project);
  const gitconfig = path.join(sandbox, 'gitconfig');
  writeFileSync(gitconfig, '');
  env = {
    PATH: process.env.PATH,
    HOME: home,
    TZ,
    GIT_CONFIG_GLOBAL: gitconfig,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CEILING_DIRECTORIES: sandbox,
  };
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

describe('vault-sync --from-hook', () => {
  beforeEach(() => makeRepo(project));

  it('logs a PostToolUse tool_input.file_path given as a relative path', () => {
    const result = hook({ hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { file_path: 'tests/a.spec.ts' } });
    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    const lines = entries();
    assert.equal(lines.length, 1);
    assert.match(lines[0], entryPattern('tests/a.spec.ts'));
  });

  it('logs a FileChanged top-level file_path given as an absolute path, stored relative with forward slashes', () => {
    const result = hook({ hook_event_name: 'FileChanged', file_path: path.join(project, 'pages', 'BasePage.ts') });
    assert.equal(result.status, 0);
    assert.match(entries()[0], entryPattern('pages/BasePage.ts'));
  });

  it('names the daily log by local date and stamps the entry in UTC', () => {
    assert.equal(hook({ tool_input: { file_path: 'a.txt' } }).status, 0);
    const [file] = changelogFiles();
    assert.ok(localDates().has(file.replace(/\.md$/, '')), `${file} is not the local date in ${TZ}`);
    const content = readFileSync(path.join(changelogDir(), file), 'utf8');
    assert.ok(content.startsWith(`# ${file.replace(/\.md$/, '')}\n\n`));
    assert.match(entries()[0], new RegExp(`^- ${ENTRY_TIME} · `));
  });

  it('ignores vault itself and every path inside vault/', () => {
    for (const p of ['vault', 'vault/_changelog/2026-01-01.md', path.join(project, 'vault', '_map.md')]) {
      assert.equal(hook({ tool_input: { file_path: p } }).status, 0);
    }
    assert.equal(existsSync(changelogDir()), false);
  });

  it('ignores paths outside the project', () => {
    for (const p of ['/etc/hosts', '../other.txt', path.join(sandbox, 'home', 'x.txt')]) {
      assert.equal(hook({ tool_input: { file_path: p } }).status, 0);
    }
    assert.equal(existsSync(path.join(project, 'vault')), false);
  });

  it('ignores malformed input and missing or non-string paths', () => {
    for (const input of ['', '{not json', 'null', '{}', '{"tool_input":{}}', '{"tool_input":{"file_path":42}}', '{"file_path":""}']) {
      const result = hook(input);
      assert.equal(result.status, 0, `exit code for ${JSON.stringify(input)}`);
      assert.equal(result.stderr, '');
    }
    assert.equal(existsSync(path.join(project, 'vault')), false);
  });

  it('removes all leading byte-order marks before parsing', () => {
    const result = hook(`﻿﻿${JSON.stringify({ tool_input: { file_path: 'tests/bom.spec.ts' } })}`);
    assert.equal(result.status, 0);
    assert.match(entries()[0], entryPattern('tests/bom.spec.ts'));
  });

  it('appends without changing existing entries', () => {
    assert.equal(hook({ tool_input: { file_path: 'one.ts' } }).status, 0);
    const [file] = changelogFiles();
    const logPath = path.join(changelogDir(), file);
    const oldFormat = '- 2026-01-01T00:00:00Z · Old User @ host · old-branch · old.ts · last commit: before commit IDs';
    writeFileSync(logPath, `${readFileSync(logPath, 'utf8')}${oldFormat}\n`);
    const before = readFileSync(logPath, 'utf8');

    assert.equal(hook({ tool_input: { file_path: 'two.ts' } }).status, 0);
    const after = readFileSync(logPath, 'utf8');
    assert.ok(after.startsWith(before), 'existing content must stay unchanged');
    const lines = entries();
    assert.equal(lines.length, 3);
    assert.match(lines[0], entryPattern('one.ts'));
    assert.equal(lines[1], oldFormat);
    assert.match(lines[2], entryPattern('two.ts'));
  });

  it('ends the entry with the short HEAD ID from git rev-parse, at the length Git chooses', () => {
    gitIn(project, 'config', 'core.abbrev', '12');
    gitIn(project, 'commit', '-q', '--allow-empty', '-m', 'second');
    const id = shortHead();
    assert.equal(id.length, 12);
    assert.equal(hook({ tool_input: { file_path: 'tests/a.spec.ts' } }).status, 0);
    const [line] = entries();
    assert.ok(line.endsWith(` · **commit:** ${id}`), line);
    assert.match(line, entryPattern('tests/a.spec.ts', { subject: 'second', commit: id }));
  });

  it('exits 0 and reports a write failure briefly without the input', () => {
    mkdirSync(path.join(project, 'vault'));
    writeFileSync(changelogDir(), 'not a folder');
    const result = hook({ tool_input: { file_path: 'tests/a.spec.ts' }, note: 'SECRET-MARKER-123' });
    assert.equal(result.status, 0);
    assert.match(result.stderr, /^vault-sync: could not write changelog \(\w+\)\n$/);
    assert.ok(!result.stderr.includes('SECRET-MARKER-123'));
    assert.ok(!result.stderr.includes('tests/a.spec.ts'));
  });
});

describe('vault-sync without Git information', () => {
  it('uses "unknown" for name, branch and last commit outside a Git repository', () => {
    const result = hook({ tool_input: { file_path: 'notes.md' } });
    assert.equal(result.status, 0);
    assert.match(entries()[0], entryPattern('notes.md', { name: 'unknown', branch: 'unknown', subject: 'unknown', commit: 'unknown' }));
  });

  it('uses "unknown" for the commit ID in a repository with no commits yet', () => {
    gitIn(project, 'init', '-q', '-b', 'empty-branch');
    gitIn(project, 'config', 'user.name', 'Test User');
    const result = hook({ tool_input: { file_path: 'notes.md' } });
    assert.equal(result.status, 0);
    assert.match(entries()[0], entryPattern('notes.md', { branch: 'empty-branch', subject: 'unknown', commit: 'unknown' }));
  });
});

describe('vault-sync --session-start', () => {
  it('appends a session START line in UTC to sessions.log, creating it when needed', () => {
    makeRepo(project);
    const logPath = path.join(changelogDir(), 'sessions.log');
    assert.equal(run(['--session-start']).status, 0);
    assert.equal(run(['--session-start']).status, 0);
    const lines = readFileSync(logPath, 'utf8').split('\n').filter(Boolean);
    assert.equal(lines.length, 2);
    for (const line of lines) assert.match(line, new RegExp(`^- session START ${ENTRY_TIME}$`));
    assert.deepEqual(changelogFiles(), []);
  });
});

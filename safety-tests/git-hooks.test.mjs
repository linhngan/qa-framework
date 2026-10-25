// Isolated checks for the Task 08 Git hooks: scripts/git-hooks/scan-staged.mjs,
// scripts/git-hooks/pre-push-check.mjs and the shared lint scope. Each test builds a
// throwaway Git repository under the OS temp folder with its own HOME and Git config.
// No browser, no network, no remote: pre-push stdin is simulated, and `npm` is a
// fake on PATH that only records its arguments. Secret samples are made up and
// assembled from pieces, so this file passes the scan it tests.
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const SCAN = path.join(REPO, 'scripts/git-hooks/scan-staged.mjs');
const PRE_PUSH = path.join(REPO, 'scripts/git-hooks/pre-push-check.mjs');
const GUARD = path.join(REPO, 'scripts/hooks/guard.mjs');
const BLOCKED = 'pre-commit: BLOCKED — ';
const ZERO = '0'.repeat(40);
const SHA = 'a'.repeat(40);

// Made-up samples, one per detector kind. Never real credentials.
const SAMPLES = [
  { kind: 'a Slack bot token', token: ['xo', 'xb-', '0000000000-FAKE-SAMPLE'].join('') },
  { kind: 'an Atlassian API token', token: ['ATA', 'TT', '3xFAKE0SAMPLE0VALUE'].join('') },
  { kind: 'an AWS access key ID', token: ['AK', 'IA', 'FAKESAMPLE000000'].join('') },
  { kind: 'a private key', token: ['-----BEGIN ', 'PRIVATE', ' KEY-----', '\nFAKE-SAMPLE\n'].join('') },
];

let sandbox;
let project;
let env;

beforeEach(() => {
  sandbox = mkdtempSync(path.join(tmpdir(), 'git-hooks-'));
  const home = path.join(sandbox, 'home');
  project = path.join(sandbox, 'project');
  mkdirSync(home);
  mkdirSync(project);
  const gitconfig = path.join(sandbox, 'gitconfig');
  writeFileSync(gitconfig, '[user]\n\tname = Test User\n\temail = test@example.invalid\n');
  env = {
    PATH: process.env.PATH,
    HOME: home,
    GIT_CONFIG_GLOBAL: gitconfig,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CEILING_DIRECTORIES: sandbox,
  };
  git('init', '-q', '-b', 'test-branch');
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

function git(...args) {
  return execFileSync('git', args, { cwd: project, env, encoding: 'utf8' });
}

function put(rel, content) {
  const file = path.join(project, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
}

function stage(rel, content) {
  put(rel, content);
  git('add', '--', rel);
}

function scan() {
  return spawnSync(process.execPath, [SCAN], { cwd: project, env, encoding: 'utf8' });
}

function assertClean(result) {
  assert.equal(result.status, 0, `exit code (stderr: ${result.stderr})`);
  assert.equal(result.stderr, '');
}

function assertBlocked(result, ...fragments) {
  assert.equal(result.status, 1, `exit code (stderr: ${result.stderr})`);
  assert.ok(result.stderr.startsWith(BLOCKED), `starts with the prefix: ${result.stderr}`);
  for (const fragment of fragments)
    assert.ok(result.stderr.includes(fragment), `mentions ${fragment}: ${result.stderr}`);
}

describe('scan-staged: file names', () => {
  it('passes a clean new file', () => {
    stage('tests/blog/new.spec.ts', "test('x', () => {});\n");
    assertClean(scan());
  });

  for (const rel of [
    '.env',
    '.env.local',
    'config/.env.production',
    'certs/server.pem',
    'a.key',
    'b.p12',
    'id_rsa',
    'keys/id_ed25519',
  ]) {
    it(`refuses a staged ${rel}`, () => {
      stage(rel, 'PLACEHOLDER=\n');
      assertBlocked(scan(), `${rel} is a protected secret file`);
    });
  }

  it('passes a placeholder-only .env.example', () => {
    stage('.env.example', 'JIRA_BASE_URL=\nJIRA_EMAIL=\nJIRA_API_TOKEN=<your token>\n');
    assertClean(scan());
  });

  it('still scans the content of .env.example', () => {
    stage('.env.example', `JIRA_API_TOKEN=${SAMPLES[1].token}\n`);
    assertBlocked(scan(), '.env.example:1 looks like an Atlassian API token');
  });

  it('reads NUL-delimited names: spaces, quotes and a newline in the path', () => {
    const rel = 'notes/odd "name"\nwith space.txt';
    stage(rel, `x\n${SAMPLES[2].token}\n`);
    assertBlocked(scan(), `${rel}:2 looks like an AWS access key ID`);
  });
});

describe('scan-staged: content', () => {
  for (const { kind, token } of SAMPLES) {
    it(`refuses ${kind} without printing the value`, () => {
      stage('pages/Sample.ts', `// line 1\nconst value = '${token}';\n`);
      const result = scan();
      assertBlocked(result, `pages/Sample.ts:2 looks like ${kind}`);
      assert.ok(!result.stderr.includes(token.trim()), 'the matched value is not printed');
      assert.equal(result.stdout, '');
    });
  }

  it('checks the staged version, not the working tree', () => {
    stage('pages/Sample.ts', `const v = '${SAMPLES[0].token}';\n`);
    put('pages/Sample.ts', 'const v = process.env.TOKEN;\n'); // cleaned only on disk
    assertBlocked(scan(), 'pages/Sample.ts:1 looks like a Slack bot token');
  });

  it('ignores a token that exists only in unstaged changes', () => {
    stage('pages/Sample.ts', 'const v = process.env.TOKEN;\n');
    put('pages/Sample.ts', `const v = '${SAMPLES[0].token}';\n`);
    assertClean(scan());
  });

  it('allows removing a file that contained a token', () => {
    stage('pages/Old.ts', `const v = '${SAMPLES[2].token}';\n`);
    git('commit', '-q', '-m', 'fixture with a fake token');
    git('rm', '-q', '--', 'pages/Old.ts');
    assertClean(scan());
  });

  it('reports every problem in one run', () => {
    stage('.env', 'X=\n');
    stage('a.ts', `'${SAMPLES[0].token}'\n`);
    stage('b.ts', `'${SAMPLES[3].token}'\n`);
    const result = scan();
    assertBlocked(result, '.env is a protected', 'a.ts:1', 'b.ts:1');
    assert.equal(result.stderr.trim().split('\n').length, 3);
  });

  it('passes its own detector sources: scanner, guard and their tests are scanned, not excluded', () => {
    for (const rel of [
      'scripts/git-hooks/scan-staged.mjs',
      'scripts/hooks/guard.mjs',
      'safety-tests/guard.test.mjs',
      'safety-tests/git-hooks.test.mjs',
    ]) {
      mkdirSync(path.dirname(path.join(project, rel)), { recursive: true });
      copyFileSync(path.join(REPO, rel), path.join(project, rel));
      git('add', '--', rel);
    }
    assertClean(scan());
  });

  it('fails closed outside a Git repository', () => {
    const outside = path.join(sandbox, 'not-a-repo');
    mkdirSync(outside);
    const result = spawnSync(process.execPath, [SCAN], { cwd: outside, env, encoding: 'utf8' });
    assertBlocked(result, 'could not read the staged files');
  });
});

describe('scan-staged and the Task 06 guard agree', () => {
  for (const { kind, token } of SAMPLES) {
    it(`both refuse ${kind}`, () => {
      const event = JSON.stringify({
        hook_event_name: 'PreToolUse',
        tool_name: 'Write',
        tool_input: { file_path: path.join(project, 'pages/Sample.ts'), content: token },
      });
      const guard = spawnSync(process.execPath, [GUARD], {
        input: event,
        encoding: 'utf8',
        env: { PATH: env.PATH, CLAUDE_PROJECT_DIR: project },
      });
      assert.equal(guard.status, 2, guard.stderr);
      stage('pages/Sample.ts', token);
      assertBlocked(scan(), kind);
    });
  }
});

describe('pre-push-check', () => {
  let npmLog;

  // A fake npm on PATH: records each call; FAKE_NPM_FAIL names a script that fails.
  beforeEach(() => {
    const bin = path.join(sandbox, 'bin');
    mkdirSync(bin);
    npmLog = path.join(sandbox, 'npm.log');
    writeFileSync(npmLog, '');
    const fake = path.join(bin, 'npm');
    writeFileSync(
      fake,
      `#!/bin/sh\nprintf '%s\\n' "$*" >> "${npmLog}"\n[ -n "$FAKE_NPM_FAIL" ] && [ "$2" = "$FAKE_NPM_FAIL" ] && exit 3\nexit 0\n`,
    );
    chmodSync(fake, 0o755);
    env.PATH = `${bin}${path.delimiter}${process.env.PATH}`;
  });

  function prePush(stdin, extraEnv = {}) {
    return spawnSync(process.execPath, [PRE_PUSH, 'origin', 'git@example.invalid:repo.git'], {
      cwd: project,
      input: stdin,
      encoding: 'utf8',
      env: { ...env, ...extraEnv },
    });
  }

  const npmCalls = () => readFileSync(npmLog, 'utf8').trim().split('\n').filter(Boolean);
  const line = (local, remote, localSha = SHA) => `${local} ${localSha} ${remote} ${ZERO}\n`;

  it('allows a feature branch, then runs typecheck and the dev test listing', () => {
    const result = prePush(line('refs/heads/week-2', 'refs/heads/week-2'));
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(npmCalls(), ['run typecheck', 'run test:list']);
  });

  it('refuses refs/heads/main even when the local branch has another name', () => {
    const result = prePush(line('refs/heads/week-2', 'refs/heads/main'));
    assert.equal(result.status, 1);
    assert.match(result.stderr, /pre-push: BLOCKED — this push updates refs\/heads\/main/);
    assert.deepEqual(npmCalls(), [], 'no checks run after a refusal');
  });

  it('refuses deleting main', () => {
    const result = prePush(line('(delete)', 'refs/heads/main', ZERO));
    assert.equal(result.status, 1);
  });

  it('refuses when any one of several refs is main', () => {
    const result = prePush(line('refs/heads/a', 'refs/heads/a') + line('refs/heads/b', 'refs/heads/main'));
    assert.equal(result.status, 1);
  });

  it('allows names that only resemble main', () => {
    const result = prePush(line('refs/heads/x', 'refs/heads/main-backup') + line('refs/tags/main', 'refs/tags/main'));
    assert.equal(result.status, 0, result.stderr);
  });

  it('ALLOW_MAIN_PUSH=1 lifts the refusal and still runs the checks', () => {
    const result = prePush(line('refs/heads/main', 'refs/heads/main'), { ALLOW_MAIN_PUSH: '1' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /ALLOW_MAIN_PUSH=1 is set/);
    assert.deepEqual(npmCalls(), ['run typecheck', 'run test:list']);
  });

  for (const value of ['true', 'yes', '0', '']) {
    it(`ALLOW_MAIN_PUSH=${JSON.stringify(value)} does not lift it`, () => {
      const result = prePush(line('refs/heads/main', 'refs/heads/main'), { ALLOW_MAIN_PUSH: value });
      assert.equal(result.status, 1);
    });
  }

  it('stops when typecheck fails, before the listing', () => {
    const result = prePush(line('refs/heads/week-2', 'refs/heads/week-2'), { FAKE_NPM_FAIL: 'typecheck' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /npm run typecheck failed \(exit 3\)/);
    assert.deepEqual(npmCalls(), ['run typecheck']);
  });

  it('fails when the listing fails', () => {
    const result = prePush(line('refs/heads/week-2', 'refs/heads/week-2'), { FAKE_NPM_FAIL: 'test:list' });
    assert.equal(result.status, 1);
    assert.deepEqual(npmCalls(), ['run typecheck', 'run test:list']);
  });
});

describe('lint scope', () => {
  const EXCLUDED = [
    'evidence/task01-raw-draft.ts',
    'jira-seed/jira-seed.json',
    'jira-seed/fixtures/drift.json',
    'scripts/jira-seed.mjs',
  ];
  const ACTIVE = [
    'tests/blog/home.smoke.spec.ts',
    'pages/BasePage.ts',
    'scripts/hooks/guard.mjs',
    'safety-tests/guard.test.mjs',
  ];

  it('lint-staged skips the excluded paths and keeps active files', async () => {
    const { default: config } = await import(path.join(REPO, 'lint-staged.config.mjs'));
    const abs = (files) => files.map((f) => path.join(process.cwd(), f));
    assert.deepEqual(config['*.{ts,mjs}'](abs(EXCLUDED.filter((f) => /\.(ts|mjs)$/.test(f)))), []);
    assert.deepEqual(config['*.{json,yml,yaml}'](abs(['jira-seed/jira-seed.json'])), []);
    const commands = config['*.{ts,mjs}'](abs(ACTIVE));
    assert.equal(commands.length, 2);
    for (const file of ACTIVE) assert.ok(commands[0].includes(file), `eslint gets ${file}`);
  });

  it('.prettierignore lists the same exclusions', () => {
    const lines = readFileSync(path.join(REPO, '.prettierignore'), 'utf8').split('\n');
    for (const entry of ['evidence/*-raw-draft.ts', 'jira-seed/', 'scripts/jira-seed.mjs']) {
      assert.ok(lines.includes(entry), `.prettierignore has ${entry}`);
    }
  });
});

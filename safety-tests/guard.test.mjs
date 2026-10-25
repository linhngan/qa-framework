// Isolated checks for scripts/hooks/guard.mjs. Each test pipes simulated PreToolUse
// JSON into the script with spawnSync's input option. Nothing is edited or applied:
// file paths point into a project folder that does not exist, and no file is opened.
// No browser, no network. Secret samples are made up and assembled from pieces.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const GUARD = fileURLToPath(new URL('../scripts/hooks/guard.mjs', import.meta.url));
const ROOT = path.join(tmpdir(), 'guard-test-project-not-created');
const SPEC = 'tests/blog/home.smoke.spec.ts';
const PREFIX = 'guard: BLOCKED — ';

// Made-up samples, one per detector kind. Never real credentials.
const SAMPLES = [
  { kind: 'a Slack bot token', token: ['xo', 'xb-', '0000000000-FAKE-SAMPLE'].join('') },
  { kind: 'an Atlassian API token', token: ['ATA', 'TT', '3xFAKE0SAMPLE0VALUE'].join('') },
  { kind: 'an AWS access key ID', token: ['AK', 'IA', 'FAKESAMPLE000000'].join('') },
  { kind: 'a private key', token: ['-----BEGIN ', 'PRIVATE', ' KEY-----', '\nFAKE-SAMPLE\n'].join('') },
];

const IMPORT_LINE = "import { BlogListPage } from '../../pages/BlogListPage';\n";
const BANNER_CHECKS =
  "    await expect(blog.banner).toBeVisible();\n    await expect(blog.banner).toContainText('DEVELOPMENT');\n";

function runGuard(input, options = {}) {
  return spawnSync(process.execPath, [GUARD], {
    cwd: tmpdir(),
    input,
    encoding: 'utf8',
    env: { PATH: process.env.PATH, CLAUDE_PROJECT_DIR: ROOT },
    ...options,
  });
}

function abs(file) {
  return path.join(ROOT, file);
}

function edit(file, oldString, newString) {
  return JSON.stringify({
    hook_event_name: 'PreToolUse',
    tool_name: 'Edit',
    tool_input: { file_path: abs(file), old_string: oldString, new_string: newString },
  });
}

function write(file, content, filePath = abs(file)) {
  return JSON.stringify({
    hook_event_name: 'PreToolUse',
    tool_name: 'Write',
    tool_input: { file_path: filePath, content },
  });
}

function assertBlocked(result, ...fragments) {
  assert.equal(result.status, 2, `exit code (stderr: ${result.stderr})`);
  assert.equal(result.stdout, '');
  assert.ok(result.stderr.startsWith(PREFIX), `reason starts with the prefix: ${result.stderr}`);
  assert.ok(result.stderr.endsWith('\n') && !result.stderr.slice(0, -1).includes('\n'), 'exactly one stderr line');
  for (const fragment of fragments)
    assert.ok(result.stderr.includes(fragment), `reason mentions ${fragment}: ${result.stderr}`);
}

function assertAllowed(result) {
  assert.equal(result.status, 0, `exit code (stderr: ${result.stderr})`);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
}

describe('guard quick sample', () => {
  it('protected-file Write to .env → 2', () => {
    assertBlocked(runGuard(write('.env', 'PLACEHOLDER=1\n')), '.env is a protected secret file (.env)');
  });

  it('Edit removing an assertion from a spec → 2', () => {
    const result = runGuard(edit(SPEC, BANNER_CHECKS, '    await expect(blog.banner).toBeVisible();\n'));
    assertBlocked(result, `this edit to ${SPEC} removes expect( calls (old 2, new 1)`);
  });

  it('ordinary comment-only Edit of a spec → 0', () => {
    assertAllowed(runGuard(edit(SPEC, IMPORT_LINE, `${IMPORT_LINE}// Task 06 sample comment\n`)));
  });
});

describe('guard initial checks: one blocked and one allowed example each', () => {
  it('1 protected filename, blocked: .env, .env.*, *.pem, *.key, *.p12, id_rsa, id_ed25519, Windows separators', () => {
    for (const file of [
      '.env',
      '.env.local',
      'certs/server.pem',
      'config/api.key',
      'keys/client.p12',
      '.ssh/id_rsa',
      '.ssh/id_ed25519',
    ]) {
      assertBlocked(
        runGuard(write(file, 'PLACEHOLDER\n')),
        `${file} is a protected secret file (${path.basename(file)})`,
      );
    }
    assertBlocked(
      runGuard(write('', 'X=1\n', 'C:\\work\\project\\.env')),
      'C:/work/project/.env is a protected secret file (.env)',
    );
    assertBlocked(runGuard(edit('.env.local', 'A=1\n', 'A=2\n')), '.env.local is a protected secret file');
  });

  it('1 protected filename, allowed: .env.example and ordinary names', () => {
    assertAllowed(runGuard(write('.env.example', 'API_URL=https://example.invalid\n')));
    assertAllowed(runGuard(write('src/environment.ts', 'export const env = 1;\n')));
  });

  it('2 secret-looking new content, blocked: each detector kind, in Write content and Edit new_string', () => {
    for (const { kind, token } of SAMPLES) {
      for (const input of [
        write('notes/sample.md', `value: ${token}\n`),
        edit('notes/sample.md', 'value: TBD\n', `value: ${token}\n`),
      ]) {
        const result = runGuard(input);
        assertBlocked(result, `new text for notes/sample.md looks like ${kind}`);
        assert.ok(!result.stderr.includes(token.trim()), 'the reason never repeats the sample');
      }
    }
  });

  it('2 secret-looking new content, allowed: similar text that is not a detector string', () => {
    const publicKeyHeader = ['-----BEGIN ', 'PUBLIC', ' KEY-----'].join('');
    assertAllowed(runGuard(write('notes/sample.md', `${publicKeyHeader}\nTOKEN_PLACEHOLDER\n`)));
  });

  it('3 .only added to a spec, blocked', () => {
    const result = runGuard(
      edit(SPEC, "  test('banner is visible', async () => {\n", "  test.only('banner is visible', async () => {\n"),
    );
    assertBlocked(result, `${SPEC} would gain .only`);
  });

  it('3 .only, allowed: spec edit without .only', () => {
    assertAllowed(
      runGuard(edit(SPEC, "  test('banner is visible', async () => {\n", "  test('banner is shown', async () => {\n")),
    );
  });

  it('4 .skip added to a spec, blocked', () => {
    const result = runGuard(
      edit(SPEC, "  test('banner is visible', async () => {\n", "  test.skip('banner is visible', async () => {\n"),
    );
    assertBlocked(result, `${SPEC} would gain .skip`);
  });

  it('4 .skip, allowed: spec edit without .skip', () => {
    assertAllowed(runGuard(edit(SPEC, '  let blog: BlogListPage;\n', '  let blog: BlogListPage; // page object\n')));
  });

  it('5 fewer expect( calls, blocked: a separate assertion deletion', () => {
    const oldString = "    await expect(blog.banner).toContainText('DEVELOPMENT');\n  });\n";
    assertBlocked(runGuard(edit(SPEC, oldString, '  });\n')), 'removes expect( calls (old 1, new 0)');
  });

  it('5 fewer expect( calls, allowed: a combined edit that moves an assertion keeps its count', () => {
    const oldString =
      "    await expect(blog.banner).toBeVisible();\n    await expect(blog.banner).toContainText('DEVELOPMENT');\n";
    const newString =
      "    await expect(blog.banner).toContainText('DEVELOPMENT');\n    await expect(blog.banner).toBeVisible();\n";
    assertAllowed(runGuard(edit(SPEC, oldString, newString)));
  });

  it('6 fewer runIfEnv( or envGuard( calls, blocked: each helper removed on its own', () => {
    assertBlocked(
      runGuard(edit(SPEC, "  runIfEnv(test, ['dev']);\n\n  let blog: BlogListPage;\n", '  let blog: BlogListPage;\n')),
      'removes runIfEnv( calls (old 1, new 0)',
    );
    assertBlocked(
      runGuard(
        edit(SPEC, '    await envGuard(() => article.postComment(text));\n', '    await article.postComment(text);\n'),
      ),
      'removes envGuard( calls (old 1, new 0)',
    );
  });

  it('6 fewer runIfEnv( or envGuard( calls, allowed: an edit next to the helpers keeps both counts', () => {
    const oldString = "  runIfEnv(test, ['dev']);\n  await envGuard(() => a());\n";
    const newString = "  runIfEnv(test, ['dev']);\n  // wrapped write\n  await envGuard(() => a());\n";
    assertAllowed(runGuard(edit(SPEC, oldString, newString)));
  });
});

describe('guard hard-wait check (7)', () => {
  const HARD_WAIT = 'waitForTimeout(';

  it('7 hard wait added to a spec, blocked: Edit adding waitForTimeout(', () => {
    const result = runGuard(
      edit(SPEC, '    await blog.open();\n', '    await blog.open();\n    await page.waitForTimeout(2000);\n'),
    );
    assertBlocked(result, `${SPEC} would gain ${HARD_WAIT}`, 'Wait for the condition the test actually needs');
  });

  it('7 hard wait, allowed: Edit adding a condition-based wait', () => {
    const newString =
      "    await blog.open();\n    await page.waitForURL('**/blog');\n    await expect(blog.banner).toBeVisible();\n";
    assertAllowed(runGuard(edit(SPEC, '    await blog.open();\n', newString)));
  });

  it('7 hard wait, Write blocked: waitForTimeout( anywhere in whole spec content', () => {
    const content =
      "import { test } from '@playwright/test';\ntest('a', async ({ page }) => {\n  await page.waitForTimeout(500);\n});\n";
    assertBlocked(runGuard(write(SPEC, content)), `${SPEC} would gain ${HARD_WAIT}`);
  });

  it('7 hard wait, Write allowed: whole spec content that waits only on conditions', () => {
    const content =
      "import { test, expect } from '@playwright/test';\ntest('a', async ({ page }) => {\n  await page.waitForURL('**/blog');\n  await expect(page.getByRole('heading')).toBeVisible();\n});\n";
    assertAllowed(runGuard(write(SPEC, content)));
  });

  it('7 runs before the removal checks: adding a hard wait while deleting an assertion gets the hard-wait reason', () => {
    const result = runGuard(
      edit(SPEC, '    await expect(blog.banner).toBeVisible();\n', '    await page.waitForTimeout(1000);\n'),
    );
    assertBlocked(result, `would gain ${HARD_WAIT}`);
  });

  it('known limit: waitForTimeout( already in the old text is not reported again', () => {
    assertAllowed(
      runGuard(edit(SPEC, '  await page.waitForTimeout(500);\n', '  await page.waitForTimeout(500); // legacy\n')),
    );
  });

  it('known limit: the hard-wait check covers only *.spec.ts files', () => {
    assertAllowed(
      runGuard(
        edit(
          'pages/BasePage.ts',
          '  async open() {}\n',
          '  async open() {\n    await this.page.waitForTimeout(500);\n  }\n',
        ),
      ),
    );
  });

  it('known limit: a space before the bracket is not matched (plain substring)', () => {
    assertAllowed(
      runGuard(
        edit(SPEC, '    await blog.open();\n', '    await blog.open();\n    await page.waitForTimeout (500);\n'),
      ),
    );
  });
});

describe('guard edge cases', () => {
  it('malformed or unreadable input → 0, silent', () => {
    const inputs = [
      '',
      '{not json',
      'null',
      '[]',
      '{}',
      '{"tool_name":"Edit"}',
      JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: 42, old_string: 'a', new_string: 'b' } }),
      JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: abs('.env'), new_string: 'b' } }),
      JSON.stringify({ tool_name: 'Write', tool_input: { file_path: '', content: 'x' } }),
    ];
    for (const input of inputs) assertAllowed(runGuard(input));
    assertAllowed(runGuard(undefined, { stdio: ['ignore', 'pipe', 'pipe'] }));
  });

  it('removes all leading byte-order marks before parsing', () => {
    assertBlocked(runGuard(`\uFEFF\uFEFF${write('.env', 'X=1\n')}`), 'protected secret file (.env)');
  });

  it('other tools are not examined', () => {
    for (const tool of ['Bash', 'NotebookEdit', 'Read']) {
      assertAllowed(
        runGuard(JSON.stringify({ tool_name: tool, tool_input: { file_path: abs('.env'), command: 'echo hi' } })),
      );
    }
  });

  it('counts the helpers separately: removing one while adding the other still blocks', () => {
    assertBlocked(
      runGuard(edit(SPEC, "  runIfEnv(test, ['dev']);\n", '  await envGuard(() => a());\n')),
      'removes runIfEnv( calls (old 1, new 0)',
    );
    assertBlocked(
      runGuard(edit(SPEC, '  await envGuard(() => a());\n', "  runIfEnv(test, ['dev']);\n")),
      'removes envGuard( calls (old 1, new 0)',
    );
  });

  it('.env.example is exempt from the filename check only, not the content check', () => {
    assertBlocked(
      runGuard(write('.env.example', `TOKEN=${SAMPLES[0].token}\n`)),
      'new text for .env.example looks like a Slack bot token',
    );
  });

  it('checks run in order and report one reason: a protected file with secret content gets the filename reason', () => {
    assertBlocked(runGuard(write('.env', `TOKEN=${SAMPLES[2].token}\n`)), 'protected secret file (.env)');
  });

  it('Write treats old text as empty: .only or .skip anywhere in a spec blocks', () => {
    assertBlocked(runGuard(write(SPEC, "test.only('a', () => {});\n")), `${SPEC} would gain .only`);
    assertBlocked(runGuard(write(SPEC, "test.skip('a', () => {});\n")), `${SPEC} would gain .skip`);
  });

  it('known limit: a whole-file Write cannot be checked for removed assertions or helpers', () => {
    assertAllowed(runGuard(write(SPEC, "import { test } from '@playwright/test';\ntest('empty', async () => {});\n")));
  });

  it('known limit: .only or .skip already in the old text is not reported again', () => {
    assertAllowed(runGuard(edit(SPEC, "test.only('a', () => {});\n", "test.only('a renamed', () => {});\n")));
    assertAllowed(runGuard(edit(SPEC, "test.skip('a', () => {});\n", "test.skip('a renamed', () => {});\n")));
  });

  it('known limit: .only, .skip and removals are checked only in *.spec.ts files', () => {
    assertAllowed(runGuard(edit('pages/BasePage.ts', 'expect(a);\n', "test.only('x');\n")));
  });

  it('known limit: filename matching is case-sensitive', () => {
    assertAllowed(runGuard(write('.ENV', 'X=1\n')));
  });
});

// Task 09: an allowed Edit or Write of a CRITICAL path prints one JSON reminder on
// stdout and exits 0. Every payload below is simulated; no critical file is edited.
describe('guard critical-path warning (Task 09)', () => {
  const REPO = fileURLToPath(new URL('..', import.meta.url));
  const WARNING = 'guard: WARN — shared file; review the affected callers before approving';
  // Same 30 paths as CRITICAL_PATHS in scripts/hooks/guard.mjs, kept in step by hand.
  const CRITICAL = [
    'env/target.ts',
    'env/runIfEnv.ts',
    'env/envGuard.ts',
    'tests/support/env.ts',
    'playwright.config.ts',
    'package.json',
    '.gitignore',
    '.claude/settings.json',
    '.husky/pre-commit',
    '.husky/pre-push',
    'scripts/hooks/guard.mjs',
    'scripts/hooks/session-preflight.mjs',
    'scripts/hooks/stop-worklog.mjs',
    'scripts/vault-sync.mjs',
    'scripts/git-hooks/scan-staged.mjs',
    'scripts/git-hooks/pre-push-check.mjs',
    'scripts/jira-seed.mjs',
    'CLAUDE.md',
    '.claude/rules/01-guardrails.md',
    'safety/target.test.ts',
    'safety/helpers.test.ts',
    'safety/types.check.ts',
    'safety/support/child.ts',
    'safety/fixtures/helpers-child.ts',
    'safety/fixtures/playwright/playwright.config.ts',
    'safety/fixtures/playwright/run-if-env.fixture.ts',
    'safety-tests/guard.test.mjs',
    'safety-tests/vault-log.test.mjs',
    'safety-tests/worklog.test.mjs',
    'safety-tests/git-hooks.test.mjs',
  ];
  const HOOK_CLASS = [
    'scripts/hooks/guard.mjs',
    'scripts/hooks/session-preflight.mjs',
    'scripts/hooks/stop-worklog.mjs',
    'scripts/vault-sync.mjs',
    'scripts/git-hooks/scan-staged.mjs',
    'scripts/git-hooks/pre-push-check.mjs',
  ];

  function assertWarned(result) {
    assert.equal(result.status, 0, `exit code (stderr: ${result.stderr})`);
    assert.equal(result.stderr, '');
    assert.ok(result.stdout.endsWith('\n') && !result.stdout.slice(0, -1).includes('\n'), 'one stdout line');
    const output = JSON.parse(result.stdout);
    assert.deepEqual(output, {
      systemMessage: WARNING,
      hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: WARNING },
    });
    assert.ok(!result.stdout.includes('permissionDecision'), 'no permission decision');
  }

  const editAt = (filePath) =>
    JSON.stringify({
      hook_event_name: 'PreToolUse',
      tool_name: 'Edit',
      tool_input: { file_path: filePath, old_string: 'a\n', new_string: 'b\n' },
    });
  const writeAt = (filePath) =>
    JSON.stringify({
      hook_event_name: 'PreToolUse',
      tool_name: 'Write',
      tool_input: { file_path: filePath, content: 'x\n' },
    });

  it('every listed path exists in the project', () => {
    assert.equal(CRITICAL.length, 30);
    for (const rel of CRITICAL) assert.ok(existsSync(path.join(REPO, rel)), `${rel} exists`);
  });

  it('includes the reviewed additional class: the six hook and automation scripts', () => {
    for (const rel of HOOK_CLASS) assert.ok(CRITICAL.includes(rel), `${rel} is listed`);
    for (const rel of HOOK_CLASS) assertWarned(runGuard(edit(rel, 'a\n', 'b\n')));
  });

  for (const rel of CRITICAL) {
    it(`warns for an allowed Edit and Write of ${rel}`, () => {
      assertWarned(runGuard(edit(rel, 'a\n', 'b\n')));
      assertWarned(runGuard(write(rel, 'x\n')));
    });
  }

  it('normalizes the path: relative, ./, .., backslashes, case, a Windows-style root', () => {
    assertWarned(runGuard(editAt('env/target.ts')));
    assertWarned(runGuard(editAt('./env/target.ts')));
    assertWarned(runGuard(editAt(path.join(ROOT, 'env', '..', 'env', 'target.ts'))));
    assertWarned(runGuard(editAt(`${ROOT}/scripts/hooks/../hooks/guard.mjs`)));
    assertWarned(runGuard(editAt('env\\target.ts')));
    assertWarned(runGuard(editAt(path.join(ROOT, 'ENV', 'Target.ts'))));
    assertWarned(runGuard(writeAt(`${ROOT}/.claude/settings.json`)));
    assertWarned(
      runGuard(editAt('C:\\work\\qa-framework\\env\\envGuard.ts'), {
        env: { PATH: process.env.PATH, CLAUDE_PROJECT_DIR: 'C:\\work\\qa-framework\\' },
      }),
    );
  });

  it('ordinary edits stay silent: a spec, a SHARED Page Object, a FULL CONTROL note', () => {
    assertAllowed(runGuard(edit(SPEC, 'a\n', 'b\n')));
    assertAllowed(runGuard(edit('pages/BlogListPage.ts', 'a\n', 'b\n')));
    assertAllowed(runGuard(edit('pages/LoginPage.ts', 'a\n', 'b\n')));
    assertAllowed(runGuard(edit('tests/support/users.ts', 'a\n', 'b\n')));
    assertAllowed(runGuard(write('evidence/task09-note.md', '# note\n')));
  });

  it('look-alike and outside paths stay silent', () => {
    for (const rel of [
      'env/target.ts.bak',
      'env/target.tsx',
      'tests/env/target.ts',
      'other/env/target.ts',
      'safety-tests/guard.test.mjs.orig',
      '.husky/_/pre-commit',
    ]) {
      assertAllowed(runGuard(edit(rel, 'a\n', 'b\n')));
    }
    assertAllowed(runGuard(editAt(path.join(tmpdir(), 'elsewhere', 'env', 'target.ts'))));
    assertAllowed(runGuard(editAt('../env/target.ts')));
    assertAllowed(runGuard(editAt(`${ROOT}-copy/env/target.ts`)));
  });

  it('other tools and malformed input on a critical path stay silent', () => {
    for (const tool of ['Read', 'Bash', 'MultiEdit']) {
      assertAllowed(
        runGuard(JSON.stringify({ tool_name: tool, tool_input: { file_path: abs('env/target.ts'), command: 'x' } })),
      );
    }
    assertAllowed(runGuard(JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: abs('env/target.ts') } })));
    assertAllowed(runGuard('{not json'));
  });

  it('refusals come first: a critical path with a secret is refused, with no JSON on stdout', () => {
    assertBlocked(runGuard(write('scripts/hooks/guard.mjs', SAMPLES[3].token)), 'looks like a private key');
    assertBlocked(
      runGuard(edit('env/target.ts', 'a\n', `'${SAMPLES[1].token}'\n`)),
      'looks like an Atlassian API token',
    );
    assertBlocked(runGuard(edit('.claude/settings.json', 'a\n', SAMPLES[0].token)), 'looks like a Slack bot token');
  });

  it('known limit: checks 3–7 cover only *.spec.ts, and no spec is critical, so they never meet the warning', () => {
    assert.ok(!CRITICAL.some((rel) => rel.endsWith('.spec.ts')));
    assertWarned(runGuard(edit('env/runIfEnv.ts', "  test.skip(!ok, 'x');\n", "  test.skip(true, 'x');\n")));
  });
});

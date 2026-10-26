// Isolated checks for the Task 11 spec-note generator in scripts/vault-sync.mjs
// (--write, --check, --files, and the note refresh added to --from-hook).
//
// Disposable root: every test runs the real script against a fresh fixture project
// under the OS temp folder, passed explicitly as CLAUDE_PROJECT_DIR (the script's
// root comes from that variable, not from its own location). The tests prove it:
//   1. the fixture's real path is inside the temp folder and outside this repo;
//   2. the script's own summary line reports that fixture as its root;
//   3. a suite-level guard records this repo's vault/ files, Git status and index
//      tree before the suite and asserts they are byte-identical afterwards.
// Fixture specs are byte copies of the real tests/blog/*.spec.ts plus made-up
// bad specs. Nothing is executed, no browser starts, and no network is used.
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const SCRIPT = path.join(REPO, 'scripts/vault-sync.mjs');
const REAL_SPECS = [
  'tests/blog/article-detail.smoke.spec.ts',
  'tests/blog/categories.smoke.spec.ts',
  'tests/blog/category-filter.smoke.spec.ts',
  'tests/blog/home.smoke.spec.ts',
];
const HOME = 'tests/blog/home.smoke.spec.ts';
const HOME_NOTE = 'vault/tests/blog/home.smoke.md';

let sandbox; // holds home/, gitconfig and project/
let project; // the disposable fixture root
let env;

// ---- suite-level guard: the real repository must not change ----
function repoSnapshot() {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(path.join(REPO, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(rel);
      else
        files.push(
          `${rel} ${createHash('sha256')
            .update(readFileSync(path.join(REPO, rel)))
            .digest('hex')}`,
        );
    }
  };
  walk('vault');
  const git = (args) => execFileSync('git', args, { cwd: REPO, encoding: 'utf8' });
  return {
    vault: files.sort().join('\n'),
    status: git(['status', '--porcelain', '-z', '--untracked-files=all']),
    index: git(['write-tree']).trim(),
  };
}
let repoBefore;
before(() => {
  repoBefore = repoSnapshot();
});
after(() => {
  assert.deepEqual(repoSnapshot(), repoBefore, 'the real repository vault/, status and index are unchanged');
});

beforeEach(() => {
  sandbox = realpathSync(mkdtempSync(path.join(tmpdir(), 'vault-sync-')));
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
  execFileSync('git', ['init', '-q', '-b', 'test-branch'], { cwd: project, env });
  // The real specs and the Page Objects they import, so generated links resolve in the fixture.
  const pages = readdirSync(path.join(REPO, 'pages')).map((name) => `pages/${name}`);
  for (const rel of [...REAL_SPECS, ...pages]) {
    mkdirSync(path.dirname(path.join(project, rel)), { recursive: true });
    copyFileSync(path.join(REPO, rel), path.join(project, rel));
  }
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

function run(args, options = {}) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: project,
    encoding: 'utf8',
    input: options.input,
    env: { ...env, CLAUDE_PROJECT_DIR: project },
  });
}

const abs = (rel) => path.join(project, rel);
const read = (rel) => readFileSync(abs(rel));
const put = (rel, content) => {
  mkdirSync(path.dirname(abs(rel)), { recursive: true });
  writeFileSync(abs(rel), content);
};
function tree() {
  const out = [];
  const walk = (dir) => {
    if (!existsSync(abs(dir))) return;
    for (const entry of readdirSync(abs(dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(rel);
      else out.push(`${rel} ${createHash('sha256').update(read(rel)).digest('hex')}`);
    }
  };
  walk('tests');
  walk('vault');
  return out.sort().join('\n');
}
function assertExit(result, code) {
  assert.equal(result.status, code, `exit code (stdout: ${result.stdout} stderr: ${result.stderr})`);
}

const VALID = (title = 'Area (dev smoke)', test = 'user does a thing and sees it') =>
  `import { test, expect } from '@playwright/test';\n\ntest.describe('${title}', () => {\n  test('${test}', async ({ page }) => {\n    await expect(page).toHaveTitle(/x/);\n  });\n});\n`;

describe('disposable fixture root', () => {
  it('is a fresh folder inside the OS temp folder and outside this repository', () => {
    assert.ok(project.startsWith(`${realpathSync(tmpdir())}${path.sep}`), project);
    assert.ok(!project.startsWith(`${REPO}${path.sep}`) && project !== REPO);
    const top = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: project, env, encoding: 'utf8' }).trim();
    assert.equal(realpathSync(top), project);
  });

  it('the script reports the fixture as its root and writes only there', () => {
    const result = run(['--write']);
    assertExit(result, 0);
    assert.ok(result.stdout.includes(`vault-sync: --write root ${project}: 4 spec(s)`), result.stdout);
    assert.ok(existsSync(abs(HOME_NOTE)));
  });
});

describe('generator: missing → write → clean check', () => {
  it('reports every missing note, creates them, then checks clean', () => {
    const check1 = run(['--check']);
    assertExit(check1, 1);
    for (const rel of REAL_SPECS) {
      const note = `vault/tests/${rel.slice('tests/'.length, -'.spec.ts'.length)}.md`;
      assert.ok(check1.stderr.includes(`missing: ${note} does not match ${rel}`), check1.stderr);
    }
    assert.ok(!existsSync(abs('vault/tests')), '--check wrote nothing');

    const write = run(['--write']);
    assertExit(write, 0);
    assert.match(write.stdout, /4 spec\(s\), 0 ok, 4 written, 0 problem\(s\)/);

    const check2 = run(['--check']);
    assertExit(check2, 0);
    assert.match(check2.stdout, /4 spec\(s\), 4 ok, 0 written, 0 problem\(s\)/);
  });

  it('records source link, hash, parser status, literal titles and Page Object imports', () => {
    assertExit(run(['--write']), 0);
    const note = read(HOME_NOTE).toString('utf8');
    const hash = createHash('sha256').update(read(HOME)).digest('hex');
    assert.ok(note.startsWith('# Blog home (dev smoke)\n\n<!-- generated:start -->\n'));
    assert.ok(note.includes('- **Source:** [tests/blog/home.smoke.spec.ts](../../../tests/blog/home.smoke.spec.ts)'));
    assert.ok(note.includes(`- **SHA-256:** \`${hash}\``));
    assert.match(note, /- \*\*Parser:\*\* typescript \d+\.\d+\.\d+ · ok/);
    assert.ok(note.includes('  - Blog home (dev smoke) › banner is visible and identifies DEVELOPMENT'));
    assert.ok(note.includes('  - Blog home (dev smoke) › first article card is visible and at least one card exists'));
    assert.ok(note.includes('  - `BlogListPage` from [pages/BlogListPage.ts](../../../pages/BlogListPage.ts)'));
    assert.ok(note.endsWith('<!-- generated:end -->\n'));

    const categories = read('vault/tests/blog/categories.smoke.md').toString('utf8');
    assert.ok(categories.includes('  - `CategoriesPage` from [pages/CategoriesPage.ts]'));
    assert.ok(categories.includes('  - `LoginPage` from [pages/LoginPage.ts]'));
    assert.ok(!categories.includes('users'), 'tests/support/users is not a Page Object');
  });

  it('never executes a spec: a top-level side effect does not happen', () => {
    const marker = path.join(sandbox, 'executed.txt');
    put(
      'tests/side-effect.spec.ts',
      `import { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(marker)}, 'ran');\n${VALID()}`,
    );
    assertExit(run(['--write', '--files', 'tests/side-effect.spec.ts']), 0);
    assert.ok(!existsSync(marker), 'the spec was parsed, not run');
  });
});

describe('generator: stale → refresh → clean, and a second refresh changes nothing', () => {
  it('a harmless comment in the fixture source makes the note stale until refreshed', () => {
    assertExit(run(['--write']), 0);
    writeFileSync(abs(HOME), `${read(HOME).toString('utf8')}// harmless fixture comment\n`);

    const stale = run(['--check']);
    assertExit(stale, 1);
    assert.ok(stale.stderr.includes(`stale: ${HOME_NOTE} does not match ${HOME}`), stale.stderr);

    const refresh = run(['--write']);
    assertExit(refresh, 0);
    assert.ok(refresh.stdout.includes(`updated ${HOME_NOTE}`));
    assertExit(run(['--check']), 0);

    const before = tree();
    const again = run(['--write']);
    assertExit(again, 0);
    assert.match(again.stdout, /4 ok, 0 written/);
    assert.equal(tree(), before, 'a second refresh produces no diff');
  });

  it('--check never writes, even when notes are stale', () => {
    assertExit(run(['--write']), 0);
    writeFileSync(abs(HOME), `${read(HOME).toString('utf8')}// change\n`);
    const before = tree();
    assertExit(run(['--check']), 1);
    assert.equal(tree(), before);
  });
});

describe('generator: human text outside the markers', () => {
  it('survives a refresh byte for byte (CRLF, trailing spaces, non-ASCII, marker-like text)', () => {
    assertExit(run(['--write']), 0);
    const generated = read(HOME_NOTE).toString('utf8');
    const start = generated.indexOf('<!-- generated:start -->');
    const end = generated.indexOf('<!-- generated:end -->') + '<!-- generated:end -->'.length;
    const before = Buffer.from('# My own title  \r\n\r\nIntro with ünïcode — and a stray <!-- comment -->.\r\n\r\n');
    const afterText = Buffer.from('\r\n\r\n## What this spec checks\r\nKept exactly.   \r\n \r\n');
    put(HOME_NOTE, Buffer.concat([before, Buffer.from(generated.slice(start, end)), afterText]));

    writeFileSync(abs(HOME), `${read(HOME).toString('utf8')}// change\n`);
    assertExit(run(['--write', '--files', HOME]), 0);
    const note = read(HOME_NOTE);
    assert.ok(note.subarray(0, before.length).equals(before), 'text before the block is unchanged');
    assert.ok(note.subarray(note.length - afterText.length).equals(afterText), 'text after the block is unchanged');
    assertExit(run(['--check', '--files', HOME]), 0);
  });
});

describe('generator: damaged markers fail honestly', () => {
  const cases = {
    'no end marker': (b) => b.replace('<!-- generated:end -->', ''),
    'repeated start marker': (b) => `<!-- generated:start -->\n${b}`,
    'repeated block': (b) => `${b}\n${b}`,
    'end before start': (b) =>
      b
        .replace('<!-- generated:start -->', '@@START@@')
        .replace('<!-- generated:end -->', '<!-- generated:start -->')
        .replace('@@START@@', '<!-- generated:end -->'),
    'no markers at all': () => '# Hand-written note\n\nNo markers.\n',
  };
  for (const [name, damage] of Object.entries(cases)) {
    it(`refuses ${name}: --write exits 1 and leaves the note unchanged; --check exits 1`, () => {
      assertExit(run(['--write']), 0);
      put(HOME_NOTE, damage(read(HOME_NOTE).toString('utf8')));
      const damaged = read(HOME_NOTE);
      const write = run(['--write', '--files', HOME]);
      assertExit(write, 1);
      assert.match(
        write.stderr,
        /vault-sync: FAIL vault\/tests\/blog\/home\.smoke\.md: (damaged markers|no generated markers)/,
      );
      assert.ok(read(HOME_NOTE).equals(damaged), 'nothing was written');
      assertExit(run(['--check', '--files', HOME]), 1);
    });
  }
});

describe('generator: unsupported syntax fails honestly and creates no note', () => {
  const head = "import { test, expect } from '@playwright/test';\n";
  const cases = [
    [
      'dynamic describe title',
      `${head}const area = 'x';\ntest.describe(\`\${area} smoke\`, () => {\n  test('a', async () => {});\n});\n`,
      'dynamic title',
    ],
    [
      'dynamic test title (variable)',
      `${head}const t = 'a';\ntest.describe('A', () => {\n  test(t, async () => {});\n});\n`,
      'dynamic title',
    ],
    [
      'dynamic test title (concatenation)',
      `${head}test.describe('A', () => {\n  test('a' + 'b', async () => {});\n});\n`,
      'dynamic title',
    ],
    [
      'test.describe.only',
      `${head}test.describe.only('A', () => {\n  test('a', async () => {});\n});\n`,
      'unsupported wrapper: test.describe.only',
    ],
    [
      'test.describe.skip',
      `${head}test.describe.skip('A', () => {\n  test('a', async () => {});\n});\n`,
      'unsupported wrapper: test.describe.skip',
    ],
    [
      'test.describe.serial',
      `${head}test.describe.serial('A', () => {\n  test('a', async () => {});\n});\n`,
      'unsupported wrapper: test.describe.serial',
    ],
    [
      'nested describe',
      `${head}test.describe('A', () => {\n  test.describe('B', () => {\n    test('a', async () => {});\n  });\n});\n`,
      'nested test.describe',
    ],
    [
      'test.only',
      `${head}test.describe('A', () => {\n  test.only('a', async () => {});\n});\n`,
      'unsupported wrapper: test.only',
    ],
    [
      'test.skip',
      `${head}test.describe('A', () => {\n  test.skip('a', async () => {});\n});\n`,
      'unsupported wrapper: test.skip',
    ],
    [
      'tests in a forEach loop',
      `${head}test.describe('A', () => {\n  ['x', 'y'].forEach((n) => test(n, async () => {}));\n});\n`,
      'unsupported wrapper: test calls inside',
    ],
    [
      'tests in a for loop',
      `${head}test.describe('A', () => {\n  for (const n of ['x']) test(n, async () => {});\n});\n`,
      'unsupported wrapper: test calls inside ForOfStatement',
    ],
    ['top-level test', `${head}test('a', async () => {});\n`, 'unsupported wrapper: test(…) at top level'],
    [
      'test redefined with base.extend',
      "import { test as base } from '@playwright/test';\nconst test = base.extend({});\ntest.describe('A', () => {\n  test('a', async () => {});\n});\n",
      'test is redefined',
    ],
    ['no tests', `${head}test.describe('A', () => {});\n`, 'no tests found'],
    ['parse error', `${head}test.describe('A', () => {\n  test('a', async () => {\n});\n`, 'parse error'],
  ];
  for (const [name, source, expected] of cases) {
    it(`${name}: --write exits 1 with "${expected}"`, () => {
      put('tests/bad.spec.ts', source);
      const result = run(['--write', '--files', 'tests/bad.spec.ts']);
      assertExit(result, 1);
      assert.ok(result.stderr.includes(expected), result.stderr);
      assert.match(result.stderr, /vault-sync: FAIL tests\/bad\.spec\.ts:\d+ /);
      assert.ok(!existsSync(abs('vault/tests/bad.md')), 'no empty note is created');
      assertExit(run(['--check', '--files', 'tests/bad.spec.ts']), 1);
    });
  }

  it('an unsupported spec does not stop the other notes from being written, but the run fails', () => {
    put('tests/bad.spec.ts', `${head}test('a', async () => {});\n`);
    const result = run(['--write']);
    assertExit(result, 1);
    assert.ok(existsSync(abs(HOME_NOTE)));
    assert.match(result.stdout, /5 spec\(s\), 0 ok, 4 written, 1 problem\(s\)/);
  });
});

describe('generator: deleted and renamed sources need reviewed recovery', () => {
  it('a deleted spec with a note fails, keeps the note, and passes once the note is reviewed away', () => {
    assertExit(run(['--write']), 0);
    const note = read(HOME_NOTE);
    rmSync(abs(HOME));

    for (const args of [['--write'], ['--check'], ['--write', '--files', HOME], ['--check', '--files', HOME]]) {
      const result = run(args);
      assertExit(result, 1);
      assert.ok(result.stderr.includes(`source deleted: ${HOME} no longer exists. Review ${HOME_NOTE}`), result.stderr);
      assert.ok(read(HOME_NOTE).equals(note), 'the note and its human text are never erased');
    }

    mkdirSync(path.join(sandbox, 'archive'));
    renameSync(abs(HOME_NOTE), path.join(sandbox, 'archive', 'home.smoke.md')); // the reviewed removal
    const clean = run(['--check', '--files', HOME]);
    assertExit(clean, 0);
    assert.ok(clean.stdout.includes(`deleted spec ${HOME} has no note`));
    assertExit(run(['--check']), 0);
  });

  it('a renamed spec: the new note is created, the old one is reported until reviewed', () => {
    assertExit(run(['--write']), 0);
    const oldNote = read(HOME_NOTE);
    const NEW = 'tests/blog/home-renamed.smoke.spec.ts';
    renameSync(abs(HOME), abs(NEW));

    const check = run(['--check', '--files', HOME, NEW]);
    assertExit(check, 1);
    assert.ok(check.stderr.includes(`source deleted: ${HOME}`));
    assert.ok(check.stderr.includes('missing: vault/tests/blog/home-renamed.smoke.md'));

    const write = run(['--write', '--files', HOME, NEW]);
    assertExit(write, 1);
    assert.ok(existsSync(abs('vault/tests/blog/home-renamed.smoke.md')), 'the new note is written');
    assert.ok(read(HOME_NOTE).equals(oldNote), 'the old note is kept for review');

    mkdirSync(path.join(sandbox, 'archive'));
    renameSync(abs(HOME_NOTE), path.join(sandbox, 'archive', 'home.smoke.md'));
    assertExit(run(['--check', '--files', HOME, NEW]), 0);
  });

  it('a managed note whose source never existed is source-less', () => {
    assertExit(run(['--write']), 0);
    put('vault/tests/blog/ghost.md', read(HOME_NOTE));
    const result = run(['--check']);
    assertExit(result, 1);
    assert.ok(result.stderr.includes('source deleted: tests/blog/ghost.spec.ts no longer exists'));
  });
});

describe('arguments and paths', () => {
  const usage = [
    [['--write', '--check'], 'cannot be combined'],
    [['--check', '--write'], 'cannot be combined'],
    [['--write', '--bogus'], 'unknown option --bogus'],
    [['--check', '--stage', '--files', HOME], '--stage works only with --write'],
    [['--write', '--stage'], '--stage needs --files'],
    [['--write', '--stage', '--stage', '--files', HOME], '--stage given twice'],
    [['--links', '--write'], 'usage:'],
    [['--write', '--files'], '--files needs at least one spec path'],
    [['--write', '--files', HOME, '--files', HOME], '--files given twice'],
    [['--write', HOME], 'spec paths follow --files'],
    [['--files', HOME], 'choose --write or --check'],
    [['--check', '--files', '../outside.spec.ts'], 'is outside the project'],
    [['--check', '--files', '/etc/passwd.spec.ts'], 'is outside the project'],
    [['--check', '--files', 'vault/tests/blog/home.smoke.md'], 'is not a spec under tests/'],
    [['--check', '--files', 'pages/BlogListPage.ts'], 'is not a spec under tests/'],
    [['--check', '--files', 'tests/support/users.ts'], 'is not a spec under tests/'],
    [['--check', '--files', 'tests/../vault/x.spec.ts'], 'is not a spec under tests/'],
    [['--session-start', '--write'], 'usage:'],
    [['--from-hook', '--check'], 'usage:'],
    [[], 'usage:'],
  ];
  for (const [args, expected] of usage) {
    it(`${JSON.stringify(args)} → exit 2 (${expected})`, () => {
      const before = tree();
      const result = run(args, { input: '' });
      assertExit(result, 2);
      assert.ok(result.stderr.includes(expected), result.stderr);
      assert.equal(tree(), before, 'nothing written');
    });
  }

  it('a symbolic link given as a spec is refused', () => {
    symlinkSync(abs(HOME), abs('tests/blog/link.spec.ts'));
    const result = run(['--write', '--files', 'tests/blog/link.spec.ts']);
    assertExit(result, 2);
    assert.ok(result.stderr.includes('is not a regular file'));
  });

  it('accepts absolute and backslash paths inside the fixture and touches only the listed spec', () => {
    const result = run(['--write', '--files', abs(HOME), 'tests\\blog\\categories.smoke.spec.ts']);
    assertExit(result, 0);
    assert.ok(existsSync(abs(HOME_NOTE)) && existsSync(abs('vault/tests/blog/categories.smoke.md')));
    assert.ok(!existsSync(abs('vault/tests/blog/article-detail.smoke.md')), 'unlisted specs are untouched');
  });
});

describe('earlier modes', () => {
  const hookEvent = (rel) =>
    JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { file_path: abs(rel) } });

  it('--from-hook still logs, and refreshes an edited supported spec without staging it', () => {
    execFileSync('git', ['add', '--', HOME], { cwd: project, env });
    const result = run(['--from-hook'], { input: hookEvent(HOME) });
    assertExit(result, 0);
    assert.equal(result.stderr, '');
    const logs = readdirSync(abs('vault/_changelog')).filter((f) => f.endsWith('.md'));
    assert.equal(logs.length, 1);
    assert.ok(read(`vault/_changelog/${logs[0]}`).toString('utf8').includes(` · ${HOME} · `));
    assert.ok(existsSync(abs(HOME_NOTE)), 'note refreshed');
    const staged = execFileSync('git', ['diff', '--cached', '--name-only'], { cwd: project, env, encoding: 'utf8' });
    assert.equal(staged.trim(), HOME, 'only the spec staged earlier is in the index; the note is not staged');
  });

  it('--from-hook reports an unsupported spec, still logs, and exits 0', () => {
    put('tests/bad.spec.ts', "import { test } from '@playwright/test';\ntest('a', async () => {});\n");
    const result = run(['--from-hook'], { input: hookEvent('tests/bad.spec.ts') });
    assertExit(result, 0);
    assert.match(result.stderr, /^vault-sync: note not refreshed — tests\/bad\.spec\.ts:2 unsupported wrapper/);
    assert.ok(!existsSync(abs('vault/tests/bad.md')));
    assert.equal(readdirSync(abs('vault/_changelog')).filter((f) => f.endsWith('.md')).length, 1, 'still logged');
  });

  it('--from-hook ignores vault/ paths (loop protection): no log, no note', () => {
    const result = run(['--from-hook'], { input: hookEvent(HOME_NOTE) });
    assertExit(result, 0);
    assert.ok(!existsSync(abs('vault')));
  });

  it('--from-hook on a non-spec file logs only', () => {
    put('pages/BasePage.ts', 'export class BasePage {}\n');
    assertExit(run(['--from-hook'], { input: hookEvent('pages/BasePage.ts') }), 0);
    assert.ok(!existsSync(abs('vault/tests')));
  });

  it('session modes never generate notes', () => {
    assertExit(run(['--session-start']), 0);
    assertExit(run(['--session-end']), 0);
    assert.ok(existsSync(abs('vault/_changelog/sessions.log')));
    assert.ok(!existsSync(abs('vault/tests')));
  });
});

// ---- Task 11 stage 2: staging safety, the pre-commit helper and links ----

const SPEC_NOTES = path.join(REPO, 'scripts/git-hooks/spec-notes.mjs');
const gitP = (...args) => execFileSync('git', args, { cwd: project, env, encoding: 'utf8' });
// --no-renames lists both sides of a rename, so a moved note shows its old and new path.
const staged = () => gitP('diff', '--cached', '--no-renames', '--name-only', '-z').split('\0').filter(Boolean).sort();
const snapshot = () => ({
  index: gitP('write-tree').trim(),
  unstaged: gitP('diff', '--binary'),
  untracked: gitP('ls-files', '--others', '--exclude-standard', '-z'),
  files: tree(),
});

/** The pre-commit helper, started with a decoy CLAUDE_PROJECT_DIR to prove it uses the Git top level. */
function hook(step) {
  const decoy = path.join(sandbox, 'decoy');
  mkdirSync(decoy, { recursive: true });
  return spawnSync(process.execPath, [SPEC_NOTES, step], {
    cwd: project,
    encoding: 'utf8',
    env: { ...env, CLAUDE_PROJECT_DIR: decoy },
  });
}

/** A committed fixture: 4 specs, their notes, an unrelated tracked file and a Page Object. */
function committedFixture() {
  assertExit(run(['--write']), 0);
  put('notes.txt', 'unrelated tracked file\n');
  put('pages/BasePage.ts', 'export class BasePage {}\n');
  gitP('add', '-A');
  gitP('commit', '-q', '-m', 'fixture baseline');
}

describe('pre-commit staging safety (refused before any write)', () => {
  it('a partially staged spec', () => {
    committedFixture();
    put(HOME, `${read(HOME).toString('utf8')}// staged comment\n`);
    gitP('add', '--', HOME);
    put(HOME, `${read(HOME).toString('utf8')}// unstaged comment\n`);
    const before = snapshot();
    const pre = hook('precheck');
    assertExit(pre, 1);
    assert.ok(pre.stderr.includes(`pre-commit: BLOCKED — partially staged: ${HOME} has unstaged changes`));
    const direct = run(['--write', '--stage', '--files', HOME]);
    assertExit(direct, 1);
    assert.ok(direct.stdout.includes('nothing written or staged'));
    assert.deepEqual(snapshot(), before, 'index, unstaged diff, untracked files and file contents unchanged');
  });

  it('a related note with unstaged edits', () => {
    committedFixture();
    put(HOME, `${read(HOME).toString('utf8')}// staged comment\n`);
    gitP('add', '--', HOME);
    put(HOME_NOTE, `${read(HOME_NOTE).toString('utf8')}\nUnstaged human edit.\n`);
    const before = snapshot();
    const pre = hook('precheck');
    assertExit(pre, 1);
    assert.ok(pre.stderr.includes(`note has unstaged edits: ${HOME_NOTE}`));
    assertExit(run(['--write', '--stage', '--files', HOME]), 1);
    assert.deepEqual(snapshot(), before);
  });

  it('an existing untracked human note needs review', () => {
    committedFixture();
    const SPACE = 'tests/blog/with space.spec.ts';
    put(SPACE, VALID('Space (dev smoke)'));
    gitP('add', '--', SPACE);
    put('vault/tests/blog/with space.md', '# My own draft\n\nWritten by hand, not reviewed yet.\n');
    const before = snapshot();
    const pre = hook('precheck');
    assertExit(pre, 1);
    assert.ok(
      pre.stderr.includes('untracked note needs review: vault/tests/blog/with space.md exists but is not tracked'),
    );
    assert.deepEqual(snapshot(), before);
  });
});

describe('pre-commit refresh', () => {
  it('refreshes and stages only the selected note; unrelated staged, unstaged and untracked work is unchanged', () => {
    committedFixture();
    put('notes.txt', 'unrelated staged change\n');
    gitP('add', '--', 'notes.txt');
    put('pages/BasePage.ts', 'export class BasePage {} // unrelated unstaged change\n');
    put('scratch.txt', 'unrelated untracked file\n');
    put(HOME, `${read(HOME).toString('utf8')}// staged comment\n`);
    gitP('add', '--', HOME);
    const unstagedBefore = gitP('diff', '--binary');
    const stagedNotesBefore = gitP('show', ':notes.txt');

    assertExit(hook('precheck'), 0);
    const refresh = hook('refresh');
    assertExit(refresh, 0);
    assert.ok(refresh.stdout.includes(`vault-sync: staged ${HOME_NOTE}`), refresh.stdout);
    assert.ok(refresh.stdout.includes(`root ${project}`), 'the Git top level, not the decoy, is the root');
    assert.ok(!existsSync(path.join(sandbox, 'decoy', 'vault')), 'nothing written to the decoy');

    assert.deepEqual(
      staged(),
      [HOME, 'notes.txt', HOME_NOTE].sort(),
      'exactly the spec, its note and the unrelated staged file',
    );
    assert.equal(gitP('show', ':notes.txt'), stagedNotesBefore, 'unrelated staged content unchanged');
    assert.equal(gitP('diff', '--binary'), unstagedBefore, 'unrelated unstaged change unchanged and still unstaged');
    assert.equal(gitP('ls-files', '--others', '--exclude-standard'), 'scratch.txt\n', 'untracked file left alone');
    assert.equal(
      gitP('show', `:${HOME_NOTE}`),
      read(HOME_NOTE).toString('utf8'),
      'the staged note is the written note',
    );
    assertExit(run(['--check', '--files', HOME]), 0);
  });

  it('works with spaces and quotes in paths, and stages a newly created note', () => {
    committedFixture();
    const ODD = 'tests/blog/odd "quoted" name.spec.ts';
    const NOTE = 'vault/tests/blog/odd "quoted" name.md';
    put(ODD, VALID('Odd (dev smoke)'));
    gitP('add', '--', ODD);
    assertExit(hook('precheck'), 0);
    assertExit(hook('refresh'), 0);
    assert.deepEqual(staged(), [NOTE, ODD].sort());
    assert.ok(read(NOTE).toString('utf8').includes('  - Odd (dev smoke) › user does a thing and sees it'));
  });

  it('does nothing when no spec is staged', () => {
    committedFixture();
    put('notes.txt', 'only an unrelated change\n');
    gitP('add', '--', 'notes.txt');
    const before = snapshot();
    for (const step of ['precheck', 'refresh']) {
      const result = hook(step);
      assertExit(result, 0);
      assert.equal(result.stdout + result.stderr, '');
    }
    assert.deepEqual(snapshot(), before);
  });

  it('a deleted spec needs reviewed old-note cleanup, then the deletion is valid', () => {
    committedFixture();
    gitP('rm', '-q', '--', HOME);
    const pre = hook('precheck');
    assertExit(pre, 1);
    assert.ok(pre.stderr.includes(`source deleted: ${HOME} no longer exists. Review ${HOME_NOTE}`));
    assert.ok(existsSync(abs(HOME_NOTE)), 'the old note is not erased');

    gitP('mv', '--', HOME_NOTE, 'archived-home.smoke.md'); // reviewed: archived outside vault/tests
    assertExit(hook('precheck'), 0);
    assertExit(hook('refresh'), 0);
    assert.deepEqual(staged(), [HOME, HOME_NOTE, 'archived-home.smoke.md'].sort());
  });

  it('a renamed spec reports both paths and needs the old note reviewed first', () => {
    committedFixture();
    const NEW = 'tests/blog/home-renamed.smoke.spec.ts';
    const NEW_NOTE = 'vault/tests/blog/home-renamed.smoke.md';
    gitP('mv', '--', HOME, NEW);
    const pre = hook('precheck');
    assertExit(pre, 1);
    assert.ok(pre.stderr.includes(`pre-commit: renamed spec ${HOME} → ${NEW}`));
    assert.ok(pre.stderr.includes(`source deleted: ${HOME}`));

    gitP('mv', '--', HOME_NOTE, 'archived-home.smoke.md');
    assertExit(hook('precheck'), 0);
    const refresh = hook('refresh');
    assertExit(refresh, 0);
    assert.ok(refresh.stdout.includes(`staged ${NEW_NOTE}`));
    assert.ok(staged().includes(NEW_NOTE) && staged().includes(NEW));
  });

  it('refuses when the refresh itself fails (unsupported staged spec), with nothing staged', () => {
    committedFixture();
    put('tests/bad.spec.ts', "import { test } from '@playwright/test';\ntest('a', async () => {});\n");
    gitP('add', '--', 'tests/bad.spec.ts');
    assertExit(hook('precheck'), 0);
    const refresh = hook('refresh');
    assertExit(refresh, 1);
    assert.ok(refresh.stderr.includes('pre-commit: BLOCKED — spec notes were not refreshed'));
    assert.deepEqual(staged(), ['tests/bad.spec.ts']);
    assert.ok(!existsSync(abs('vault/tests/bad.md')));
  });
});

describe('vault links (--links)', () => {
  const links = () => run(['--links']);

  it('a broken local link fails, and passes after repair', () => {
    assertExit(run(['--write']), 0);
    put('vault/_map.md', '# Map\n\n- [Home](tests/blog/home.smoke.md)\n- [Gone](tests/blog/missing.md)\n');
    const broken = links();
    assertExit(broken, 1);
    assert.ok(
      broken.stderr.includes('vault-links: ERROR vault/_map.md:4 tests/blog/missing.md — target does not exist'),
    );
    put('vault/_map.md', '# Map\n\n- [Home](tests/blog/home.smoke.md)\n');
    const fixed = links();
    assertExit(fixed, 0);
    assert.match(fixed.stdout, /0 error\(s\)/);
  });

  it('resolves labels, angle brackets, titles, optional .md, fragments, references, folders and wikilinks', () => {
    assertExit(run(['--write']), 0);
    put(
      'vault/_map.md',
      [
        '# Map',
        '[A **bold** label](tests/blog/home.smoke.md#what-this-spec-checks)',
        '[No extension](tests/blog/home.smoke)',
        '[Angle](<tests/blog/article-detail.smoke.md>) and [titled](tests/blog/categories.smoke.md "Categories")',
        '[Source](../tests/blog/home.smoke.spec.ts) and [folder](tests/blog/) and [same file](#map)',
        '[[tests/blog/category-filter.smoke]] [[tests/blog/home.smoke|Home]] [[tests/blog/home.smoke.md#heading]]',
        '[ref]: tests/blog/home.smoke.md',
      ].join('\n'),
    );
    const result = links();
    assertExit(result, 0);
    assert.match(result.stdout, /0 error\(s\), 0 warning\(s\)/);
  });

  it('a broken wikilink, a root-relative link and a link outside the project are errors', () => {
    put('vault/_map.md', '[[tests/nowhere]]\n[root](/vault/_map.md)\n[out](../../outside.md)\n');
    const result = links();
    assertExit(result, 1);
    assert.ok(result.stderr.includes('vault/_map.md:1 tests/nowhere — target does not exist'));
    assert.ok(result.stderr.includes('vault/_map.md:2 /vault/_map.md — root-relative links are not supported'));
    assert.ok(result.stderr.includes('vault/_map.md:3 ../../outside.md — points outside the project'));
  });

  it('ignores images, embeds, web and mail links, inline code and fenced code', () => {
    put(
      'vault/_map.md',
      [
        '![missing image](img/none.png) ![[missing-embed.png]]',
        '[web](https://example.invalid/x) [mail](mailto:someone@example.invalid)',
        'Inline `[x](nope.md)` and ``[[nope]]`` stay code.',
        '```md',
        '[fenced](nope.md) [[nope]]',
        '```',
        '~~~',
        '[tilde](nope.md)',
        '~~~',
      ].join('\n'),
    );
    const result = links();
    assertExit(result, 0);
    assert.match(result.stdout, /0 link\(s\) checked, 0 error\(s\)/);
  });

  it('warns, without failing, about an unlinked maintained note; exempt folders get no warning', () => {
    put('vault/_map.md', '# Map\n');
    put('vault/03-framework/extra.md', '# Extra guide\n');
    put('vault/_raw/input.md', '# raw\n');
    put('vault/_changelog/2026-01-01.md', '# log\n');
    put('vault/sources/jira/key-map.md', '# Imported key map\n\n| course | yours |\n');
    put('vault/12-progress-report/someone/2026-01-01.md', '# journal\n');
    const result = links();
    assertExit(result, 0);
    assert.ok(result.stdout.includes('vault-links: WARN unlinked note vault/03-framework/extra.md'));
    assert.match(result.stdout, /1 warning\(s\)/);
    for (const exempt of ['_map.md', '_raw/', '_changelog/', 'sources/', '12-progress-report/']) {
      assert.ok(!result.stdout.includes(`WARN unlinked note vault/${exempt}`), exempt);
    }
  });

  it('imported notes get no generated-note metadata checks', () => {
    assertExit(run(['--write']), 0);
    put('vault/sources/jira/key-map.md', '# Imported key map\n\nNo markers here.\n');
    assertExit(run(['--check']), 0);
  });

  it('a link from a note to itself does not count as linked', () => {
    put('vault/_map.md', '# Map\n');
    put('vault/03-framework/self.md', '[me](self.md)\n');
    assert.ok(links().stdout.includes('WARN unlinked note vault/03-framework/self.md'));
  });
});

describe('guide H1 rule (warning only)', () => {
  const GUIDE = 'vault/03-framework/no-title.md';
  const UNTITLED = [
    '---',
    'id: no-title',
    '# yaml comment, not a heading',
    '---',
    '',
    '## Section without a title above it',
    '',
    '```md',
    '# Fake title inside fenced code',
    '```',
    '',
    '    # indented code, not a heading',
    'Inline `# not a heading` either.',
    '',
  ].join('\n');
  const mapLinking = (...targets) =>
    put('vault/_map.md', `# Map\n\n${targets.map((t) => `- [x](${t.replace(/^vault\//, '')})`).join('\n')}\n`);

  it('warns about a guide without an H1 outside code, and still exits 0', () => {
    mapLinking(GUIDE);
    put(GUIDE, UNTITLED);
    const result = run(['--links']);
    assertExit(result, 0);
    assert.ok(
      result.stdout.includes(`vault-links: WARN guide without H1 ${GUIDE}: add a "# Title" line outside code blocks`),
      result.stdout,
    );
    assert.match(result.stdout, /0 error\(s\), 1 warning\(s\)/);
  });

  it('the repaired guide (an H1 after the front matter) has no warning', () => {
    mapLinking(GUIDE);
    put(GUIDE, UNTITLED.replace('---\n\n## Section', '---\n\n# Real title\n\n## Section'));
    const result = run(['--links']);
    assertExit(result, 0);
    assert.ok(!result.stdout.includes('guide without H1'), result.stdout);
    assert.match(result.stdout, /0 error\(s\), 0 warning\(s\)/);
  });

  it('a setext H1 counts', () => {
    mapLinking(GUIDE);
    put(GUIDE, 'Setext title\n============\n\nBody.\n');
    assert.match(run(['--links']).stdout, /0 warning\(s\)/);
  });

  it('imports, logs, journals, test notes and top-level notes are outside the rule', () => {
    const outside = [
      'vault/sources/jira/untitled.md',
      'vault/_changelog/2026-01-01.md',
      'vault/12-progress-report/someone/2026-01-01.md',
      'vault/tests/blog/untitled.md',
      'vault/_context.md',
    ];
    mapLinking(...outside);
    for (const rel of outside) put(rel, '## No title here\n');
    const result = run(['--links']);
    assertExit(result, 0);
    assert.ok(!result.stdout.includes('guide without H1'), result.stdout);
  });

  it('a heading warning does not hide a broken link: the link still makes it exit 1', () => {
    put('vault/_map.md', '# Map\n\n- [guide](03-framework/no-title.md)\n- [gone](03-framework/missing.md)\n');
    put(GUIDE, UNTITLED);
    const result = run(['--links']);
    assertExit(result, 1);
    assert.ok(result.stderr.includes('03-framework/missing.md — target does not exist'));
    assert.ok(result.stdout.includes(`WARN guide without H1 ${GUIDE}`));
  });
});

describe('formatting scope', () => {
  it('Prettier ignores managed notes under vault/tests', async () => {
    const prettier = await import('prettier');
    const info = await prettier.getFileInfo(path.join(REPO, HOME_NOTE), {
      ignorePath: path.join(REPO, '.prettierignore'),
    });
    assert.equal(info.ignored, true);
  });
});

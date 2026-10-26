#!/usr/bin/env node
/**
 * vault-sync.mjs — record Claude Code activity in vault/_changelog/, and keep one
 * generated note per spec in vault/tests/ (Task 11).
 *
 *   node scripts/vault-sync.mjs --from-hook       read hook JSON on stdin, log one edited file;
 *                                                 an edited spec also gets its note refreshed (never staged)
 *   node scripts/vault-sync.mjs --session-start   log a session start to sessions.log
 *   node scripts/vault-sync.mjs --session-end     log a session end, short HEAD and uncommitted file count
 *   node scripts/vault-sync.mjs --write [--files <spec>…]   create or refresh spec notes
 *   node scripts/vault-sync.mjs --check [--files <spec>…]   read-only: report missing, stale or invalid notes
 *
 * The three logging modes always exit 0, so a logging problem never blocks the
 * session. A write failure prints one short line on stderr, never the input.
 * Paths inside vault/ are ignored by --from-hook, so the recorder never logs or
 * regenerates from its own output. Session modes never generate notes.
 *
 * --write and --check exit 0 when every selected note is valid, 1 when any is not,
 * and 2 on a usage error. Specs are parsed with the installed TypeScript parser and
 * never executed. Text outside the generated:start/end markers is kept byte for byte.
 * The project root is CLAUDE_PROJECT_DIR, or the current directory when it is unset.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { hostname } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(process.env.CLAUDE_PROJECT_DIR || process.cwd());
const changelogDir = path.join(root, 'vault', '_changelog');
// Built from the code point, so this source never holds an invisible character.
const LEADING_BOMS = new RegExp(`^${String.fromCharCode(0xfeff)}+`);

function git(args) {
  try {
    const out = execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return out || 'unknown';
  } catch {
    return 'unknown';
  }
}

/** Number of non-empty output lines, or 'unknown' when Git fails (0 means a clean result). */
function gitCount(args) {
  try {
    const out = execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return String(out.split('\n').filter((line) => line !== '').length);
  } catch {
    return 'unknown';
  }
}

function utcTime(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function localDate(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

/** Returns the edited file as a project-relative path, or null to ignore the input. */
function projectPath(raw) {
  let data;
  try {
    data = JSON.parse(raw.replace(LEADING_BOMS, ''));
  } catch {
    return null;
  }
  const filePath = data?.tool_input?.file_path ?? data?.file_path;
  if (typeof filePath !== 'string' || filePath === '') return null;

  const rel = path.relative(root, path.resolve(root, filePath)).split(path.sep).join('/');
  if (rel === '' || rel === '..' || rel.startsWith('../') || path.isAbsolute(rel)) return null;
  if (rel === 'vault' || rel.startsWith('vault/')) return null;
  return rel;
}

function append(file, line, header) {
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    if (header && !existsSync(file)) appendFileSync(file, header);
    appendFileSync(file, `${line}\n`);
  } catch (err) {
    process.stderr.write(`vault-sync: could not write changelog (${err?.code ?? 'error'})\n`);
  }
}

// ---------------------------------------------------------------------------
// Spec notes (Task 11): tests/<path>.spec.ts -> vault/tests/<path>.md
// ---------------------------------------------------------------------------

const MARK_START = '<!-- generated:start -->';
const MARK_END = '<!-- generated:end -->';
const MANAGED = '<!-- Managed by scripts/vault-sync.mjs --write. Edits between these markers are replaced. -->';
const HOOKS = new Set(['beforeEach', 'afterEach', 'beforeAll', 'afterAll']);

class UsageError extends Error {}

const noteFor = (specRel) => `vault/tests/${specRel.slice('tests/'.length, -'.spec.ts'.length)}.md`;
const specFor = (noteRel) => `tests/${noteRel.slice('vault/tests/'.length, -'.md'.length)}.spec.ts`;

/** The file's bytes, or null when it is missing or not a regular file (symbolic links included). */
function readRegular(rel) {
  try {
    const abs = path.join(root, rel);
    if (!lstatSync(abs).isFile()) return null;
    return readFileSync(abs);
  } catch {
    return null;
  }
}

/** Project-relative files under dirRel matching the filter, sorted; symbolic links are skipped. */
function walk(dirRel, filter) {
  let entries;
  try {
    entries = readdirSync(path.join(root, dirRel), { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    const rel = `${dirRel}/${entry.name}`;
    if (entry.isDirectory()) out.push(...walk(rel, filter));
    else if (entry.isFile() && filter(rel)) out.push(rel);
  }
  return out;
}

/** A --files argument as a project-relative spec path. A missing (deleted) spec is allowed. */
function specArg(raw) {
  const abs = path.resolve(root, raw.replace(/\\/g, '/'));
  const rel = path.relative(root, abs).split(path.sep).join('/');
  if (rel === '' || rel === '..' || rel.startsWith('../') || path.isAbsolute(rel)) {
    throw new UsageError(`${raw} is outside the project`);
  }
  if (!rel.startsWith('tests/') || !rel.endsWith('.spec.ts') || rel === 'tests/.spec.ts') {
    throw new UsageError(`${raw} is not a spec under tests/ (tests/**/*.spec.ts)`);
  }
  let stat;
  try {
    stat = lstatSync(abs);
  } catch {
    stat = null; // a deleted spec: valid, its note is checked instead
  }
  if (stat && !stat.isFile()) throw new UsageError(`${raw} is not a regular file (symbolic links are refused)`);
  return rel;
}

async function loadTypeScript() {
  const mod = await import('typescript');
  return mod.default ?? mod;
}

/** Names of a property chain such as test.describe.only, or null when it is not one. */
function chain(ts, expr) {
  const names = [];
  let node = expr;
  while (ts.isPropertyAccessExpression(node)) {
    names.unshift(node.name.text);
    node = node.expression;
  }
  if (!ts.isIdentifier(node)) return null;
  names.unshift(node.text);
  return names;
}

/** Reads a spec without running it. Returns { problems } or the recorded facts. */
function analyze(ts, specRel, text) {
  const problems = [];
  const output = ts.transpileModule(text, {
    fileName: specRel,
    reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  });
  for (const d of output.diagnostics ?? []) {
    if (d.category !== ts.DiagnosticCategory.Error) continue;
    const line = d.file && d.start !== undefined ? d.file.getLineAndCharacterOfPosition(d.start).line + 1 : 1;
    problems.push({ line, message: `parse error: ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}` });
  }
  if (problems.length > 0) return { problems };

  const sf = ts.createSourceFile(specRel, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const lineOf = (node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
  const literal = (node) =>
    node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : null;
  const isFunction = (node) => node && (ts.isArrowFunction(node) || ts.isFunctionExpression(node));
  const containsTestCall = (node) => {
    let found = false;
    const visit = (n) => {
      if (found) return;
      if (ts.isCallExpression(n) && chain(ts, n.expression)?.[0] === 'test') {
        found = true;
        return;
      }
      ts.forEachChild(n, visit);
    };
    visit(node);
    return found;
  };
  const kindName = (node) => ts.SyntaxKind[node.kind];

  const describes = [];
  const titles = [];
  const pageObjects = [];
  let testImported = false;

  const describeBody = (describeTitle, fn) => {
    for (const st of fn.body.statements) {
      if (ts.isExpressionStatement(st) && ts.isCallExpression(st.expression)) {
        const call = st.expression;
        const names = chain(ts, call.expression);
        if (names?.[0] === 'test') {
          if (names.length === 1) {
            const title = literal(call.arguments[0]);
            if (title === null) {
              problems.push({ line: lineOf(st), message: 'dynamic title: only literal test titles are recorded' });
            } else if (!isFunction(call.arguments[1])) {
              problems.push({
                line: lineOf(st),
                message: 'unsupported test(): expected test(<title>, async () => {…})',
              });
            } else {
              titles.push(`${describeTitle} › ${title}`);
            }
            continue;
          }
          if (names.length === 2 && HOOKS.has(names[1])) continue;
          if (names.length === 2 && names[1] === 'describe') {
            problems.push({ line: lineOf(st), message: 'unsupported wrapper: nested test.describe' });
            continue;
          }
          problems.push({ line: lineOf(st), message: `unsupported wrapper: ${names.join('.')}(…)` });
          continue;
        }
        if (ts.isIdentifier(call.expression) && call.expression.text === 'runIfEnv') continue;
      }
      if (containsTestCall(st)) {
        problems.push({ line: lineOf(st), message: `unsupported wrapper: test calls inside ${kindName(st)}` });
      }
    }
  };

  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier)) {
      const from = st.moduleSpecifier.text;
      const clause = st.importClause;
      const names = [];
      if (clause?.name) names.push(clause.name.text);
      const bindings = clause?.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) names.push(`* as ${bindings.name.text}`);
      if (bindings && ts.isNamedImports(bindings)) {
        for (const el of bindings.elements) names.push(el.name.text);
        if (
          from === '@playwright/test' &&
          bindings.elements.some((el) => (el.propertyName ?? el.name).text === 'test')
        ) {
          testImported = true;
        }
      }
      if (from.startsWith('.')) {
        let target = path.posix.normalize(path.posix.join(path.posix.dirname(specRel), from));
        if (!path.posix.extname(target)) target += '.ts';
        if (target.startsWith('pages/')) pageObjects.push({ target, names: names.sort() });
      }
      continue;
    }
    if (ts.isExpressionStatement(st) && ts.isCallExpression(st.expression)) {
      const call = st.expression;
      const names = chain(ts, call.expression);
      if (names?.[0] === 'test') {
        if (names.length === 2 && names[1] === 'describe') {
          const title = literal(call.arguments[0]);
          const fn = call.arguments[1];
          if (title === null) {
            problems.push({ line: lineOf(st), message: 'dynamic title: only literal describe titles are recorded' });
          } else if (!isFunction(fn) || !ts.isBlock(fn.body) || call.arguments.length !== 2) {
            problems.push({ line: lineOf(st), message: 'unsupported test.describe: expected (<title>, () => {…})' });
          } else {
            describes.push(title);
            describeBody(title, fn);
          }
        } else {
          problems.push({
            line: lineOf(st),
            message: `unsupported wrapper: ${names.join('.')}(…) at top level; only test.describe(<title>, () => {…}) is supported`,
          });
        }
        continue;
      }
    }
    if (
      ts.isVariableStatement(st) &&
      st.declarationList.declarations.some((d) => ts.isIdentifier(d.name) && d.name.text === 'test')
    ) {
      problems.push({ line: lineOf(st), message: 'unsupported: test is redefined (for example base.extend)' });
      continue;
    }
    if (containsTestCall(st)) {
      problems.push({ line: lineOf(st), message: `unsupported wrapper: test calls inside ${kindName(st)}` });
    }
  }

  if (!testImported) problems.push({ line: 1, message: 'unsupported: test is not imported from @playwright/test' });
  for (const title of [...describes, ...titles]) {
    if (title.includes('<!--') || title.includes('-->')) {
      problems.push({ line: 1, message: 'unsupported title: contains an HTML comment marker' });
    }
  }
  if (problems.length === 0 && titles.length === 0) problems.push({ line: 1, message: 'no tests found' });
  if (problems.length > 0) return { problems };
  pageObjects.sort((a, b) => (a.target < b.target ? -1 : a.target > b.target ? 1 : 0));
  return { problems, heading: describes[0], titles, pageObjects };
}

function renderBlock(specRel, source, parser, facts) {
  const noteRel = noteFor(specRel);
  const link = (target) => `[${target}](${path.posix.relative(path.posix.dirname(noteRel), target)})`;
  const lines = [
    MARK_START,
    MANAGED,
    `- **Source:** ${link(specRel)}`,
    `- **SHA-256:** \`${createHash('sha256').update(source).digest('hex')}\``,
    `- **Parser:** ${parser} · ok`,
    `- **Tests (${facts.titles.length}):**`,
    ...facts.titles.map((title) => `  - ${title}`),
  ];
  if (facts.pageObjects.length === 0) {
    lines.push('- **Page Object imports:** none');
  } else {
    lines.push('- **Page Object imports:**');
    for (const po of facts.pageObjects) lines.push(`  - \`${po.names.join('`, `')}\` from ${link(po.target)}`);
  }
  lines.push(MARK_END);
  return lines.join('\n');
}

function count(buffer, needle) {
  let n = 0;
  for (let at = buffer.indexOf(needle); at !== -1; at = buffer.indexOf(needle, at + needle.length)) n += 1;
  return n;
}

/** Byte offsets of the one generated block, or an error for missing, repeated or swapped markers. */
function markers(note) {
  const starts = count(note, MARK_START);
  const ends = count(note, MARK_END);
  if (starts === 0 && ends === 0) return { error: 'no generated markers (not a managed note)' };
  if (starts !== 1 || ends !== 1)
    return { error: `damaged markers (${starts} start, ${ends} end; exactly one of each is required)` };
  const start = note.indexOf(MARK_START);
  const end = note.indexOf(MARK_END);
  if (end < start) return { error: 'damaged markers (end marker before start marker)' };
  return { start, end: end + MARK_END.length };
}

const deletedMessage = (specRel, noteRel) =>
  `source deleted: ${specRel} no longer exists. Review ${noteRel}, then remove it or archive it outside vault/tests; its text is never erased automatically`;

/** What --write would do for one spec, without writing anything. */
function planSpec(ts, specRel) {
  const noteRel = noteFor(specRel);
  const note = readRegular(noteRel);
  const source = readRegular(specRel);
  if (source === null) {
    if (note === null) return { kind: 'deleted', specRel, noteRel };
    return { kind: 'problem', specRel, noteRel, messages: [deletedMessage(specRel, noteRel)] };
  }
  const facts = analyze(ts, specRel, source.toString('utf8'));
  if (facts.problems.length > 0) {
    return {
      kind: 'problem',
      specRel,
      noteRel,
      messages: facts.problems.map((p) => `${specRel}:${p.line} ${p.message}`),
    };
  }
  const block = Buffer.from(renderBlock(specRel, source, `typescript ${ts.version}`, facts), 'utf8');
  if (note === null) {
    return {
      kind: 'create',
      specRel,
      noteRel,
      next: Buffer.concat([Buffer.from(`# ${facts.heading}\n\n`, 'utf8'), block, Buffer.from('\n', 'utf8')]),
    };
  }
  const where = markers(note);
  if (where.error)
    return { kind: 'problem', specRel, noteRel, messages: [`${noteRel}: ${where.error}; nothing was written`] };
  const next = Buffer.concat([note.subarray(0, where.start), block, note.subarray(where.end)]);
  return { kind: next.equals(note) ? 'unchanged' : 'update', specRel, noteRel, next };
}

/** Managed notes whose spec is missing, and files in vault/tests that are not managed notes. */
function orphanNotes(selected) {
  const problems = [];
  for (const noteRel of walk('vault/tests', (rel) => rel.endsWith('.md'))) {
    const specRel = specFor(noteRel);
    if (selected.has(specRel)) continue;
    const where = markers(readRegular(noteRel) ?? Buffer.alloc(0));
    if (where.error) problems.push({ kind: 'problem', specRel, noteRel, messages: [`${noteRel}: ${where.error}`] });
    else if (readRegular(specRel) === null) {
      problems.push({ kind: 'problem', specRel, noteRel, messages: [deletedMessage(specRel, noteRel)] });
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------
// Staging safety (Task 11 stage 2), used by --write --stage and scripts/git-hooks/spec-notes.mjs
// ---------------------------------------------------------------------------

function gitOut(args) {
  return execFileSync('git', ['--literal-pathspecs', ...args], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}
const listed = (out) => out.split('\0').filter((p) => p !== '');
const hasUnstagedChanges = (rel) => listed(gitOut(['diff', '--name-only', '-z', '--', rel])).length > 0;
const isTracked = (rel) => listed(gitOut(['ls-files', '-z', '--', rel])).length > 0;

/** Reasons the selected specs' notes cannot be refreshed and staged safely. Reads only. */
export function stagingProblems(specRels) {
  const problems = [];
  for (const specRel of specRels) {
    const noteRel = noteFor(specRel);
    const noteExists = existsSync(path.join(root, noteRel));
    if (hasUnstagedChanges(specRel)) {
      problems.push(
        `partially staged: ${specRel} has unstaged changes; stage the whole file (or stash the rest), then commit again`,
      );
    }
    if (noteExists && !isTracked(noteRel)) {
      problems.push(
        `untracked note needs review: ${noteRel} exists but is not tracked; review it, then git add it or move it out of vault/tests`,
      );
    } else if (noteExists && hasUnstagedChanges(noteRel)) {
      problems.push(`note has unstaged edits: ${noteRel}; stage or discard them before committing ${specRel}`);
    }
    if (readRegular(specRel) === null && noteExists) problems.push(deletedMessage(specRel, noteRel));
  }
  return problems;
}

// ---------------------------------------------------------------------------
// Vault links (Task 11 stage 2): --links
// ---------------------------------------------------------------------------

// Never reported as unlinked: the map, raw inputs, logs, imports and daily journals.
const LINK_EXEMPT = [
  /^vault\/_map\.md$/,
  /^vault\/_raw\//,
  /^vault\/_changelog\//,
  /^vault\/sources\//,
  /^vault\/12-progress-report\//,
];
const EXTERNAL = /^[a-z][a-z0-9+.-]*:/i;

/** The file's lines with fenced code blocks emptied and inline code blanked, so line numbers stay true. */
function proseLines(text) {
  let fence = null;
  return text.split(/\r?\n/).map((line) => {
    if (fence) {
      const close = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(line);
      if (close && close[1][0] === fence[0] && close[1].length >= fence.length) fence = null;
      return '';
    }
    const open = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (open) {
      fence = open[1];
      return '';
    }
    return line.replace(/(`+)(?:(?!\1)[\s\S])*?\1/g, (code) => ' '.repeat(code.length));
  });
}

/** Local links on one prose line: [label](target), [id]: target and [[wikilinks]]; images and embeds skipped. */
function linksIn(line) {
  const found = [];
  for (const m of line.matchAll(/(!?)\[\[([^\]]+)\]\]/g)) {
    if (!m[1]) found.push({ kind: 'wiki', target: m[2].split('|')[0].split('#')[0].trim() });
  }
  const rest = line.replace(/!?\[\[[^\]]+\]\]/g, (m) => ' '.repeat(m.length));
  for (const m of rest.matchAll(/(!?)\[([^\]]*)\]\(\s*(<[^>]*>|[^\s)]+)(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g)) {
    if (!m[1]) found.push({ kind: 'md', target: m[3].replace(/^<|>$/g, '') });
  }
  const definition = /^ {0,3}\[[^\]]+\]:\s*(<[^>]*>|\S+)/.exec(rest);
  if (definition) found.push({ kind: 'md', target: definition[1].replace(/^<|>$/g, '') });
  return found;
}

/** { skip } for web, mail and same-file links; { rel } for an existing target; { error } otherwise. */
function resolveLink(fileRel, link) {
  let target = link.target;
  let base;
  if (link.kind === 'md') {
    if (target === '' || target.startsWith('#') || EXTERNAL.test(target)) return { skip: true };
    target = target.split('#')[0].split('?')[0];
    try {
      target = decodeURIComponent(target);
    } catch {
      // keep the target as written
    }
    if (target.startsWith('/')) return { error: 'root-relative links are not supported; use a relative path' };
    base = path.posix.dirname(fileRel);
  } else {
    if (target === '') return { skip: true };
    base = 'vault'; // wikilinks are relative to the vault root
  }
  const rel = path.posix.normalize(path.posix.join(base, target));
  if (rel === '..' || rel.startsWith('../')) return { error: 'points outside the project' };
  for (const candidate of [rel, `${rel}.md`]) {
    if (existsSync(path.join(root, candidate))) return { rel: candidate };
  }
  return { error: 'target does not exist' };
}

// Human guides that should carry a title. Imports, logs, journals, tests and top-level notes are outside it.
const GUIDE_SCOPE = /^vault\/03-framework\/.+\.md$/;

/** True when the text has an H1 (`# Title` or setext `===`) outside front matter and code. */
function hasH1(text) {
  let lines = text.split(/\r?\n/);
  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1);
    if (end !== -1) lines = lines.map((line, i) => (i <= end ? '' : line)); // leading YAML front matter
  }
  const prose = proseLines(lines.join('\n')); // fenced code emptied, inline code blanked
  return prose.some((line, i) => {
    if (/^ {0,3}#(?:[ \t]|$)/.test(line)) return true; // ATX; 4+ spaces would be indented code
    const above = prose[i - 1] ?? '';
    return /^ {0,3}=+[ \t]*$/.test(line) && /\S/.test(above) && !/^( {4}| {0,3}#)/.test(above); // setext
  });
}

function runLinks() {
  const files = walk('vault', (rel) => rel.endsWith('.md'));
  const linked = new Set();
  let checked = 0;
  let errors = 0;
  for (const fileRel of files) {
    const lines = proseLines((readRegular(fileRel) ?? Buffer.alloc(0)).toString('utf8'));
    lines.forEach((line, index) => {
      for (const link of linksIn(line)) {
        const r = resolveLink(fileRel, link);
        if (r.skip) continue;
        checked += 1;
        if (r.error) {
          errors += 1;
          process.stderr.write(`vault-links: ERROR ${fileRel}:${index + 1} ${link.target} — ${r.error}\n`);
        } else if (r.rel !== fileRel) {
          linked.add(r.rel);
        }
      }
    });
  }
  const unlinked = files.filter((f) => !LINK_EXEMPT.some((re) => re.test(f)) && !linked.has(f));
  for (const f of unlinked)
    process.stdout.write(`vault-links: WARN unlinked note ${f}: no other vault note links to it\n`);
  const untitled = files.filter(
    (f) => GUIDE_SCOPE.test(f) && !hasH1((readRegular(f) ?? Buffer.alloc(0)).toString('utf8')),
  );
  for (const f of untitled) {
    process.stdout.write(`vault-links: WARN guide without H1 ${f}: add a "# Title" line outside code blocks\n`);
  }
  // Warnings never change the exit code; only broken links do.
  const warnings = unlinked.length + untitled.length;
  process.stdout.write(
    `vault-links: root ${root}: ${files.length} note(s), ${checked} link(s) checked, ${errors} error(s), ${warnings} warning(s)\n`,
  );
  return errors > 0 ? 1 : 0;
}

function parseNoteArgs(args) {
  let mode = null;
  let files = null;
  let stage = false;
  for (const arg of args) {
    if (arg === '--write' || arg === '--check') {
      if (mode) throw new UsageError(`${mode} and ${arg} cannot be combined`);
      mode = arg;
    } else if (arg === '--files') {
      if (files) throw new UsageError('--files given twice');
      files = [];
    } else if (arg === '--stage') {
      if (stage) throw new UsageError('--stage given twice');
      stage = true;
    } else if (arg.startsWith('-')) {
      throw new UsageError(`unknown option ${arg}`);
    } else if (files) {
      files.push(arg);
    } else {
      throw new UsageError(`unexpected argument ${arg} (spec paths follow --files)`);
    }
  }
  if (!mode) throw new UsageError('choose --write or --check');
  if (files && files.length === 0) throw new UsageError('--files needs at least one spec path');
  if (stage && mode !== '--write') throw new UsageError('--stage works only with --write');
  if (stage && !files) throw new UsageError('--stage needs --files with the staged spec paths');
  return { mode, stage, files: files ? [...new Set(files.map(specArg))] : null };
}

function fail(messages) {
  for (const message of messages) process.stderr.write(`vault-sync: FAIL ${message}\n`);
}

async function runNotes(args) {
  const { mode, stage, files } = parseNoteArgs(args);
  if (stage) {
    const unsafe = stagingProblems(files);
    if (unsafe.length > 0) {
      fail(unsafe);
      process.stdout.write(`vault-sync: --write --stage root ${root}: nothing written or staged\n`);
      return 1;
    }
  }
  const ts = await loadTypeScript();
  const specs = files ?? walk('tests', (rel) => rel.endsWith('.spec.ts'));
  const results = specs.map((specRel) => planSpec(ts, specRel));
  if (!files) results.push(...orphanNotes(new Set(specs)));
  if (stage && results.some((r) => r.kind === 'problem')) {
    fail(results.filter((r) => r.kind === 'problem').flatMap((r) => r.messages));
    process.stdout.write(`vault-sync: --write --stage root ${root}: nothing written or staged\n`);
    return 1;
  }

  const tally = { ok: 0, written: 0, problems: 0 };
  const written = [];
  for (const r of results) {
    if (r.kind === 'problem') {
      tally.problems += 1;
      for (const message of r.messages) process.stderr.write(`vault-sync: FAIL ${message}\n`);
    } else if (r.kind === 'create' || r.kind === 'update') {
      if (mode === '--check') {
        tally.problems += 1;
        const why = r.kind === 'create' ? 'missing' : 'stale';
        process.stderr.write(
          `vault-sync: FAIL ${why}: ${r.noteRel} does not match ${r.specRel}; run npm run vault:sync\n`,
        );
      } else {
        mkdirSync(path.dirname(path.join(root, r.noteRel)), { recursive: true });
        writeFileSync(path.join(root, r.noteRel), r.next);
        tally.written += 1;
        written.push(r);
        process.stdout.write(`vault-sync: ${r.kind === 'create' ? 'created' : 'updated'} ${r.noteRel}\n`);
      }
    } else {
      tally.ok += 1;
      const what = r.kind === 'deleted' ? `deleted spec ${r.specRel} has no note` : `${r.noteRel} is current`;
      process.stdout.write(`vault-sync: ok ${what}\n`);
    }
  }
  if (stage && written.length > 0) {
    // Recheck just before staging: each spec is still fully staged and each note holds exactly what was written.
    const changed = written.flatMap((r) => [
      ...(hasUnstagedChanges(r.specRel) ? [`${r.specRel} changed while its note was written; nothing was staged`] : []),
      ...(readRegular(r.noteRel)?.equals(r.next)
        ? []
        : [`${r.noteRel} changed while it was written; nothing was staged`]),
    ]);
    if (changed.length > 0) {
      fail(changed);
      return 1;
    }
    gitOut(['add', '--', ...written.map((r) => r.noteRel)]);
    for (const r of written) process.stdout.write(`vault-sync: staged ${r.noteRel}\n`);
  }
  process.stdout.write(
    `vault-sync: ${mode}${stage ? ' --stage' : ''} root ${root}: ${specs.length} spec(s), ${tally.ok} ok, ${tally.written} written, ${tally.problems} problem(s)\n`,
  );
  return tally.problems > 0 ? 1 : 0;
}

/** --from-hook only: refresh the edited spec's note. Never stages; reports and continues on any error. */
async function refreshFromHook(rel) {
  if (!/^tests\/.+\.spec\.ts$/.test(rel) || readRegular(rel) === null) return;
  try {
    const r = planSpec(await loadTypeScript(), rel);
    if (r.kind === 'create' || r.kind === 'update') {
      mkdirSync(path.dirname(path.join(root, r.noteRel)), { recursive: true });
      writeFileSync(path.join(root, r.noteRel), r.next);
    } else if (r.kind === 'problem') {
      for (const message of r.messages) process.stderr.write(`vault-sync: note not refreshed — ${message}\n`);
    }
  } catch (err) {
    process.stderr.write(`vault-sync: note not refreshed (${err?.code ?? String(err?.message).split('\n')[0]})\n`);
  }
}

const USAGE =
  'usage: vault-sync.mjs --from-hook | --session-start | --session-end | --links | (--write | --check) [--files <spec>…] [--stage]\n';

async function main(args) {
  const now = new Date();
  const [mode] = args;
  if (['--from-hook', '--session-start', '--session-end', '--links'].includes(mode)) {
    if (args.length !== 1) {
      process.stderr.write(USAGE);
      return 2;
    }
  }
  if (mode === '--links') return runLinks();
  if (mode === '--from-hook') {
    const rel = projectPath(readStdin());
    if (rel) {
      const date = localDate(now);
      const who = `${git(['config', 'user.name'])} @ ${hostname() || 'unknown'}`;
      const line = [
        `- ${utcTime(now)}`,
        who,
        git(['branch', '--show-current']),
        rel,
        `last commit: ${git(['log', '-1', '--format=%s'])}`,
        `**commit:** ${git(['rev-parse', '--short', 'HEAD'])}`,
      ].join(' · ');
      append(path.join(changelogDir, `${date}.md`), line, `# ${date}\n\n`);
      await refreshFromHook(rel);
    }
    return 0;
  }
  if (mode === '--session-start') {
    append(path.join(changelogDir, 'sessions.log'), `- session START ${utcTime(now)}`);
    return 0;
  }
  if (mode === '--session-end') {
    // Counted before the append, and sessions.log is ignored by Git, so the line never counts itself.
    const commit = git(['rev-parse', '--short', 'HEAD']);
    const uncommitted = gitCount(['status', '--porcelain', '--untracked-files=all']);
    append(
      path.join(changelogDir, 'sessions.log'),
      `- session END ${utcTime(now)} · commit: ${commit} · uncommitted: ${uncommitted}`,
    );
    return 0;
  }
  if (args.length > 0) {
    try {
      return await runNotes(args);
    } catch (err) {
      if (err instanceof UsageError) {
        process.stderr.write(`vault-sync: ${err.message}\n${USAGE}`);
        return 2;
      }
      process.stderr.write(`vault-sync: FAIL ${String(err?.message).split('\n')[0]}\n`);
      return 1;
    }
  }
  process.stderr.write(USAGE);
  return 2;
}

/** True when Node was started on this file (real paths, so a symlinked project folder still matches). */
function isMainModule() {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

// Run only when executed directly; scripts/git-hooks/spec-notes.mjs imports stagingProblems.
if (isMainModule()) process.exitCode = await main(process.argv.slice(2));

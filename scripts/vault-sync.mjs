#!/usr/bin/env node
/**
 * vault-sync.mjs — record Claude Code activity in vault/_changelog/.
 *
 *   node scripts/vault-sync.mjs --from-hook       read hook JSON on stdin, log one edited file
 *   node scripts/vault-sync.mjs --session-start   log a session start to sessions.log
 *   node scripts/vault-sync.mjs --session-end     log a session end, short HEAD and uncommitted file count
 *
 * Both are logging modes: they always exit 0, so a logging problem never blocks
 * the session. A write failure prints one short line on stderr, never the input.
 * Paths inside vault/ are ignored, so the recorder never logs its own output.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { hostname } from 'node:os';
import path from 'node:path';

const root = path.resolve(process.env.CLAUDE_PROJECT_DIR || process.cwd());
const changelogDir = path.join(root, 'vault', '_changelog');

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
    data = JSON.parse(raw.replace(/^\uFEFF+/, ''));
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

const mode = process.argv[2];
const now = new Date();

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
  }
  process.exit(0);
} else if (mode === '--session-start') {
  append(path.join(changelogDir, 'sessions.log'), `- session START ${utcTime(now)}`);
  process.exit(0);
} else if (mode === '--session-end') {
  // Counted before the append, and sessions.log is ignored by Git, so the line never counts itself.
  const commit = git(['rev-parse', '--short', 'HEAD']);
  const uncommitted = gitCount(['status', '--porcelain', '--untracked-files=all']);
  append(
    path.join(changelogDir, 'sessions.log'),
    `- session END ${utcTime(now)} · commit: ${commit} · uncommitted: ${uncommitted}`,
  );
  process.exit(0);
} else {
  process.stderr.write('usage: vault-sync.mjs --from-hook | --session-start | --session-end\n');
  process.exit(2);
}

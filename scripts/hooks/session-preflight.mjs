#!/usr/bin/env node
/**
 * session-preflight.mjs — five-line startup summary for a SessionStart hook.
 *
 *   node scripts/hooks/session-preflight.mjs
 *
 * Prints, one per line: the local date, the current Git branch, the number of
 * uncommitted files, the newest progress journal, and the vault map. It always
 * exits 0 with nothing on stderr, so a problem never blocks the session. It does
 * not read any other hook's output and does not depend on handler order.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';

const JOURNAL_DIR = path.join('vault', '12-progress-report');
const JOURNAL_NAME = /^\d{4}-\d{2}-\d{2}\.md$/;

const root = path.resolve(process.env.CLAUDE_PROJECT_DIR || process.cwd());

/** Runs git with separate arguments; returns stdout, or null when Git fails. */
function git(args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
}

function localDate(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function branch() {
  const name = git(['branch', '--show-current'])?.trim();
  return name || 'no-branch';
}

/** One porcelain line per file; --untracked-files=all lists files inside new folders. */
function uncommittedCount() {
  const out = git(['status', '--porcelain', '--untracked-files=all']);
  if (out === null) return 'unknown';
  return String(out.split('\n').filter((line) => line !== '').length);
}

/** Newest YYYY-MM-DD.md anywhere under the journal folder, by the date in its name. */
function latestJournal() {
  const found = [];
  const walk = (rel) => {
    let entries;
    try {
      entries = readdirSync(path.join(root, rel), { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const child = path.join(rel, entry.name);
      if (entry.isDirectory())
        walk(child); // symbolic links are neither files nor folders here, so they are skipped
      else if (entry.isFile() && JOURNAL_NAME.test(entry.name))
        found.push({ date: entry.name.slice(0, 10), rel: child });
    }
  };
  walk(JOURNAL_DIR);
  if (found.length === 0) return 'none yet';
  found.sort((a, b) => (a.date === b.date ? a.rel.localeCompare(b.rel) : a.date.localeCompare(b.date)));
  return found[found.length - 1].rel.split(path.sep).join('/');
}

try {
  const lines = [
    `Date: ${localDate(new Date())}`,
    `Branch: ${branch()}`,
    `Uncommitted files: ${uncommittedCount()}`,
    `Latest journal: ${latestJournal()}`,
    'Map: vault/_map.md',
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
} catch {
  // a summary problem must never block the session
}
process.exitCode = 0;

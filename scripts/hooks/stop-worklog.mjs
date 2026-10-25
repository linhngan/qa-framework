#!/usr/bin/env node
/**
 * stop-worklog.mjs — daily-note reminder for a Stop hook.
 *
 *   node scripts/hooks/stop-worklog.mjs          read the Stop hook's JSON on stdin
 *   node scripts/hooks/stop-worklog.mjs --path   print today's journal path; stdin is not read
 *
 * Today's journal is vault/12-progress-report/<slug>/<local date>.md, where the slug
 * comes from `git config user.name`. When there is work today (a qualifying uncommitted
 * file or a commit dated today) and the journal has no "## HH:MM" entry yet, the hook
 * prints one "worklog: BLOCKED — …" line on stderr and exits 2, so Claude is asked to
 * add the entry before finishing. Everything else exits 0, including the retry
 * (stop_hook_active), unreadable input and unexpected errors.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const QUALIFYING = new Set(['.ts', '.mjs', '.json', '.md', '.sh']);
const HEADING = /^## ([01]\d|2[0-3]):[0-5]\d/m;

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

function slug() {
  const name = (git(['config', 'user.name']) ?? '').trim().toLowerCase();
  return name.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'student';
}

function journalPath(today) {
  return ['vault', '12-progress-report', slug(), `${today}.md`].join('/');
}

/** Path of one porcelain v1 line: the new name for a rename, without surrounding quotes. */
function porcelainPath(line) {
  let file = line.slice(3);
  const arrow = file.indexOf(' -> ');
  if (arrow !== -1) file = file.slice(arrow + 4);
  if (file.length >= 2 && file.startsWith('"') && file.endsWith('"')) file = file.slice(1, -1);
  return file;
}

function hasQualifyingChange() {
  const out = git(['status', '--porcelain', '--untracked-files=all']);
  if (out === null) return false;
  return out
    .split('\n')
    .filter((line) => line.length > 3)
    .some((line) => QUALIFYING.has(path.extname(porcelainPath(line)).toLowerCase()));
}

function committedToday(today) {
  const seconds = Number((git(['log', '-1', '--format=%ct']) ?? '').trim());
  if (!Number.isFinite(seconds) || seconds <= 0) return false;
  return localDate(new Date(seconds * 1000)) === today;
}

function hasEntry(rel) {
  try {
    return HEADING.test(readFileSync(path.join(root, rel), 'utf8'));
  } catch {
    return false;
  }
}

function decide() {
  let event;
  try {
    event = JSON.parse(readFileSync(0, 'utf8').replace(/^﻿+/, ''));
  } catch {
    return 0; // unreadable or malformed input
  }
  if (!event || typeof event !== 'object' || Array.isArray(event)) return 0;
  if (event.stop_hook_active === true) return 0; // the retry after a reminder

  const today = localDate(new Date());
  if (!hasQualifyingChange() && !committedToday(today)) return 0;

  const rel = journalPath(today);
  if (hasEntry(rel)) return 0;

  process.stderr.write(
    `worklog: BLOCKED — today's work has no journal entry yet. Run /worklog to append a "## HH:MM" entry to ${rel} (Did, Worked / didn't, Next), then finish.\n`,
  );
  return 2;
}

try {
  if (process.argv[2] === '--path') {
    process.stdout.write(`${journalPath(localDate(new Date()))}\n`);
    process.exitCode = 0;
  } else {
    process.exitCode = decide();
  }
} catch {
  process.exitCode = 0; // unexpected failure: never block finishing
}

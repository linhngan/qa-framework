#!/usr/bin/env node
/**
 * scan-staged.mjs — pre-commit secret scan of Git's staged content (Task 08).
 *
 *   node scripts/git-hooks/scan-staged.mjs   run from .husky/pre-commit
 *
 * Reads what is about to be committed, not the working tree: the staged list comes
 * from `git diff --cached -z`, and each file's content from its staged blob, so new
 * files and partly staged files are checked as they will be committed. Every
 * staged file is scanned; there is no allowlist, including for this script.
 *
 * A finding exits 1 with one "pre-commit: BLOCKED — …" line per problem on stderr.
 * It names the file, line and kind, never the matched value. A clean index exits 0.
 * Unlike the Task 06 guard, this check fails closed: if Git cannot be read, it exits 1.
 */
import { execFileSync } from 'node:child_process';

// Same four detectors as scripts/hooks/guard.mjs. Assembled from pieces so this
// file never contains the detector strings itself.
const SECRET_MARKERS = [
  { text: ['xo', 'xb-'].join(''), kind: 'a Slack bot token' },
  { text: ['ATA', 'TT'].join(''), kind: 'an Atlassian API token' },
  { text: ['AK', 'IA'].join(''), kind: 'an AWS access key ID' },
  { text: ['-----BEGIN ', 'PRIVATE', ' KEY-----'].join(''), kind: 'a private key' },
];

const PROTECTED_NAMES = ['.env', 'id_rsa', 'id_ed25519'];
const PROTECTED_EXTENSIONS = ['.pem', '.key', '.p12'];

/** .env.example passes the name check; its content is still scanned. */
function isProtectedName(base) {
  if (base === '.env.example') return false;
  if (PROTECTED_NAMES.includes(base) || base.startsWith('.env.')) return true;
  return PROTECTED_EXTENSIONS.some((ext) => base.endsWith(ext));
}

function git(args) {
  return execFileSync('git', args, { maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
}

/** Staged entries that will exist after the commit: added, copied, modified, renamed, type-changed. */
function stagedEntries() {
  // --raw -z: ":<old mode> <new mode> <old sha> <new sha> <status>\0<path>\0" (renames and copies add a second path).
  const fields = git(['diff', '--cached', '--raw', '-z', '--no-renames', '--diff-filter=ACMT', '--no-ext-diff'])
    .toString('utf8')
    .split('\0');
  const entries = [];
  for (let i = 0; i + 1 < fields.length; i += 2) {
    const meta = fields[i].replace(/^:/, '').split(' ');
    entries.push({ mode: meta[1], sha: meta[3], path: fields[i + 1] });
  }
  return entries;
}

/** 1-based line of the first match, counted in the staged bytes. */
function lineOf(buffer, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) if (buffer[i] === 0x0a) line += 1;
  return line;
}

function findProblems(entries, readBlob) {
  const problems = [];
  for (const entry of entries) {
    const base = entry.path.split('/').pop();
    if (isProtectedName(base)) {
      problems.push(`${entry.path} is a protected secret file (${base}). Unstage it: git restore --staged -- <file>.`);
    }
    if (entry.mode === '160000') continue; // a submodule commit has no content here
    const content = readBlob(entry);
    for (const marker of SECRET_MARKERS) {
      const at = content.indexOf(marker.text);
      if (at !== -1) {
        problems.push(
          `${entry.path}:${lineOf(content, at)} looks like ${marker.kind}. Remove it and load the value from the environment.`,
        );
      }
    }
  }
  return problems;
}

try {
  const problems = findProblems(stagedEntries(), (entry) => git(['cat-file', 'blob', entry.sha]));
  for (const problem of problems) process.stderr.write(`pre-commit: BLOCKED — ${problem}\n`);
  process.exitCode = problems.length > 0 ? 1 : 0;
} catch (error) {
  process.stderr.write(`pre-commit: BLOCKED — could not read the staged files (${error.message.split('\n')[0]}).\n`);
  process.exitCode = 1;
}

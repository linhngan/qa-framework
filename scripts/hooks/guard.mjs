#!/usr/bin/env node
/**
 * guard.mjs — PreToolUse guard for Claude Code's Edit and Write tools.
 *
 *   node scripts/hooks/guard.mjs   read the hook's event JSON on stdin
 *
 * A refused proposal exits 2 with one "guard: BLOCKED — …" line on stderr.
 * Everything else exits 0 silently. The guard examines only the supplied JSON:
 * it never opens the target file and never applies the edit.
 *
 * This is a course guard and it fails open. Malformed or unreadable input, an
 * unexpected error, or a hook that does not run at all lets the edit through.
 */
import { readFileSync } from 'node:fs';

// Assembled from pieces so this file never contains the detector strings itself.
const SECRET_MARKERS = [
  { text: ['xo', 'xb-'].join(''), kind: 'a Slack bot token' },
  { text: ['ATA', 'TT'].join(''), kind: 'an Atlassian API token' },
  { text: ['AK', 'IA'].join(''), kind: 'an AWS access key ID' },
  { text: ['-----BEGIN ', 'PRIVATE', ' KEY-----'].join(''), kind: 'a private key' },
];

const PROTECTED_NAMES = ['.env', 'id_rsa', 'id_ed25519'];
const PROTECTED_EXTENSIONS = ['.pem', '.key', '.p12'];

function count(text, needle) {
  return text.split(needle).length - 1;
}

function isProtectedName(base) {
  if (base === '.env.example') return false;
  if (PROTECTED_NAMES.includes(base) || base.startsWith('.env.')) return true;
  return PROTECTED_EXTENSIONS.some((ext) => base.endsWith(ext));
}

/** Forward slashes, and relative to the project when the file is inside it. */
function displayPath(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  const root = (process.env.CLAUDE_PROJECT_DIR || process.cwd()).replace(/\\/g, '/').replace(/\/+$/, '');
  return normalized.startsWith(`${root}/`) ? normalized.slice(root.length + 1) : normalized;
}

/** Returns the refusal reason, or null to allow (including malformed input). */
function decide(event) {
  if (!event || typeof event !== 'object') return null;
  const input = event.tool_input;
  if (!input || typeof input !== 'object') return null;

  let oldText;
  let newText;
  if (event.tool_name === 'Edit') {
    oldText = input.old_string;
    newText = input.new_string;
  } else if (event.tool_name === 'Write') {
    oldText = ''; // a whole-file Write has no old-text baseline
    newText = input.content;
  } else {
    return null;
  }
  const filePath = input.file_path;
  if (typeof filePath !== 'string' || filePath === '') return null;
  if (typeof oldText !== 'string' || typeof newText !== 'string') return null;

  const shown = displayPath(filePath);
  const base = shown.split('/').pop();

  if (isProtectedName(base)) {
    return `${shown} is a protected secret file (${base}). Keep secrets outside the project; put documented placeholders in .env.example instead.`;
  }
  const marker = SECRET_MARKERS.find((m) => newText.includes(m.text));
  if (marker) {
    return `new text for ${shown} looks like ${marker.kind}. Remove it and load the real value from the environment, never from a tracked file.`;
  }
  if (!base.endsWith('.spec.ts')) return null;

  if (newText.includes('.only') && !oldText.includes('.only')) {
    return `${shown} would gain .only, which runs only that test and silently skips the rest. Remove .only.`;
  }
  if (newText.includes('.skip') && !oldText.includes('.skip')) {
    return `${shown} would gain .skip. Do not skip tests to get a pass; fix the test, or use runIfEnv for environment gating.`;
  }
  if (newText.includes('waitForTimeout(') && !oldText.includes('waitForTimeout(')) {
    return `${shown} would gain waitForTimeout(, a fixed wait that passes or fails on timing. Wait for the condition the test actually needs instead: an auto-waiting expect(...) assertion such as toBeVisible(), or page.waitForURL() (P6).`;
  }
  if (event.tool_name !== 'Edit') return null; // removals need an old-text baseline

  const removed = (needle) => {
    const before = count(oldText, needle);
    const after = count(newText, needle);
    return after < before ? `(old ${before}, new ${after})` : null;
  };
  let counts = removed('expect(');
  if (counts) {
    return `this edit to ${shown} removes expect( calls ${counts}. Keep every assertion; move it instead of deleting it, or ask a human to approve the removal.`;
  }
  counts = removed('runIfEnv(');
  if (counts) {
    return `this edit to ${shown} removes runIfEnv( calls ${counts}. Specs that change data must keep runIfEnv(test, ['dev']) (G2).`;
  }
  counts = removed('envGuard(');
  if (counts) {
    return `this edit to ${shown} removes envGuard( calls ${counts}. Every data-changing call stays wrapped in envGuard (G3).`;
  }
  return null;
}

// exitCode instead of process.exit(), so the stderr line is flushed before Node exits.
try {
  let event = null;
  try {
    event = JSON.parse(readFileSync(0, 'utf8').replace(/^\uFEFF+/, ''));
  } catch {
    event = null; // malformed or unreadable input: allow silently
  }
  const reason = decide(event);
  if (reason) {
    process.stderr.write(`guard: BLOCKED — ${reason}\n`);
    process.exitCode = 2;
  } else {
    process.exitCode = 0;
  }
} catch {
  process.exitCode = 0; // unexpected error: fail open
}

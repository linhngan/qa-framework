#!/usr/bin/env node
/**
 * guard.mjs — PreToolUse guard for Claude Code's Edit and Write tools.
 *
 *   node scripts/hooks/guard.mjs   read the hook's event JSON on stdin
 *
 * A refused proposal exits 2 with one "guard: BLOCKED — …" line on stderr.
 * An allowed Edit or Write of a CRITICAL path (Task 09) exits 0 and prints one JSON
 * object on stdout with a review reminder; it never returns a permission decision,
 * so the normal permission prompt still decides. Everything else exits 0 silently.
 * The guard examines only the supplied JSON: it never opens the target file and
 * never applies the edit.
 *
 * This is a course guard and it fails open. Malformed or unreadable input, an
 * unexpected error, or a hook that does not run at all lets the edit through,
 * without a warning.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

// Assembled from pieces so this file never contains the detector strings itself.
const SECRET_MARKERS = [
  { text: ['xo', 'xb-'].join(''), kind: 'a Slack bot token' },
  { text: ['ATA', 'TT'].join(''), kind: 'an Atlassian API token' },
  { text: ['AK', 'IA'].join(''), kind: 'an AWS access key ID' },
  { text: ['-----BEGIN ', 'PRIVATE', ' KEY-----'].join(''), kind: 'a private key' },
];

const PROTECTED_NAMES = ['.env', 'id_rsa', 'id_ed25519'];
const PROTECTED_EXTENSIONS = ['.pem', '.key', '.p12'];

// CRITICAL paths (G8 in .claude/rules/01-guardrails.md), relative to the project root.
// Maintained by hand: editing the G8 table does not update this list, and editing
// this list does not update the table. Exact files only, no folders or globs.
const CRITICAL_PATHS = [
  // Environment selection and write protection (G1, G2, G3)
  'env/target.ts',
  'env/runIfEnv.ts',
  'env/envGuard.ts',
  'tests/support/env.ts',
  'playwright.config.ts',
  'package.json',
  '.gitignore',
  // Hook wiring
  '.claude/settings.json',
  '.husky/pre-commit',
  '.husky/pre-push',
  // Hook and automation scripts (Task 09 additional class)
  'scripts/hooks/guard.mjs',
  'scripts/hooks/session-preflight.mjs',
  'scripts/hooks/stop-worklog.mjs',
  'scripts/vault-sync.mjs',
  'scripts/git-hooks/scan-staged.mjs',
  'scripts/git-hooks/pre-push-check.mjs',
  'scripts/git-hooks/spec-notes.mjs',
  // Writes to Jira (G4)
  'scripts/jira-seed.mjs',
  // Project rules
  'CLAUDE.md',
  '.claude/rules/01-guardrails.md',
  // Proof of the controls above
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
  'safety-tests/vault-sync.test.mjs',
];
const CRITICAL_KEYS = new Set(CRITICAL_PATHS.map((p) => p.toLowerCase()));
const CRITICAL_WARNING = 'guard: WARN — shared file; review the affected callers before approving';

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

/** The Edit or Write being proposed, or null when the input is not one (or is malformed). */
function proposal(event) {
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
  return { toolName: event.tool_name, filePath, oldText, newText };
}

/**
 * Project-relative path with forward slashes, `.` and `..` resolved, or null when
 * the file is outside the project. Relative input is taken as relative to the root.
 * Case is ignored, so a mis-cased path on macOS or Windows still matches.
 */
function projectKey(filePath) {
  const root = path.posix.normalize(
    (process.env.CLAUDE_PROJECT_DIR || process.cwd()).replace(/\\/g, '/').replace(/\/+$/, ''),
  );
  let rel = filePath.replace(/\\/g, '/');
  const isAbsolute = rel.startsWith('/') || /^[A-Za-z]:\//.test(rel);
  if (isAbsolute) {
    rel = path.posix.normalize(rel);
    if (!rel.toLowerCase().startsWith(`${root.toLowerCase()}/`)) return null;
    rel = rel.slice(root.length + 1);
  }
  rel = path.posix.normalize(rel);
  if (rel === '..' || rel.startsWith('../') || rel.startsWith('/')) return null;
  return rel.toLowerCase();
}

function isCritical(edit) {
  const key = projectKey(edit.filePath);
  return key !== null && CRITICAL_KEYS.has(key);
}

/** Returns the refusal reason, or null to allow. */
function decide(edit) {
  const { filePath, oldText, newText } = edit;
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
  if (edit.toolName !== 'Edit') return null; // removals need an old-text baseline

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
  const edit = proposal(event);
  const reason = edit ? decide(edit) : null;
  if (reason) {
    process.stderr.write(`guard: BLOCKED — ${reason}\n`);
    process.exitCode = 2;
  } else {
    // The seven refusal checks ran first; only an allowed CRITICAL edit is reminded.
    if (edit && isCritical(edit)) {
      process.stdout.write(
        `${JSON.stringify({
          systemMessage: CRITICAL_WARNING,
          hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: CRITICAL_WARNING },
        })}\n`,
      );
    }
    process.exitCode = 0;
  }
} catch {
  process.exitCode = 0; // unexpected error: fail open
}

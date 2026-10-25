// Isolated checks for .claude/settings.json (a CRITICAL file, G8). Read only: the
// file is parsed, never written, and holds no secrets. They prove the permission
// rules and hook wiring are still exactly the reviewed ones, so a silent change
// (a widened allow rule, a dropped deny, an unwired hook) fails test:safety.
// No browser, no network.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const settings = JSON.parse(readFileSync(path.join(REPO, '.claude/settings.json'), 'utf8'));
const { deny = [], ask = [], allow = [] } = settings.permissions ?? {};

describe('.claude/settings.json permissions', () => {
  it('denies reading secrets and login state, and editing any .env* file (G5, Task 10)', () => {
    for (const rule of [
      'Read(./.env)',
      'Read(./.env.*)',
      'Read(./**/.auth/**)',
      'Read(./**/*storageState*.json)',
      'Edit(.env*)',
    ]) {
      assert.ok(deny.includes(rule), `deny has ${rule}`);
    }
  });

  it('asks before git push and prod runs (G4)', () => {
    assert.ok(ask.includes('Bash(git push *)'));
    assert.ok(ask.includes('Bash(npm run test:prod*)'));
  });

  it('allows exactly the five reviewed exact commands, with no wildcard', () => {
    assert.deepEqual(
      [...allow].sort(),
      [
        'Bash(npm run lint)',
        'Bash(npm run test:list)',
        'Bash(npm run test:safety)',
        'Bash(npm run typecheck)',
        'Bash(npm test)',
      ].sort(),
    );
    for (const rule of allow) {
      assert.ok(!rule.includes('*'), `${rule} has no wildcard`);
      assert.ok(!/^Bash\((node|npx|git|rm|cat)\b/.test(rule), `${rule} is not a whole-program allowance`);
    }
  });

  it('no allow rule overlaps an ask or deny rule', () => {
    for (const rule of allow) {
      assert.ok(!ask.includes(rule) && !deny.includes(rule), rule);
      assert.ok(!/git push|test:prod|\.env/.test(rule), rule);
    }
  });
});

describe('.claude/settings.json hooks', () => {
  const commands = (event) => (settings.hooks?.[event] ?? []).flatMap((group) => group.hooks ?? []);
  const script = (name) => `node "\${CLAUDE_PROJECT_DIR}"/scripts/${name}`;

  it('wires the five reviewed hook events to the reviewed commands', () => {
    assert.deepEqual(Object.keys(settings.hooks ?? {}).sort(), [
      'PostToolUse',
      'PreToolUse',
      'SessionEnd',
      'SessionStart',
      'Stop',
    ]);
    assert.deepEqual(
      commands('PreToolUse').map((h) => h.command),
      [script('hooks/guard.mjs')],
    );
    assert.deepEqual(
      commands('PostToolUse').map((h) => h.command),
      [script('vault-sync.mjs --from-hook')],
    );
    assert.deepEqual(
      commands('SessionStart').map((h) => h.command),
      [script('vault-sync.mjs --session-start'), script('hooks/session-preflight.mjs')],
    );
    assert.deepEqual(
      commands('Stop').map((h) => h.command),
      [script('hooks/stop-worklog.mjs')],
    );
    assert.deepEqual(
      commands('SessionEnd').map((h) => h.command),
      [script('vault-sync.mjs --session-end')],
    );
    assert.equal(commands('SessionEnd')[0].timeout, 5);
  });

  it('matches Edit and Write for the guard and the recorder', () => {
    for (const event of ['PreToolUse', 'PostToolUse']) {
      assert.deepEqual(
        settings.hooks[event].map((group) => group.matcher),
        ['Edit|Write'],
      );
    }
  });

  it('every hooked script exists, so no hook is silently unwired', () => {
    for (const event of Object.keys(settings.hooks)) {
      for (const hook of commands(event)) {
        const match = /scripts\/[\w/.-]+\.mjs/.exec(hook.command);
        assert.ok(match, `${event} command names a script: ${hook.command}`);
        assert.ok(existsSync(path.join(REPO, match[0])), `${match[0]} exists`);
      }
    }
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { HELPERS_CHILD, runNode, runScenario, type ChildEnv } from './support/child.ts';
import {
  CANONICAL_BASE_URLS,
  TargetConfigError,
  resolveTarget,
  type TargetSettings,
} from '../env/target.ts';

const DEV = CANONICAL_BASE_URLS.dev;
const PROD = CANONICAL_BASE_URLS.prod;

function rejects(settings: TargetSettings, leaked?: string): void {
  assert.throws(
    () => resolveTarget(settings),
    (error: unknown) => {
      assert.ok(error instanceof TargetConfigError);
      if (leaked) assert.ok(!error.message.includes(leaked), 'error echoed input');
      return true;
    },
  );
}

describe('resolveTarget selection', () => {
  it('defaults to dev when APP_ENV is missing', () => {
    assert.deepEqual(resolveTarget(), { env: 'dev', baseURL: DEV });
    assert.deepEqual(resolveTarget({}), { env: 'dev', baseURL: DEV });
  });

  it('accepts exact dev and prod', () => {
    assert.deepEqual(resolveTarget({ APP_ENV: 'dev' }), { env: 'dev', baseURL: DEV });
    assert.deepEqual(resolveTarget({ APP_ENV: 'prod' }), { env: 'prod', baseURL: PROD });
  });

  it('accepts only the exact canonical BASE_URL for the selected env', () => {
    assert.equal(resolveTarget({ APP_ENV: 'dev', BASE_URL: DEV }).baseURL, DEV);
    assert.equal(resolveTarget({ APP_ENV: 'prod', BASE_URL: PROD }).baseURL, PROD);
  });

  it('returns a frozen target', () => {
    assert.ok(Object.isFrozen(resolveTarget()));
  });
});

describe('resolveTarget rejections', () => {
  for (const value of ['', ' ', 'DEV', 'Prod', 'staging', ' dev', 'dev ']) {
    it(`rejects APP_ENV ${JSON.stringify(value)}`, () => {
      rejects({ APP_ENV: value });
    });
  }

  const badBaseUrls: [string, string][] = [
    ['dev', ''],
    ['dev', ' '],
    ['dev', `${DEV}/`],
    ['dev', `${DEV}/path`],
    ['dev', PROD],
    ['prod', DEV],
    ['prod', PROD.replace('https://', 'http://')],
    ['dev', 'https://leak-check.invalid'],
  ];
  for (const [env, value] of badBaseUrls) {
    it(`rejects BASE_URL ${JSON.stringify(value)} for ${env}`, () => {
      rejects({ APP_ENV: env, BASE_URL: value }, value.trim() || undefined);
    });
  }

  for (const value of ['', '/tmp/sandbox']) {
    it(`rejects LOCAL_SANDBOX_DIR ${JSON.stringify(value)}`, () => {
      rejects({ LOCAL_SANDBOX_DIR: value }, value || undefined);
    });
  }

  it('does not echo an unknown APP_ENV', () => {
    rejects({ APP_ENV: 'leak-check-env' }, 'leak-check-env');
  });
});

// Each case below runs in its own fresh process; no pinned target is switched.
describe('getTarget and currentEnv in fresh processes', () => {
  const selections: [string, ChildEnv, 'dev' | 'prod'][] = [
    ['absent APP_ENV', {}, 'dev'],
    ['APP_ENV=dev', { APP_ENV: 'dev' }, 'dev'],
    ['APP_ENV=prod', { APP_ENV: 'prod' }, 'prod'],
    ['APP_ENV=prod with exact BASE_URL', { APP_ENV: 'prod', BASE_URL: PROD }, 'prod'],
  ];
  for (const [label, vars, env] of selections) {
    it(`selects ${env} for ${label}`, () => {
      assert.deepEqual(runScenario(['target'], vars), {
        env,
        baseURL: CANONICAL_BASE_URLS[env],
        currentEnv: env,
        frozen: true,
        samePinned: true,
      });
    });
  }

  const SENTINEL = 'leak-check-sentinel';
  const invalid: [string, ChildEnv][] = [
    ['unknown APP_ENV', { APP_ENV: SENTINEL }],
    ['empty APP_ENV', { APP_ENV: '' }],
    ['uppercase APP_ENV', { APP_ENV: 'PROD' }],
    ['mismatched BASE_URL', { BASE_URL: `https://${SENTINEL}.invalid` }],
    ['LOCAL_SANDBOX_DIR', { LOCAL_SANDBOX_DIR: `/tmp/${SENTINEL}` }],
  ];
  for (const [label, vars] of invalid) {
    it(`fails without echoing for ${label}`, () => {
      const result = runNode([HELPERS_CHILD, 'target'], vars);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /TargetConfigError/);
      assert.ok(!`${result.stdout}${result.stderr}`.includes(SENTINEL), 'output echoed input');
    });
  }

  it('rejects a change after the target is pinned', () => {
    assert.deepEqual(runScenario(['pin-change'], { APP_ENV: 'dev' }), {
      error: 'TargetConfigError',
    });
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { childEnv, runScenario } from './support/child.ts';

describe('envGuard with an in-memory dummy action', () => {
  for (const scenario of ['guard-sync', 'guard-async']) {
    it(`${scenario}: runs the action once on dev`, () => {
      assert.deepEqual(runScenario([scenario], { APP_ENV: 'dev' }), {
        calls: 1,
        result: 'changed',
        error: null,
      });
    });

    it(`${scenario}: throws before calling the action on prod`, () => {
      assert.deepEqual(runScenario([scenario], { APP_ENV: 'prod' }), {
        calls: 0,
        result: null,
        error: 'EnvGuardError',
      });
    });
  }
});

describe('runIfEnv with a recording fake test', () => {
  it('skips a dev-only test on prod and names both envs in the reason', () => {
    const { skips, error } = runScenario(['run-if-env', '["dev"]'], { APP_ENV: 'prod' });
    assert.equal(error, null);
    assert.deepEqual(skips, [{ condition: true, description: 'Skipped: selected env is prod; allowed: dev.' }]);
  });

  it('does not skip a dev-only test on dev', () => {
    const { skips } = runScenario(['run-if-env', '["dev"]'], { APP_ENV: 'dev' });
    assert.equal(skips.length, 1);
    assert.equal(skips[0].condition, false);
  });

  it('does not skip when both envs are allowed', () => {
    const { skips } = runScenario(['run-if-env', '["dev","prod"]'], { APP_ENV: 'prod' });
    assert.equal(skips[0].condition, false);
  });

  for (const allowed of ['[]', '["staging"]']) {
    it(`rejects allowed list ${allowed}`, () => {
      const { skips, error } = runScenario(['run-if-env', allowed], { APP_ENV: 'dev' });
      assert.equal(error, 'Error');
      assert.deepEqual(skips, []);
    });
  }
});

describe('runIfEnv inside Playwright (isolated fixture, no browser)', () => {
  const cli = createRequire(import.meta.url).resolve('@playwright/test/cli');
  const config = fileURLToPath(new URL('./fixtures/playwright/playwright.config.ts', import.meta.url));

  interface SpecResult {
    title: string;
    status: string;
    skipReasons: string[];
  }

  // The parts of Playwright's JSON reporter output that these checks read.
  interface JsonSuite {
    title: string;
    specs?: { title: string; tests: { status: string; annotations: { type: string; description?: string }[] }[] }[];
    suites?: JsonSuite[];
  }

  function collectSpecs(suite: JsonSuite, specs: SpecResult[] = []): SpecResult[] {
    for (const spec of suite.specs ?? []) {
      const [run] = spec.tests;
      specs.push({
        title: `${suite.title} > ${spec.title}`,
        status: run.status,
        skipReasons: run.annotations.filter((a) => a.type === 'skip').map((a) => a.description ?? ''),
      });
    }
    for (const child of suite.suites ?? []) collectSpecs(child, specs);
    return specs;
  }

  function runFixture(appEnv: 'dev' | 'prod'): SpecResult[] {
    const result = spawnSync(process.execPath, [cli, 'test', '--config', config], {
      env: childEnv({ APP_ENV: appEnv }),
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout) as { suites: JsonSuite[] };
    return report.suites.flatMap((suite) => collectSpecs(suite));
  }

  it('on dev: runs dev-only and both, skips prod-only with reason', () => {
    assert.deepEqual(runFixture('dev'), [
      { title: 'dev only > runs on dev', status: 'expected', skipReasons: [] },
      {
        title: 'prod only > runs on prod',
        status: 'skipped',
        skipReasons: ['Skipped: selected env is dev; allowed: prod.'],
      },
      { title: 'dev and prod > runs on both', status: 'expected', skipReasons: [] },
    ]);
  });

  it('on prod: runs prod-only and both, skips dev-only with reason', () => {
    assert.deepEqual(runFixture('prod'), [
      {
        title: 'dev only > runs on dev',
        status: 'skipped',
        skipReasons: ['Skipped: selected env is prod; allowed: dev.'],
      },
      { title: 'prod only > runs on prod', status: 'expected', skipReasons: [] },
      { title: 'dev and prod > runs on both', status: 'expected', skipReasons: [] },
    ]);
  });
});

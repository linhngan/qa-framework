import { CANONICAL_BASE_URLS, currentEnv, type AppEnv } from './target.ts';

// Structural, so Playwright's `test` fits without importing Playwright here.
export interface SkippableTest {
  skip(condition: boolean, description: string): void;
}

/** Skips the current test or group unless the selected env is allowed. */
export function runIfEnv(test: SkippableTest, allowed: readonly AppEnv[]): void {
  if (allowed.length === 0) {
    throw new Error('runIfEnv needs at least one allowed environment.');
  }
  if (!allowed.every((name) => Object.hasOwn(CANONICAL_BASE_URLS, name))) {
    throw new Error("runIfEnv allowed environments must be 'dev' or 'prod'.");
  }
  const env = currentEnv();
  test.skip(!allowed.includes(env), `Skipped: selected env is ${env}; allowed: ${allowed.join(', ')}.`);
}

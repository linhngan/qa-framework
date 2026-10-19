// Compile-only checks for `npm run typecheck`. Never executed.
import { test } from '@playwright/test';
import { envGuard } from '../env/envGuard.ts';
import { runIfEnv } from '../env/runIfEnv.ts';

export function typeChecks(): void {
  // Playwright's real `test` satisfies runIfEnv's structural parameter.
  runIfEnv(test, ['dev', 'prod']);

  // @ts-expect-error only 'dev' | 'prod' are allowed names
  runIfEnv(test, ['staging']);

  const result: string = envGuard(() => 'changed');
  // @ts-expect-error envGuard keeps the action's return type
  const wrong: number = envGuard(() => 'changed');
  void result;
  void wrong;
}

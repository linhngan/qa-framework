import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export interface ChildEnv {
  APP_ENV?: string;
  BASE_URL?: string;
  LOCAL_SANDBOX_DIR?: string;
}

export const HELPERS_CHILD = fileURLToPath(new URL('../fixtures/helpers-child.ts', import.meta.url));

// Start from the parent env minus every target variable, so the caller's shell
// cannot influence the result; then set only what the case asks for.
export function childEnv(vars: ChildEnv = {}): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.APP_ENV;
  delete env.BASE_URL;
  delete env.LOCAL_SANDBOX_DIR;
  delete env.NODE_TEST_CONTEXT;
  for (const [key, value] of Object.entries(vars)) {
    if (value !== undefined) env[key] = value;
  }
  return env;
}

/** Runs a Node script in a fresh process with a controlled target env. */
export function runNode(args: string[], vars: ChildEnv = {}) {
  return spawnSync(process.execPath, args, { env: childEnv(vars), encoding: 'utf8' });
}

/** Runs one helpers-child scenario and parses its single JSON line. */
export function runScenario(scenario: string[], vars: ChildEnv = {}) {
  const result = runNode([HELPERS_CHILD, ...scenario], vars);
  if (result.status !== 0) {
    throw new Error(`scenario ${scenario[0]} exited ${result.status}: ${result.stderr}`);
  }
  return JSON.parse(result.stdout.trim());
}

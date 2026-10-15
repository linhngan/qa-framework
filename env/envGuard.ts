import { currentEnv } from './target.ts';

export class EnvGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnvGuardError';
  }
}

/** Runs a data-changing action, or throws before calling it on prod. */
export function envGuard<T>(action: () => T): T {
  if (currentEnv() === 'prod') {
    throw new EnvGuardError('Data-changing action blocked on prod.');
  }
  return action();
}

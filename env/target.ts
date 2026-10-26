export type AppEnv = 'dev' | 'prod';

export interface Target {
  readonly env: AppEnv;
  readonly baseURL: string;
}

export interface TargetSettings {
  APP_ENV?: string;
  BASE_URL?: string;
  LOCAL_SANDBOX_DIR?: string;
}

export const CANONICAL_BASE_URLS: Readonly<Record<AppEnv, string>> = Object.freeze({
  dev: 'https://dev.ai-orchestration-courses.com',
  prod: 'https://ai-orchestration-courses.com',
});

// Messages never include the supplied value, so bad input cannot leak into logs.
export class TargetConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TargetConfigError';
  }
}

/** Pure: validates the given settings and returns the one allowed target. */
export function resolveTarget(settings: TargetSettings = {}): Target {
  if (settings.LOCAL_SANDBOX_DIR !== undefined) {
    throw new TargetConfigError('LOCAL_SANDBOX_DIR is not supported.');
  }

  let env: AppEnv;
  if (settings.APP_ENV === undefined || settings.APP_ENV === 'dev') {
    env = 'dev';
  } else if (settings.APP_ENV === 'prod') {
    env = 'prod';
  } else {
    throw new TargetConfigError("APP_ENV must be exactly 'dev' or 'prod'.");
  }

  const canonical = CANONICAL_BASE_URLS[env];
  if (settings.BASE_URL !== undefined && settings.BASE_URL !== canonical) {
    throw new TargetConfigError(`BASE_URL does not match the canonical address for ${env}; leave it unset.`);
  }

  return Object.freeze({ env, baseURL: canonical });
}

type Snapshot = Required<Record<keyof TargetSettings, string | undefined>>;

let pinned: { snapshot: Snapshot; target: Target } | undefined;

function snapshotEnv(): Snapshot {
  return {
    APP_ENV: process.env.APP_ENV,
    BASE_URL: process.env.BASE_URL,
    LOCAL_SANDBOX_DIR: process.env.LOCAL_SANDBOX_DIR,
  };
}

/** Resolves from process.env once and pins the result for this process. */
export function getTarget(): Target {
  const snapshot = snapshotEnv();
  if (!pinned) {
    pinned = { snapshot, target: resolveTarget(snapshot) };
    return pinned.target;
  }
  const changed = (Object.keys(snapshot) as (keyof Snapshot)[]).some((key) => snapshot[key] !== pinned!.snapshot[key]);
  if (changed) {
    throw new TargetConfigError('Target changed after it was pinned; start a new process to switch environments.');
  }
  return pinned.target;
}

/** The pinned environment name for this process. */
export function currentEnv(): AppEnv {
  return getTarget().env;
}

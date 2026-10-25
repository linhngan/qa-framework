#!/usr/bin/env node
/**
 * pre-push-check.mjs — pre-push gate (Task 08).
 *
 *   node scripts/git-hooks/pre-push-check.mjs   run from .husky/pre-push
 *
 * 1. Reads Git's pre-push stdin, one line per ref:
 *      <local ref> <local object> <remote ref> <remote object>
 *    and refuses any push whose destination is refs/heads/main, whatever the local
 *    branch is called (`git push origin week-2:main` is refused too), including a
 *    delete of main.
 *    ALLOW_MAIN_PUSH=1 lifts only this refusal, for an exceptional, approved push
 *    to main. Course work never needs it: weeks reach main by reviewed PRs.
 * 2. Then runs `npm run typecheck` and `npm run test:list` (dev). Listing loads
 *    the config and specs but starts no browser and runs no test.
 *
 * Any refusal or failing command exits 1, and Git cancels the push.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const PROTECTED_REF = 'refs/heads/main';

/** Destination refs from Git's pre-push stdin. */
function destinationRefs(stdin) {
  return stdin
    .split('\n')
    .map((line) => line.trim().split(/\s+/))
    .filter((fields) => fields.length === 4)
    .map((fields) => fields[2]);
}

function run(command, args) {
  process.stderr.write(`pre-push: running ${[command, ...args].join(' ')}\n`);
  const result = spawnSync(command, args, { stdio: ['ignore', 'inherit', 'inherit'] });
  if (result.error) {
    process.stderr.write(`pre-push: BLOCKED — could not start ${command} (${result.error.message}).\n`);
    return false;
  }
  if (result.status !== 0) {
    process.stderr.write(`pre-push: BLOCKED — ${[command, ...args].join(' ')} failed (exit ${result.status}).\n`);
    return false;
  }
  return true;
}

function main() {
  let stdin;
  try {
    stdin = readFileSync(0, 'utf8');
  } catch {
    stdin = ''; // no stdin: nothing to check for main, still run the checks
  }

  if (destinationRefs(stdin).includes(PROTECTED_REF)) {
    if (process.env.ALLOW_MAIN_PUSH === '1') {
      process.stderr.write(`pre-push: ALLOW_MAIN_PUSH=1 is set; allowing a push to ${PROTECTED_REF}.\n`);
    } else {
      process.stderr.write(
        `pre-push: BLOCKED — this push updates ${PROTECTED_REF}. Open a pull request instead. ` +
          `Only for an exceptional, approved push: ALLOW_MAIN_PUSH=1 git push … (see README).\n`,
      );
      return 1;
    }
  }

  if (!run('npm', ['run', 'typecheck'])) return 1;
  if (!run('npm', ['run', 'test:list'])) return 1;
  return 0;
}

process.exitCode = main();

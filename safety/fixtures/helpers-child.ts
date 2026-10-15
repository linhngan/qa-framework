// Runs one scenario in a fresh process and prints a single JSON line.
// Only in-memory dummies: no browser, database or network.
import { currentEnv, getTarget, type AppEnv } from '../../env/target.ts';
import { envGuard } from '../../env/envGuard.ts';
import { runIfEnv } from '../../env/runIfEnv.ts';

const [scenario, arg] = process.argv.slice(2);
const out = (value: unknown) => console.log(JSON.stringify(value));
const errorName = (error: unknown) => (error instanceof Error ? error.name : 'unknown');

switch (scenario) {
  case 'target': {
    const target = getTarget();
    out({
      env: target.env,
      baseURL: target.baseURL,
      currentEnv: currentEnv(),
      frozen: Object.isFrozen(target),
      samePinned: getTarget() === target,
    });
    break;
  }
  case 'pin-change': {
    getTarget();
    process.env.APP_ENV = process.env.APP_ENV === 'prod' ? 'dev' : 'prod';
    try {
      getTarget();
      out({ error: null });
    } catch (error) {
      out({ error: errorName(error) });
    }
    break;
  }
  case 'guard-sync': {
    let calls = 0;
    try {
      const result = envGuard(() => {
        calls += 1;
        return 'changed';
      });
      out({ calls, result, error: null });
    } catch (error) {
      out({ calls, result: null, error: errorName(error) });
    }
    break;
  }
  case 'guard-async': {
    let calls = 0;
    try {
      const result = await envGuard(async () => {
        calls += 1;
        return 'changed';
      });
      out({ calls, result, error: null });
    } catch (error) {
      out({ calls, result: null, error: errorName(error) });
    }
    break;
  }
  case 'run-if-env': {
    const allowed = JSON.parse(arg) as AppEnv[];
    const skips: { condition: boolean; description: string }[] = [];
    const fakeTest = {
      skip(condition: boolean, description: string) {
        skips.push({ condition, description });
      },
    };
    try {
      runIfEnv(fakeTest, allowed);
      out({ skips, error: null });
    } catch (error) {
      out({ skips, error: errorName(error) });
    }
    break;
  }
  default:
    throw new Error('Unknown scenario.');
}

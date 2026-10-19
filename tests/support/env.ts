// Compatibility wrapper: shares the resolver used by playwright.config.ts.
// Do not import playwright.config.ts here.
import { currentEnv, getTarget } from '../../env/target';

export { currentEnv };
export const baseURL = getTarget().baseURL;

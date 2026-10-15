import { defineConfig, devices } from '@playwright/test';
import { getTarget } from './env/target';

const { baseURL } = getTarget();

export default defineConfig({
  testDir: 'tests',
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    testIdAttribute: 'data-testid',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});

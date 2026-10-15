// Isolated config for checking runIfEnv inside Playwright. Specs here never use
// `page`, so no browser starts, and there is no baseURL or network access.
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: '*.fixture.ts',
  workers: 1,
  retries: 0,
  reporter: 'json',
});

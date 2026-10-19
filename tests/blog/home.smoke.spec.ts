import { test, expect } from '@playwright/test';
import { runIfEnv } from '../../env/runIfEnv';

test.describe('Blog home (dev smoke)', () => {
  runIfEnv(test, ['dev']);

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('banner is visible and identifies DEVELOPMENT', async ({ page }) => {
    const banner = page.getByTestId('env-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('DEVELOPMENT');
  });

  test('first article card is visible and at least one card exists', async ({ page }) => {
    const cards = page.getByTestId('article-item');
    await expect(cards.first()).toBeVisible();
  });
});

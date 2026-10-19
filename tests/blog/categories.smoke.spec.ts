import { test, expect } from '@playwright/test';
import { runIfEnv } from '../../env/runIfEnv';
import { loginViaUi } from '../support/auth';
import { AUTHOR } from '../support/users';

test.describe('Categories (dev smoke)', () => {
  runIfEnv(test, ['dev']);

  test('signed-in author sees the category list with at least one item', async ({ page }) => {
    await loginViaUi(page, AUTHOR);
    await page.goto('/categories');

    const list = page.getByTestId('category-list');
    await expect(list).toBeVisible();
    await expect(list.getByTestId('category-item').first()).toBeVisible();
  });
});

import { test, expect } from '@playwright/test';
import { runIfEnv } from '../../env/runIfEnv';
import { CategoriesPage } from '../../pages/CategoriesPage';
import { LoginPage } from '../../pages/LoginPage';
import { AUTHOR } from '../support/users';

test.describe('Categories (dev smoke)', () => {
  runIfEnv(test, ['dev']);

  test('signed-in author sees the category list with at least one item', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.open();
    await loginPage.login(AUTHOR.email, AUTHOR.password);

    const categories = new CategoriesPage(page);
    await categories.open();

    await expect(categories.list).toBeVisible();
    await expect(categories.items.first()).toBeVisible();
  });
});

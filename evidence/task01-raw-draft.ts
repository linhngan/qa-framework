import { test, expect } from '@playwright/test';
import { runIfEnv } from '../../env/runIfEnv';

test.describe('Article detail (dev smoke)', () => {
  runIfEnv(test, ['dev']);

  test('opening the first article card shows its title on the detail page', async ({ page }) => {
    await page.goto('/');

    const firstLink = page.getByTestId('article-item').first().getByTestId('article-link');
    const clickedTitle = (await firstLink.innerText()).trim();
    await firstLink.click();

    await expect(page).toHaveURL(/\/articles\/[^/]+$/);
    await expect(page.getByTestId('article-detail')).toBeVisible();
    await expect(page.getByTestId('article-title')).toHaveText(clickedTitle);
  });
});

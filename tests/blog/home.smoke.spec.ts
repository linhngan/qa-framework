import { test, expect } from '@playwright/test';
import { runIfEnv } from '../../env/runIfEnv';
import { BlogListPage } from '../../pages/BlogListPage';

test.describe('Blog home (dev smoke)', () => {
  runIfEnv(test, ['dev']);

  let blog: BlogListPage;

  test.beforeEach(async ({ page }) => {
    blog = new BlogListPage(page);
    await blog.open();
  });

  test('banner is visible and identifies DEVELOPMENT', async () => {
    await expect(blog.banner).toBeVisible();
    await expect(blog.banner).toContainText('DEVELOPMENT');
  });

  test('first article card is visible and at least one card exists', async () => {
    await expect(blog.articleItems.first()).toBeVisible();
  });
});

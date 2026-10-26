import { test, expect } from '@playwright/test';
import { runIfEnv } from '../../env/runIfEnv';
import { BlogListPage } from '../../pages/BlogListPage';

test.describe('Blog category filter (dev smoke)', () => {
  runIfEnv(test, ['dev']);

  // TC-UI-024 (SCRUM-120): the category filter narrows the list to that category
  test('visitor who filters by Playwright sees only Playwright articles', async ({ page }) => {
    const blog = new BlogListPage(page);
    await blog.open();
    await blog.filterByCategory('Playwright');

    await expect(blog.articleItems.first()).toBeVisible();
    for (const category of await blog.articleCategories.allInnerTexts()) {
      expect(category.trim()).toBe('Playwright');
    }
  });
});

import { test, expect } from '@playwright/test';
import { runIfEnv } from '../../env/runIfEnv';
import { ArticleDetailPage } from '../../pages/ArticleDetailPage';
import { BlogListPage } from '../../pages/BlogListPage';

test.describe('Article detail (dev smoke)', () => {
  runIfEnv(test, ['dev']);

  // TC-UI-030 (SCRUM-121): article page renders via slug navigation
  test('visitor who opens the first article sees the same title on its article page', async ({ page }) => {
    const blog = new BlogListPage(page);
    await blog.open();
    const clickedTitle = await blog.openFirstArticle();

    const article = new ArticleDetailPage(page);
    await expect(page).toHaveURL(/\/articles\/[^/]+$/);
    await expect(article.detail).toBeVisible();
    await expect(article.title).toHaveText(clickedTitle);
  });
});

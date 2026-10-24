import type { Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage';

export class BlogListPage extends BasePage {
  readonly articleItems: Locator;
  readonly firstArticleLink: Locator;

  constructor(page: Page) {
    super(page);
    this.articleItems = page.getByTestId('article-item');
    this.firstArticleLink = this.articleItems.first().getByTestId('article-link');
  }

  async open(): Promise<void> {
    await this.page.goto('/');
  }

  /** Opens the first article and returns the title that was clicked. */
  async openFirstArticle(): Promise<string> {
    const title = (await this.firstArticleLink.innerText()).trim();
    await this.firstArticleLink.click();
    return title;
  }
}

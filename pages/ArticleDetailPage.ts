import type { Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage';

export class ArticleDetailPage extends BasePage {
  readonly detail: Locator;
  readonly title: Locator;

  constructor(page: Page) {
    super(page);
    this.detail = page.getByTestId('article-detail');
    this.title = page.getByTestId('article-title');
  }
}

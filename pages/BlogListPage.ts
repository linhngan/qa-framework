import type { Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage';

export class BlogListPage extends BasePage {
  readonly articleItems: Locator;
  readonly firstArticleLink: Locator;
  readonly articleCategories: Locator;
  readonly categorySelect: Locator;
  readonly filterButton: Locator;

  constructor(page: Page) {
    super(page);
    this.articleItems = page.getByTestId('article-item');
    this.firstArticleLink = this.articleItems.first().getByTestId('article-link');
    this.articleCategories = this.articleItems.getByTestId('article-category');
    this.categorySelect = page.getByTestId('category-select');
    this.filterButton = page.getByTestId('filter-submit');
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

  /** Filters the list by a category's visible name and waits for the filtered page. */
  async filterByCategory(name: string): Promise<void> {
    await this.categorySelect.selectOption({ label: name });
    await this.filterButton.click();
    await this.page.waitForURL((url) => url.searchParams.has('category'));
  }
}

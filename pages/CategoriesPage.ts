import type { Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage';

export class CategoriesPage extends BasePage {
  readonly list: Locator;
  readonly items: Locator;

  constructor(page: Page) {
    super(page);
    this.list = page.getByTestId('category-list');
    this.items = this.list.getByTestId('category-item');
  }

  async open(): Promise<void> {
    await this.page.goto('/categories');
  }
}

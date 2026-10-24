import type { Locator, Page } from '@playwright/test';

/** Shared parts of every app page. */
export class BasePage {
  readonly page: Page;
  readonly banner: Locator;

  constructor(page: Page) {
    this.page = page;
    this.banner = page.getByTestId('env-banner');
  }
}

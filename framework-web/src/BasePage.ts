import type { Page, Locator } from "@playwright/test";

/**
 * Base page object. All application page objects should extend this class.
 */
export abstract class BasePage {
  protected readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async navigate(url: string): Promise<void> {
    await this.page.goto(url);
  }

  async getTitle(): Promise<string> {
    return this.page.title();
  }

  protected locator(selector: string): Locator {
    return this.page.locator(selector);
  }
}

import type { Locator } from "@playwright/test";

/**
 * Base class for reusable, container-scoped UI components (navbars, modals,
 * cards). A component wraps a container locator; all lookups and actions are
 * scoped to that container.
 */
export abstract class PageComponent {
  protected readonly container: Locator;

  constructor(container: Locator) {
    this.container = container;
  }

  protected locator(selector: string): Locator {
    return this.container.locator(selector);
  }

  async isVisible(): Promise<boolean> {
    return this.container.isVisible();
  }

  async waitForVisible(): Promise<void> {
    await this.container.waitFor({ state: "visible" });
  }
}

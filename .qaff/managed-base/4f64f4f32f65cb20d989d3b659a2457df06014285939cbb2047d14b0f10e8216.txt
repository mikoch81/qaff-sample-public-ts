import { BasePage } from "@client-demo-public-ts-qa/framework-web";
import type { Page, Locator } from "@playwright/test";

/**
 * Locators for the external target (web.target: external) come from web.smoke in
 * qa-factory.yaml; override at runtime with QAFF_WEB_SMOKE_HEADING_SELECTOR /
 * QAFF_WEB_SMOKE_ITEM_SELECTOR. Let the spec assert with web-first assertions.
 */
export class DemoTodoHomePage extends BasePage {
  readonly heading: Locator;
  readonly item: Locator;

  constructor(page: Page) {
    super(page);
    this.heading = page.locator(process.env.QAFF_WEB_SMOKE_HEADING_SELECTOR ?? "h1").first();
    this.item = page.locator(process.env.QAFF_WEB_SMOKE_ITEM_SELECTOR ?? ".new-todo").first();
  }
}

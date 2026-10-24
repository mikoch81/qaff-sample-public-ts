import { BasePage } from "@client-demo-public-ts-qa/framework-web";
import type { Page, Locator } from "@playwright/test";

/**
 * Locators for the external target (web.target: external) come from web.smoke in
 * qa-factory.yaml; override at runtime with QAFF_WEB_SMOKE_HEADING_SELECTOR /
 * QAFF_WEB_SMOKE_ITEM_SELECTOR. QAFF_WEB_TARGET=fixture switches to the bundled
 * fixture's h1 / p. Let the spec assert with web-first assertions.
 */
const useFixture = process.env.QAFF_WEB_TARGET?.trim().toLowerCase() === "fixture";

export class DemoTodoMobileHomePage extends BasePage {
  readonly heading: Locator;
  readonly item: Locator;

  constructor(page: Page) {
    super(page);
    this.heading = page.locator(process.env.QAFF_WEB_SMOKE_HEADING_SELECTOR ?? (useFixture ? "h1" : "h1")).first();
    this.item = page.locator(process.env.QAFF_WEB_SMOKE_ITEM_SELECTOR ?? (useFixture ? "p" : ".new-todo")).first();
  }
}

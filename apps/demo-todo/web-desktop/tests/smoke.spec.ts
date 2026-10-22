import { test, expect } from "@playwright/test";
import { DemoTodoHomePage } from "../pages/DemoTodoHomePage";

// External target: QAFF_WEB_BASE_URL overrides the configured URL and
// QAFF_WEB_SMOKE_HEADING_TEXT the expected heading text (see web.smoke in qa-factory.yaml).
const baseUrl = process.env.QAFF_WEB_BASE_URL ?? "https://demo.playwright.dev/todomvc";
const headingText = process.env.QAFF_WEB_SMOKE_HEADING_TEXT ?? "todos";

test.describe("Demo Todo — smoke", () => {
  test("home page shows the expected heading and item", async ({ page }) => {
    const homePage = new DemoTodoHomePage(page);
    await homePage.navigate(baseUrl);
    // Web-first assertions: they auto-retry until the condition holds.
    await expect(homePage.heading).toContainText(headingText);
    await expect(homePage.item).toBeVisible();
  });
});

import { test, expect, devices } from "@playwright/test";
import { DemoTodoMobileHomePage } from "../pages/DemoTodoMobileHomePage";

// Apply mobile device emulation for all tests in this file.
test.use({ ...devices["Pixel 7"] });

// External target: QAFF_WEB_BASE_URL overrides the configured URL and
// QAFF_WEB_SMOKE_HEADING_TEXT the expected heading text (see web.smoke in qa-factory.yaml).
const baseUrl = process.env.QAFF_WEB_BASE_URL ?? "https://demo.playwright.dev/todomvc";
const headingText = process.env.QAFF_WEB_SMOKE_HEADING_TEXT ?? "todos";

test.describe("Demo Todo — mobile smoke", () => {
  test("home page shows the expected heading and item", async ({ page }) => {
    const homePage = new DemoTodoMobileHomePage(page);
    await homePage.navigate(baseUrl);
    // Web-first assertions: they auto-retry until the condition holds.
    await expect(homePage.heading).toContainText(headingText);
    await expect(homePage.item).toBeVisible();
  });
});

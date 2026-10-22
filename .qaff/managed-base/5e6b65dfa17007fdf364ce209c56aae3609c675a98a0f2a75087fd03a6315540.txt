import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./apps",
  testMatch: "**/*.spec.ts",
  testIgnore: "**/dist/**",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [["html", { outputFolder: "playwright-report" }], ["allure-playwright", { resultsDir: "allure-results" }]],
  use: {
    // Point at your real application once you outgrow the bundled file://
    // fixtures, e.g.: baseURL: process.env.BASE_URL ?? "http://localhost:3000"
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  // One project per generated layer; each spec runs exactly once.
  projects: [
    {
      name: "web-desktop",
      testMatch: "**/web-desktop/**/*.spec.ts",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "web-mobile",
      testMatch: "**/web-mobile/**/*.spec.ts",
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "api",
      testMatch: "**/api/**/*.spec.ts",
    },
  ],
});

import { defineConfig, devices } from "@playwright/test";

/**
 * MIVO end-to-end tests.
 *
 * The app must already be running (locally `npm run dev` in the mivo folder; in CI the workflow
 * starts a production build). Point the tests elsewhere with BASE_URL.
 *
 * Test data: global-setup creates one fresh buyer per browser in the database, and
 * global-teardown removes every @mivo.test user and their orders, putting the stock back.
 */
export default defineConfig({
  testDir: "./tests",
  globalSetup: "./global-setup.ts",
  globalTeardown: "./global-teardown.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Three browsers at once are heavy; more workers than this exhausts memory on a laptop.
  workers: process.env.CI ? 2 : 3,
  // The dev server compiles pages on first visit, which can take a while.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [
    ["list"],
    ["html", { outputFolder: "../reports/playwright-html", open: "never" }],
  ],
  outputDir: "../reports/playwright-results",
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    navigationTimeout: 60_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});

import { defineConfig, devices } from "@playwright/test";

// The respondent flow is tested at 390px first (spec section 6), in both themes.
export default defineConfig({
  testDir: "./e2e",
  // One database, shared by every spec, so the suite runs in order rather than racing itself.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "list" : "html",
  use: { baseURL: "http://127.0.0.1:3100", trace: "on-first-retry" },
  projects: [
    {
      name: "phone-light",
      testMatch: /smoke\.spec\.ts/,
      use: { ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, colorScheme: "light" },
    },
    {
      name: "phone-dark",
      testMatch: /smoke\.spec\.ts/,
      use: { ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, colorScheme: "dark" },
    },
    {
      // The console writes to one settings row, so it runs in one project and in order.
      name: "console",
      testMatch: /console\.spec\.ts/,
      use: { ...devices["iPhone 13"], viewport: { width: 390, height: 844 } },
    },
    {
      // One study, one rehearsal link, walked in order. 390px, because that is where it
      // will actually be answered.
      name: "survey",
      testMatch: /survey\.spec\.ts/,
      use: { ...devices["iPhone 13"], viewport: { width: 390, height: 844 } },
    },
    {
      // Registry, import and the draw. Runs after the survey project, which creates the study.
      name: "contacts",
      testMatch: /contacts\.spec\.ts/,
      dependencies: ["survey"],
      use: { ...devices["iPhone 13"], viewport: { width: 390, height: 844 } },
    },
  ],
  webServer: {
    command: "npm run start -- --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

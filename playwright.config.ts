import { defineConfig, devices } from "@playwright/test";

// The respondent flow is tested at 390px first (spec section 6), in both themes.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "list" : "html",
  use: { baseURL: "http://127.0.0.1:3100", trace: "on-first-retry" },
  projects: [
    {
      name: "phone-light",
      use: { ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, colorScheme: "light" },
    },
    {
      name: "phone-dark",
      use: { ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, colorScheme: "dark" },
    },
  ],
  webServer: {
    command: "npm run start -- --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

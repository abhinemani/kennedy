import { defineConfig, devices } from "@playwright/test";

// The respondent flow is tested at 390px first (spec section 6), in both themes.
export default defineConfig({
  testDir: "./e2e",
  // One database, shared by every spec, so the suite runs in order rather than racing itself.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // In CI the list goes to the log and the report is uploaded as an artifact on failure.
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "html",
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
    {
      // The operator's real files, when they are on this machine. Skips itself otherwise,
      // and runs on its own because it loads the whole country into the registry.
      name: "real-files",
      testMatch: /real-files\.spec\.ts/,
      use: { ...devices["iPhone 13"], viewport: { width: 390, height: 844 } },
    },
    {
      // The form editor. It writes the same file as the text view, so it runs after
      // everything that depends on the study file being what it started as.
      name: "edit",
      testMatch: /edit\.spec\.ts/,
      dependencies: ["interviews"],
      use: { ...devices["iPhone 13"], viewport: { width: 390, height: 844 } },
    },
    {
      // Sample data. It adds contacts every other spec would otherwise draw, so it runs
      // last, and it removes everything it loaded before it finishes.
      name: "sample-data",
      testMatch: /sample-data\.spec\.ts/,
      dependencies: ["edit"],
      use: { ...devices["iPhone 13"], viewport: { width: 390, height: 844 } },
    },
    {
      // The interview stage. Its conversation rules are unit-tested; this covers who is
      // offered one, and what the console says when it cannot run.
      name: "interviews",
      testMatch: /interviews\.spec\.ts/,
      dependencies: ["themes"],
      use: { ...devices["iPhone 13"], viewport: { width: 390, height: 844 } },
    },
    {
      // Coding written answers. Runs after results, which is where responses get reviewed.
      name: "themes",
      testMatch: /themes\.spec\.ts/,
      dependencies: ["results"],
      use: { ...devices["iPhone 13"], viewport: { width: 390, height: 844 } },
    },
    {
      // Results, review and exports. Needs responses and a send history behind it.
      name: "results",
      testMatch: /results\.spec\.ts/,
      dependencies: ["sending"],
      use: { ...devices["iPhone 13"], viewport: { width: 390, height: 844 } },
    },
    {
      // Sending. Needs a drawn sample, so it runs last. It pauses and unpauses a study and
      // trips the circuit breaker, which is why nothing else may run beside it.
      name: "sending",
      testMatch: /sending\.spec\.ts/,
      dependencies: ["contacts"],
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

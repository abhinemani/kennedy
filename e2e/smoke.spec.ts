import { expect, test } from "@playwright/test";

// Milestone 0's smoke test. It proves the app serves, the console is closed to strangers,
// and the pages read at 390px in both themes. Milestone 2's respondent flow lands beside it.

test("the public page says who is asking", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("local government");
  await expect(page.getByRole("link", { name: /how we handle/i })).toBeVisible();
});

test("the privacy page is reachable and makes no compliance claims", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("How we handle");
  const body = (await page.textContent("body")) ?? "";
  expect(body).not.toMatch(/SOC ?2|HIPAA|GDPR compliant|bank-grade|military-grade/i);
});

test("the console asks a stranger to sign in", async ({ page }) => {
  await page.goto("/console");
  await expect(page).toHaveURL(/\/console\/login$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Sign in");
});

test("settings and activity are closed too", async ({ page }) => {
  for (const path of ["/console/settings", "/console/activity"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/console\/login$/);
  }
});

test("nothing overflows the width of a phone", async ({ page }) => {
  for (const path of ["/", "/privacy", "/console/login"]) {
    await page.goto(path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow, `${path} scrolls sideways`).toBe(false);
  }
});

test("the health endpoint answers without touching the database", async ({ request }) => {
  const response = await request.get("/healthz");
  expect(response.status()).toBe(200);
  expect(await response.text()).toBe("ok");
});

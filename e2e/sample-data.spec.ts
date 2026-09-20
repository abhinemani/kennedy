import { expect, test, type Page } from "@playwright/test";

// Sample data. One press fills every screen with obviously fake records, and one press takes
// them all away again. Both are checked through the console, because that is the only place
// the operator will ever do either (rule 10).

const configured = Boolean(process.env.DATABASE_URL && process.env.OPERATOR_PASSPHRASE);
const passphrase = process.env.OPERATOR_PASSPHRASE ?? "";

test.skip(!configured, "needs DATABASE_URL and OPERATOR_PASSPHRASE");
test.describe.configure({ mode: "serial" });

const STUDY = "sample-records-study";
const SAID = "[role=status]";

async function signIn(page: Page) {
  await page.goto("/console/login");
  await page.getByLabel("Passphrase").fill(passphrase);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/console$/);
}

/** Downloads run from inside the page so the signed-in cookie goes with them. */
async function download(page: Page, path: string): Promise<string> {
  const result = await page.evaluate(async (url) => {
    const response = await fetch(url, { credentials: "same-origin" });
    return { ok: response.ok, status: response.status, body: await response.text() };
  }, path);
  expect(result.ok, `${path} returned ${result.status}`).toBe(true);
  return result.body;
}

test("one press loads the sample data, and pressing again is refused", async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page);
  await page.goto("/console/settings");

  // A previous run may have left it loaded. Start clean either way.
  const remove = page.getByRole("button", { name: "Remove sample data" });
  if (await remove.count()) {
    await remove.click();
    await expect(page.locator(SAID).filter({ hasText: /Sample data removed/ })).toBeVisible({ timeout: 60_000 });
    await page.goto("/console/settings");
  }

  await page.getByRole("button", { name: "Load sample data" }).click();
  await expect(page.locator(SAID).filter({ hasText: /Sample data loaded/ })).toBeVisible({ timeout: 120_000 });

  await page.goto("/console/settings");
  await expect(page.getByRole("button", { name: "Remove sample data" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Load sample data" })).toHaveCount(0);
  await expect(page.locator(".panel", { hasText: "Sample data is loaded" })).toContainText("fake governments");
});

test("every screen has something on it", async ({ page }) => {
  await signIn(page);

  await page.goto("/console/studies");
  await expect(page.getByText("Sample study (fake data)")).toBeVisible();

  await page.goto(`/console/studies/${STUDY}`);
  await expect(page.locator("p.sub")).toContainText(/Fielding.*published version 1.*\d+ complete of \d+ started/);

  await page.goto(`/console/studies/${STUDY}/results`);
  await expect(page.getByRole("heading", { name: "Where the sample stands" })).toBeVisible();
  const funnel = page.locator(".funnel");
  await expect(funnel).toContainText("Link loaded");
  await expect(funnel).toContainText("Pressed Start");
  await expect(page.locator("table").nth(1)).toContainText("Effective n");

  await page.goto(`/console/studies/${STUDY}/responses`);
  await expect(page.getByRole("button", { name: "Exclude" }).first()).toBeVisible();
  await expect(page.getByText(/finished faster than seems possible/).first()).toBeVisible();

  await page.goto(`/console/studies/${STUDY}/themes`);
  await expect(page.locator(".rows").first()).toContainText("Waiting on legal review");

  await page.goto(`/console/studies/${STUDY}/interviews`);
  await expect(page.locator("p.sub")).toContainText(/[1-9]\d* conversations, [1-9]\d* finished/);

  await page.goto(`/console/studies/${STUDY}/follow-ups`);
  await expect(page.locator("section").first()).toContainText("Left out: already answered");

  await page.goto(`/console/studies/${STUDY}/sample`);
  await expect(page.locator("body")).toContainText(/Already drawn|drawn/i);

  await page.goto("/console/contacts/lists");
  await expect(page.locator("body")).toContainText("Sample clerks list");
  await expect(page.locator(".list", { hasText: "Clerks" })).not.toContainText("none yet");

  await page.goto("/console/contacts/panel");
  await expect(page.locator("body")).toContainText(/\(sample\)/);

  await page.goto("/console/contacts/review");
  await expect(page.locator("body")).toContainText("Springfield");

  // The anonymised export carries no person and no government, even fake ones.
  const answers = await download(page, `/console/studies/${STUDY}/exports/answers`);
  expect(answers.split("\n").length).toBeGreaterThan(10);
  expect(answers).not.toMatch(/Placeholder|Fictional|Notreal|Testcase|\(sample\)|sample\.example/);
});

test("the one identified export says (sample) on every row", async ({ page }) => {
  await signIn(page);
  const body = await download(page, `/console/studies/${STUDY}/exports/hand-raises`);
  const rows = body.trim().split("\n").slice(1);
  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) expect(row).toContain("(sample)");
});

test("one press removes it all, and only it", async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page);
  await page.goto("/console/settings");
  await page.getByRole("button", { name: "Remove sample data" }).click();
  await expect(page.locator(SAID).filter({ hasText: /Sample data removed/ })).toBeVisible({ timeout: 60_000 });

  await page.goto("/console/settings");
  await expect(page.getByRole("button", { name: "Load sample data" })).toBeVisible();

  await page.goto("/console/studies");
  await expect(page.getByText("Sample study (fake data)")).toHaveCount(0);
  // The worked example every other spec uses is untouched.
  await expect(page.locator("body")).toContainText("Public records workload");

  await page.goto("/console/contacts/lists");
  await expect(page.locator("body")).not.toContainText("Sample clerks list");

  await page.goto("/console/contacts/review");
  await expect(page.locator("body")).not.toContainText("Springfield");
});

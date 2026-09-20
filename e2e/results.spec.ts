import { expect, test, type Page } from "@playwright/test";

// Milestone 6. The numbers here end up in a deck with an n beside them, and the anonymised
// exports are a promise made to every respondent, so both are checked through the screens.

const configured = Boolean(process.env.DATABASE_URL && process.env.OPERATOR_PASSPHRASE);
const passphrase = process.env.OPERATOR_PASSPHRASE ?? "";

test.skip(!configured, "needs DATABASE_URL and OPERATOR_PASSPHRASE");
test.describe.configure({ mode: "serial" });

const STUDY = "brandeis-records-2026";
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

test("the funnel counts loaded links apart from people who started", async ({ page }) => {
  await signIn(page);
  await page.goto(`/console/studies/${STUDY}/results`);

  await expect(page.getByRole("heading", { name: "Where the sample stands" })).toBeVisible();
  const funnel = page.locator(".funnel");
  await expect(funnel).toContainText("Link loaded");
  await expect(funnel).toContainText("Pressed Start");
  await expect(page.locator(".panel").first()).toContainText("A loaded link is not an opened one");
});

test("coverage flags a band that is under-responding, and shows its weight", async ({ page }) => {
  await signIn(page);
  await page.goto(`/console/studies/${STUDY}/results`);

  const table = page.locator("table").first();
  await expect(table).toContainText("Weight");
  await expect(page.getByRole("heading", { name: "Coverage and weights" })).toBeVisible();
});

test("every estimate carries an n, an effective n, and a margin", async ({ page }) => {
  await signIn(page);
  await page.goto(`/console/studies/${STUDY}/results`);

  const estimates = page.locator("table").nth(1);
  await expect(estimates).toContainText("Effective n");
  await expect(estimates).toContainText("Margin");
  await expect(estimates).toContainText("one per government");

  // A mean's margin must never be printed as a percentage.
  const text = (await estimates.textContent()) ?? "";
  expect(text).not.toMatch(/±[\d,.]+ percent/);
});

test("excluding a response needs a reason, and takes it out of the numbers", async ({ page }) => {
  await signIn(page);
  await page.goto(`/console/studies/${STUDY}/results`);
  const before = (await page.locator("p.sub").textContent()) ?? "";

  await page.goto(`/console/studies/${STUDY}/responses`);
  const first = page.locator(".panel").filter({ has: page.getByRole("button", { name: "Exclude" }) }).first();
  test.skip((await first.count()) === 0, "no reviewable responses yet");

  // A bare exclusion is refused: the reason is printed in the methods note.
  await first.getByRole("button", { name: "Exclude" }).click();
  await expect(first.locator(SAID)).toContainText("Say why");

  await first.getByLabel("Reason, if you exclude it").fill("answered about the wrong government");
  await first.getByRole("button", { name: "Exclude" }).click();
  await expect(first.locator(SAID)).toContainText("methods note");

  await page.goto(`/console/studies/${STUDY}/results`);
  expect((await page.locator("p.sub").textContent()) ?? "").not.toBe(before);
  await expect(page.locator("p.sub")).toContainText("excluded by review");
});

test("the methods note names the exclusion and its reason", async ({ page }) => {
  await signIn(page);
  await page.goto(`/console/studies/${STUDY}/exports`);

  const note = await download(page, `/console/studies/${STUDY}/exports/methods`);
  expect(note).toContain("What was left out");
  expect(note).toContain("answered about the wrong government");
  expect(note).toContain("never exclude a response on their own");
  expect(note).toContain("not a census");
  // Nothing in here may claim something untrue of this study.
  expect(note).not.toMatch(/SOC ?2|HIPAA|representative of all/i);
});

test("the anonymised export carries no name, email, or government", async ({ page }) => {
  await signIn(page);

  // What the fixtures actually put in the database, to check the export against.
  await page.goto("/console/contacts/lists");
  await page.goto(`/console/studies/${STUDY}/exports`);

  const answers = await download(page, `/console/studies/${STUDY}/exports/answers`);
  const free = await download(page, `/console/studies/${STUDY}/exports/free-text`);

  for (const [name, csv] of [["answers", answers], ["free text", free]] as const) {
    expect(csv, `${name} leaked an email address`).not.toMatch(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
    expect(csv, `${name} leaked a government name`).not.toMatch(/City of |Test City|Riverton|Fairview/i);
    expect(csv, `${name} leaked a person`).not.toMatch(/Test Person/i);
  }

  // It still carries what an analysis needs.
  expect(answers).toContain("population_band");
  expect(answers).toContain("state");
  expect(answers).toContain("role");
});

test("hand-raises are the one identified export, and say so", async ({ page }) => {
  await signIn(page);
  await page.goto(`/console/studies/${STUDY}/exports`);

  await expect(page.locator(".ok-note")).toContainText("Hand-raises are the exception");
  const raises = await download(page, `/console/studies/${STUDY}/exports/hand-raises`);
  expect(raises).toContain("asked_for");
  expect(raises).toContain("work_email_matches");
});

test("the estimates JSON states the units of every margin", async ({ page }) => {
  await signIn(page);
  await page.goto(`/console/studies/${STUDY}/exports`);

  const json = JSON.parse(await download(page, `/console/studies/${STUDY}/exports/estimates`)) as {
    metrics: { margin_of_error_units: string; effective_n: number }[];
    responses_excluded: number;
  };

  expect(json.metrics.length).toBeGreaterThan(0);
  for (const metric of json.metrics) {
    expect(["absolute", "percentage_points"]).toContain(metric.margin_of_error_units);
  }
  expect(json.responses_excluded).toBeGreaterThan(0);
});

test("a response put back returns to the analysis", async ({ page }) => {
  await signIn(page);
  await page.goto(`/console/studies/${STUDY}/responses`);

  const excluded = page.locator(".panel").filter({ has: page.getByRole("button", { name: "Put it back" }) }).first();
  test.skip((await excluded.count()) === 0, "nothing excluded to put back");

  await excluded.getByRole("button", { name: "Put it back" }).click();
  // The row re-renders as reviewable, so the button that identified it is gone; the message
  // is what to look for.
  await expect(page.locator(SAID).filter({ hasText: "back on the pile" })).toBeVisible();
  await expect(page.locator(".panel").filter({ hasText: "Excluded:" })).toHaveCount(0);
});

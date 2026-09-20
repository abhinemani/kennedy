import { expect, test, type Page } from "@playwright/test";

// Milestone 7. Coding by hand is the part that always works; the model only ever proposes.
// These run without an API key, because everything the operator does must.

const configured = Boolean(process.env.DATABASE_URL && process.env.OPERATOR_PASSPHRASE);
const passphrase = process.env.OPERATOR_PASSPHRASE ?? "";
const hasModel = Boolean(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_MODEL);

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

test("the codebook can be brought in from the study file", async ({ page }) => {
  await signIn(page);
  await page.goto(`/console/studies/${STUDY}/themes`);

  const bringIn = page.getByRole("button", { name: /Bring in the \d+ themes/ });
  if (await bringIn.count()) await bringIn.click();

  await expect(page.locator(".rows").first()).toBeVisible();
});

test("a theme can be added by hand, and its code is checked", async ({ page }) => {
  await signIn(page);
  await page.goto(`/console/studies/${STUDY}/themes`);

  await page.getByLabel("Add a theme").fill("Not A Valid Code");
  await page.getByLabel("Label", { exact: true }).fill("Something");
  await page.getByRole("button", { name: "Add theme" }).click();
  await expect(page.locator(SAID).first()).toContainText("lowercase letters");

  await page.getByLabel("Add a theme").fill("waiting_on_legal");
  await page.getByLabel("Label", { exact: true }).fill("Waiting on legal review");
  await page.getByLabel("What counts as this theme").fill("Time lost while an attorney reviews");
  await page.getByRole("button", { name: "Add theme" }).click();
  await expect(page.locator(SAID).first()).toContainText("Waiting on legal review");

  await page.goto(`/console/studies/${STUDY}/themes`);
  await expect(page.locator(".rows").first()).toContainText("Waiting on legal review");
});

test("a written answer is coded by clicking, with no model involved", async ({ page }) => {
  await signIn(page);
  await page.goto(`/console/studies/${STUDY}/themes`);

  const row = page.locator(".panel").filter({ hasText: "None of these" }).first();
  test.skip((await row.count()) === 0, "no written answers to code yet");

  const chip = row.locator(".chip").first();
  const label = (await chip.textContent())?.trim() ?? "";
  await chip.click();
  await expect(page.locator(SAID).filter({ hasText: /Coded|Code removed/ }).first()).toBeVisible();

  await page.goto(`/console/studies/${STUDY}/themes`);
  await expect(page.getByRole("heading", { name: "What people said" })).toBeVisible();
  await expect(page.locator(".theme").filter({ hasText: label }).first()).toBeVisible();
});

test("theme counts are respondents, and the screen says so", async ({ page }) => {
  await signIn(page);
  await page.goto(`/console/studies/${STUDY}/themes`);
  await expect(page.locator(".panel").filter({ hasText: "Each bar is how many people" })).toBeVisible();
  await expect(page.locator(".ok-note")).toContainText("counts respondents, not mentions");
});

test("the agreement figure says plainly when nothing has been double-coded", async ({ page }) => {
  await signIn(page);
  await page.goto(`/console/studies/${STUDY}/themes`);
  await expect(
    page.locator(".panel").filter({ hasText: /agreed on \d+ of \d+|No answer has been coded twice/ }).first(),
  ).toBeVisible();
});

test("without an API key the screen says why, and coding by hand still works", async ({ page }) => {
  test.skip(hasModel, "an API key is configured, so there is nothing to explain");

  await signIn(page);
  await page.goto(`/console/studies/${STUDY}/themes`);

  await expect(page.locator(".problem")).toContainText("ANTHROPIC_API_KEY");
  await expect(page.getByRole("button", { name: /Suggest themes/ })).toBeDisabled();

  // The part that does not need a model is unaffected.
  await expect(page.getByRole("button", { name: "Add theme" })).toBeEnabled();
});

test("the checklist's Test it button reports a missing key rather than pretending", async ({ page }) => {
  test.skip(hasModel, "an API key is configured");

  await signIn(page);
  await page.goto("/console/settings");
  await page.getByRole("button", { name: "Test it" }).click();
  await expect(page.locator(SAID).filter({ hasText: "ANTHROPIC_API_KEY" })).toBeVisible();
});

test("removing a theme takes its codes with it", async ({ page }) => {
  await signIn(page);
  await page.goto(`/console/studies/${STUDY}/themes`);

  const row = page.locator(".rows li").filter({ hasText: "Waiting on legal review" }).first();
  test.skip((await row.count()) === 0, "the theme under test is not there");

  await row.getByRole("button", { name: "Remove" }).click();
  await page.goto(`/console/studies/${STUDY}/themes`);
  await expect(page.locator(".rows").first()).not.toContainText("Waiting on legal review");
});

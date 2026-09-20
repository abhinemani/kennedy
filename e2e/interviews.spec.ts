import { expect, test, type Page } from "@playwright/test";
import { walkSurvey } from "./walk";

// Milestone 8. Everything that must hold without a model — who is offered one, that the
// survey is untouched, and that the console explains why it is unavailable — is checked here.
// The conversation's own rules are covered in tests/interview-flow.test.ts, where the model
// can be made to misbehave on purpose.

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

test("the console explains the state of the interview stage", async ({ page }) => {
  await signIn(page);
  await page.goto(`/console/studies/${STUDY}/interviews`);

  await expect(page.getByRole("heading", { level: 1, name: "Interviews" })).toBeVisible();

  // Either it is ready, or the screen says exactly what is missing. Never silence.
  const explained = page.locator(".problem, .ok-note").first();
  await expect(explained).toBeVisible();
  const text = (await explained.textContent()) ?? "";
  expect(text.length).toBeGreaterThan(30);

  if (!hasModel) expect(text).toContain("ANTHROPIC_API_KEY");
});

test("switching the engine to SurveyMonkey turns the interview off, and says why", async ({ page }) => {
  await signIn(page);
  await page.goto(`/console/studies/${STUDY}/file`);

  const box = page.getByLabel("The study file");
  const original = await box.inputValue();

  // The kernel refuses the combination outright, which is the point: an interview cannot
  // exist on an engine that does not own the page.
  await box.fill(original.replace("engine: native", "engine: surveymonkey"));
  await expect(page.locator(".problems li").first()).toContainText("native engine");

  await box.fill(original);
  await expect(page.locator(".ok-note")).toBeVisible();
});

test("turning the interview off leaves the survey alone", async ({ page }) => {
  await signIn(page);
  await page.goto(`/console/studies/${STUDY}/file`);

  const box = page.getByLabel("The study file");
  const original = await box.inputValue();

  // features.ai_interview off, and the stage removed with it, is a valid study.
  const withoutStage = original
    .replace("  ai_interview: true", "  ai_interview: false")
    .replace(/\n  - id: interview\n[\s\S]*?\n  - id: call\n/, "\n  - id: call\n");

  await box.fill(withoutStage);
  await expect(page.locator(".ok-note")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.locator(SAID).first()).toContainText("Saved");

  // The survey itself is unchanged: its questions and spine are still there.
  await page.goto(`/console/studies/${STUDY}/preview`);
  await expect(page.getByRole("heading", { name: "What they see" })).toBeVisible();
  await page.getByRole("button", { name: "Start the survey" }).click();
  await expect(page.locator(".q").first()).toContainText("public records");

  // And the console now says the stage is gone rather than showing nothing.
  await page.goto(`/console/studies/${STUDY}/interviews`);
  await expect(page.locator(".problem")).toContainText("no interview stage");

  // Put it back for the next run.
  await page.goto(`/console/studies/${STUDY}/file`);
  await page.getByLabel("The study file").fill(original);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.locator(SAID).first()).toContainText("Saved");
});

test("a respondent who has not finished is not offered an interview", async ({ page }) => {
  // The interview screen belongs after the survey, so an unknown link goes nowhere near it.
  await page.goto("/s/aaaaaaaaaaaaaaaaaaaaaa/interview");
  await expect(page.locator(".q")).toContainText(/expired|mistyped/);
});

test("the end screen offers the conversation, with what it is said plainly", async ({ page }) => {
  await signIn(page);
  await page.goto(`/console/studies/${STUDY}/file`);

  // Make a fresh rehearsal link and walk it, so there is a completed response to offer.
  await page.getByRole("button", { name: "Create a rehearsal link" }).click();
  const link = page.getByRole("link", { name: /^\/s\// });
  await expect(link).toBeVisible();
  const token = (await link.textContent())?.replace("/s/", "").trim() ?? "";

  await walkSurvey(page, token);

  // A ticked box needs a work email, and one is ticked by default in this study.
  const email = page.locator("#email");
  if (await email.count()) await email.fill("clerk@testcity.gov");
  await page.getByRole("button", { name: "Record my response" }).click();
  await expect(page.locator(".q").first()).toContainText("Response recorded");

  const offer = page.locator(".panel").filter({ hasText: "AI interviewer" });
  test.skip((await offer.count()) === 0, "this respondent did not qualify for an interview");
  await expect(offer).toContainText("Skip anything, stop any time");

  await offer.getByRole("link", { name: "Start the conversation" }).click();
  await expect(page.locator(".hint, .probe").first()).toContainText("AI interviewer working from a researcher");
  await expect(page.getByRole("link", { name: "No thanks" })).toBeVisible();
});

import { expect, test, type Page } from "@playwright/test";
import { walkSurvey } from "./walk";

// The respondent flow, walked the way a person would, at 390px. It needs a database and a
// study, so it builds one through the console first and skips itself when unconfigured.

const configured = Boolean(process.env.DATABASE_URL && process.env.OPERATOR_PASSPHRASE);
const passphrase = process.env.OPERATOR_PASSPHRASE ?? "";

test.skip(!configured, "needs DATABASE_URL and OPERATOR_PASSPHRASE");
test.describe.configure({ mode: "serial" });

let token = "";

async function signIn(page: Page) {
  await page.goto("/console/login");
  await page.getByLabel("Passphrase").fill(passphrase);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/console$/);
}

const STUDY = "brandeis-records-2026";

test("the operator can make a study and a link to try it", async ({ page }) => {
  await signIn(page);

  // The study may already exist from an earlier run on this database.
  await page.goto(`/console/studies/${STUDY}`);
  if (await page.getByRole("heading", { name: "Not found" }).count()) {
    await page.goto("/console/studies/new");
    const template = page.getByRole("button", { name: "Use this template" }).first();
    await expect(template, "the worked example must be offered as a template").toBeVisible();
    await template.click();
    // The URL of the study itself, not /console/studies/new, which also starts that way.
    await page.waitForURL(new RegExp(`/console/studies/${STUDY}$`));
  }

  // Publishing and the rehearsal link live on the whole-file screen.
  await page.goto(`/console/studies/${STUDY}/file`);
  const publish = page.getByRole("button", { name: /Publish version/ });
  await expect(publish).toBeVisible();
  if (await publish.isEnabled()) {
    await publish.click();
    await expect(page.getByRole("status").first()).toContainText(/Published|Nothing to publish/);
  }

  await page.getByRole("button", { name: "Create a rehearsal link" }).click();
  const link = page.getByRole("link", { name: /^\/s\// });
  await expect(link).toBeVisible();
  token = (await link.textContent())?.replace("/s/", "").trim() ?? "";
  expect(token).not.toBe("");
});

test("a deliberately broken line is explained and blocks publishing", async ({ page }) => {
  await signIn(page);
  await page.goto(`/console/studies/${STUDY}/file`);

  const box = page.getByLabel("The study file");
  const original = await box.inputValue();
  await box.fill(original.replace("- id: volume", "- id: Volume"));

  await expect(page.locator(".problems li").first()).toContainText("lowercase letters");
  await expect(page.getByRole("button", { name: /Publish version/ })).toBeDisabled();

  await box.fill(original); // leave the study as we found it
  await expect(page.locator(".ok-note")).toBeVisible();
});

test("a link scanner following every URL changes nothing", async ({ request, page }) => {
  // What a government email gateway does to a message: GET every link in it.
  for (const path of [`/s/${token}`, `/s/${token}/not-me`, `/u/${token}`]) {
    const response = await request.get(path);
    expect(response.status(), path).toBeLessThan(400);
  }
  const oneClick = await request.get(`/api/u/${token}/one-click`);
  expect(oneClick.status()).toBe(405);

  // Nobody has pressed Start, so the survey has not begun.
  await page.goto(`/s/${token}`);
  await expect(page.getByRole("button", { name: "Start the survey" })).toBeVisible();
});

test("a person can answer the survey and is told where they stand", async ({ page }) => {
  await page.goto(`/s/${token}`);
  await expect(page.locator(".q")).toContainText("public records");
  await page.getByRole("button", { name: "Start the survey" }).click();

  await page.getByRole("button", { name: "I process them myself" }).click();

  // A wild number is questioned, not blocked, and the question can be corrected. The wording
  // of that question is the operator's to change, so this holds on to whatever it says — once
  // that question is actually on screen.
  await expect(page.getByRole("spinbutton")).toBeVisible();
  const volumeAsked = (await page.locator(".q").first().textContent())?.trim() ?? "";
  await page.getByRole("spinbutton").fill("90000");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator(".q").first()).toContainText("per 1,000 residents");
  await page.getByRole("button", { name: "Let me change it" }).click();
  await expect(page.getByRole("spinbutton")).toBeVisible();
  await expect(page.locator(".q").first()).toHaveText(volumeAsked);

  await page.getByRole("spinbutton").fill("800");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator(".q").first()).not.toHaveText(volumeAsked);

  // Walk whatever the branching puts in front of us until the end screen. Each screen is a
  // router update rather than a page load, so the only reliable signal that a step landed is
  // the question itself changing. Never decide what to click until it has.
  for (let i = 0; i < 25; i += 1) {
    if (await page.getByRole("button", { name: "Record my response" }).count()) break;

    const asked = (await page.locator(".q").first().textContent())?.trim() ?? "";
    const option = page.locator(".opts .opt, .scale .opt").first();

    if (await option.count()) {
      await option.click();
    } else {
      const textarea = page.locator("textarea").first();
      if (await textarea.count()) await textarea.fill("Redaction and chasing colleagues took the time.");
      await page.getByRole("button", { name: "Continue" }).click();
    }

    await expect(page.locator(".q").first(), `stuck on: ${asked}`).not.toHaveText(asked);
  }

  await expect(page.getByRole("button", { name: "Record my response" })).toBeVisible();
  await expect(page.locator("figure svg")).toBeVisible();
});

test("ticking a box without an email is refused and the ticks survive", async ({ page }) => {
  await page.goto(`/s/${token}/done`);
  const pilot = page.locator('input[name="raise_pilot"]');
  await pilot.check();
  await page.getByRole("button", { name: "Record my response" }).click();

  // Next's route announcer also carries role="alert", so match the message by class.
  await expect(page.locator(".problem")).toContainText("work email");
  await expect(pilot).toBeChecked();
});

test("recording the response closes the link to a second answer", async ({ page }) => {
  await page.goto(`/s/${token}/done`);
  await page.locator("#email").fill("clerk@testcity.gov");
  await page.getByRole("button", { name: "Record my response" }).click();

  await expect(page.locator(".q").first()).toContainText("Response recorded");

  // The same link now shows the benchmark again rather than a fresh survey.
  await page.goto(`/s/${token}`);
  await expect(page).toHaveURL(new RegExp(`/s/${token}/done`));
  await expect(page.getByRole("button", { name: "Record my response" })).toHaveCount(0);

  // And a question screen refuses to reopen.
  await page.goto(`/s/${token}/q/volume`);
  await expect(page).toHaveURL(new RegExp(`/s/${token}/done`));
});

test("unsubscribe needs a confirming press", async ({ page, request }) => {
  await page.goto(`/u/${token}`);
  await expect(page.getByRole("button", { name: "Unsubscribe me" })).toBeVisible();

  // The one-click POST a mail client sends is honoured; a GET still is not.
  const bad = await request.post(`/api/u/${token}/one-click`, { data: "nothing=here" });
  expect(bad.status()).toBe(400);

  await page.getByRole("button", { name: "Unsubscribe me" }).click();
  await expect(page.locator(".q")).toContainText("unsubscribed");
});

import { existsSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

/**
 * The operator's actual files, when they are on this machine.
 *
 * Fixtures prove the code does what it was told. These prove it does what the Census Bureau
 * and Power Almanac actually ship, which is a different question and the one that decides
 * whether a pilot can be fielded. Nothing from these files is ever committed.
 */
const CENSUS = process.env.KENNEDY_CENSUS_FILE ?? "";
const POWER_ALMANAC = process.env.KENNEDY_POWER_ALMANAC_FILE ?? "";

const configured = Boolean(process.env.DATABASE_URL && process.env.OPERATOR_PASSPHRASE);
const passphrase = process.env.OPERATOR_PASSPHRASE ?? "";

test.skip(!configured, "needs DATABASE_URL and OPERATOR_PASSPHRASE");
test.describe.configure({ mode: "serial" });

const SAID = "[role=status]";

async function signIn(page: Page) {
  await page.goto("/console/login");
  await page.getByLabel("Passphrase").fill(passphrase);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/console$/);
}

test("the Census government units file uploads as published", async ({ page }) => {
  // The whole country in one upload, so this gets its own budget.
  test.setTimeout(300_000);
  test.skip(!CENSUS || !existsSync(CENSUS), "set KENNEDY_CENSUS_FILE to the real Fin_PID file");

  await signIn(page);
  await page.goto("/console/contacts/registry");
  await page.getByLabel("The file").setInputFiles(CENSUS);
  await page.getByRole("button", { name: "Upload registry" }).click();

  const said = page.locator(".problem, [role=status]").first();
  await expect(said).toContainText("governments", { timeout: 180_000 });

  const text = (await said.textContent()) ?? "";
  // The whole country, not a sample of it.
  expect(text).toMatch(/8[0-9],\d{3} governments/);
  expect(text).toContain("counties");
  expect(text).toContain("cannot be sampled by size");

  await page.goto("/console/contacts/registry");
  await expect(page.locator(".panel").first()).toContainText("governments loaded");
});

test("a real Power Almanac export imports into the right list", async ({ page }) => {
  test.setTimeout(300_000);
  test.skip(!POWER_ALMANAC || !existsSync(POWER_ALMANAC), "set KENNEDY_POWER_ALMANAC_FILE");

  await signIn(page);
  await page.goto("/console/contacts/import");
  await page.getByLabel("The file").setInputFiles(POWER_ALMANAC);

  // Their column names, pointed at by hand, exactly as an operator would.
  await page.getByLabel("Email address").selectOption("Email Address");
  await page.getByLabel("First name").selectOption("First Name");
  await page.getByLabel("Last name").selectOption("Last Name");
  await page.getByLabel("Job title").selectOption("Title");
  await page.getByLabel("Government name").selectOption("Government Designated Name");
  await page.getByLabel("State", { exact: false }).first().selectOption("Government State");
  await page.getByLabel("Government type").selectOption("Government Category Name");
  await page.getByLabel("County the government is in").selectOption("Government County Location");
  await page.getByLabel("One role for everyone in this file").selectOption("finance");

  await page.getByRole("button", { name: "Preview this import" }).click();
  await page.waitForURL(/\/console\/contacts\/import\/[0-9a-f-]+$/, { timeout: 60_000 });

  const summary = (await page.locator(".panel").first().textContent()) ?? "";
  const ready = Number(summary.match(/Will be added as new contacts\s*([\d,]+)/)?.[1]?.replace(/,/g, "") ?? "0");
  const unmatched = Number(summary.match(/No government matched, so held for review\s*([\d,]+)/)?.[1]?.replace(/,/g, "") ?? "0");

  // Most of a real supplier file has to land, or the registry match is not working.
  expect(ready + unmatched).toBeGreaterThan(500);
  expect(ready / (ready + unmatched)).toBeGreaterThan(0.9);

  await page.getByLabel("List name").fill(`Power Almanac finance, ${new Date().toISOString().slice(0, 10)}`);
  await page.getByLabel("Where these came from").fill("power-almanac");
  await page.getByRole("button", { name: /Import .* contacts/ }).click();
  await page.waitForURL(/\/console\/contacts\/lists/, { timeout: 120_000 });

  // The whole point of the role mapping: they land in a list, not in "other".
  await expect(page.locator(".list", { hasText: "Heads of finance" })).toContainText("contacts");
  const finance = (await page.locator(".list", { hasText: "Heads of finance" }).textContent()) ?? "";
  expect(finance).not.toContain("none yet");
});

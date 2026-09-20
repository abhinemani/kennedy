import { expect, test, type Page } from "@playwright/test";

// Milestone 9. The form view and the text view are the same file. The thing that would make
// this feature a liability is an edit that quietly loses something, so that is what is tested.

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

const fileText = async (page: Page) => {
  await page.goto(`/console/studies/${STUDY}`);
  return page.getByLabel("The study file").inputValue();
};

// This file rewrites the study that every other spec reads, so it borrows it and gives it back.
let borrowed = "";

test("borrow the study file, to give back at the end", async ({ page }) => {
  await signIn(page);
  borrowed = await fileText(page);
  expect(borrowed.length).toBeGreaterThan(100);
});

test("an edit in the form shows up in the text view, and nothing else moves", async ({ page }) => {
  await signIn(page);
  const before = await fileText(page);

  await page.goto(`/console/studies/${STUDY}/edit`);
  const wording = page.locator("#text-volume");
  await wording.fill("Roughly how many public records requests did you receive last year?");
  await wording.locator("xpath=ancestor::form").getByRole("button", { name: "Save wording" }).click();
  await expect(page.locator(SAID).first()).toContainText("Saved.");

  const after = await fileText(page);
  expect(after).toContain("Roughly how many public records requests");

  // Comments are why a study file is readable a year later. None of them may be lost.
  const comments = (t: string) => t.split("\n").filter((l) => l.trim().startsWith("#")).length;
  expect(comments(after)).toBe(comments(before));

  // And only the line that was asked about changed.
  const changed = after.split("\n").filter((line, i) => line !== before.split("\n")[i]);
  expect(changed.length).toBeLessThanOrEqual(2);
});

test("the text view and the form view show the same thing", async ({ page }) => {
  await signIn(page);
  await page.goto(`/console/studies/${STUDY}/edit`);
  await expect(page.locator("#text-volume")).toHaveValue(/Roughly how many/);
  await expect(page.locator(".ok-note")).toContainText("editing in the text view are the same thing");
});

test("an option is renamed without disturbing its value", async ({ page }) => {
  await signIn(page);
  await page.goto(`/console/studies/${STUDY}/edit`);

  const option = page.getByLabel("Label for manual");
  await option.fill("Email and spreadsheets only");
  await option.locator("xpath=ancestor::form").getByRole("button", { name: "Save" }).click();
  await expect(page.locator(SAID).first()).toContainText("Saved.");

  const text = await fileText(page);
  expect(text).toContain("Email and spreadsheets only");
  expect(text).toMatch(/value:\s*manual/);
});

test("a move that would break a condition is refused, and says which one", async ({ page }) => {
  await signIn(page);
  const before = await fileText(page);
  await page.goto(`/console/studies/${STUDY}/edit`);

  const card = page.locator(".panel").filter({ hasText: "satisfaction ·" }).first();
  await card.getByRole("button", { name: "Move up" }).click();

  await expect(card.locator(".problem")).toContainText("tool");
  await expect(card.locator(".problem")).toContainText("only ask about answers given earlier");

  // Nothing was saved.
  expect(await fileText(page)).toBe(before);
});

test("a condition is built from dropdowns and lands in the file", async ({ page }) => {
  await signIn(page);
  await page.goto(`/console/studies/${STUDY}/edit`);

  const card = page.locator(".panel").filter({ hasText: "people ·" }).first();
  await card.locator("#dep-people").selectOption({ index: 1 });
  await card.locator("#test-people").selectOption("in");
  await card.locator('input[name="values"]').first().check();
  await card.getByRole("button", { name: "Save condition" }).click();
  await expect(card.locator(SAID).first()).toContainText("Saved.");

  const text = await fileText(page);
  expect(text).toMatch(/show_if:\s*\{involvement:/);
});

test("an email edit that breaks the email rules is refused, with the rule named", async ({ page }) => {
  await signIn(page);
  // fileText navigates to the text view, so read it before opening the form.
  const before = await fileText(page);
  await page.goto(`/console/studies/${STUDY}/edit`);

  const body = page.locator("#body-3");
  await body.fill("Hi {first_name},\n\nNo link in here at all.\n\n{postal_address}\n{unsubscribe}");
  await body.locator("xpath=ancestor::form").getByRole("button", { name: "Save the email" }).click();

  await expect(page.locator(".problem").first()).toContainText("{link}");
  await expect(page.locator(".problem").first()).toContainText("Nothing was saved");
  expect(await fileText(page)).toBe(before);
});

test("a valid email edit is saved and still passes the study check", async ({ page }) => {
  await signIn(page);
  await page.goto(`/console/studies/${STUDY}/edit`);

  const body = page.locator("#body-3");
  const kept = await body.inputValue();
  await body.fill(kept.replace("Last note from me.", "One last note from me."));
  await body.locator("xpath=ancestor::form").getByRole("button", { name: "Save the email" }).click();
  await expect(page.locator(SAID).first()).toContainText("Saved.");

  await page.goto(`/console/studies/${STUDY}`);
  await expect(page.locator(".ok-note")).toBeVisible();
  await expect(page.getByLabel("The study file")).toHaveValue(/One last note from me/);
});

test("sample targets and the pilot size are editable, and checked", async ({ page }) => {
  await signIn(page);
  await page.goto(`/console/studies/${STUDY}/edit`);

  const pilot = page.getByLabel("How many go out in the pilot");
  await pilot.fill("60");
  await pilot.locator("xpath=ancestor::form").getByRole("button", { name: "Save" }).click();
  await expect(page.locator(SAID).first()).toContainText("Saved.");

  await page.goto(`/console/studies/${STUDY}/edit`);
  await expect(page.getByLabel("How many go out in the pilot")).toHaveValue("60");

  const text = await fileText(page);
  expect(text).toMatch(/pilot_size:\s*60/);
});

test("the form refuses to work on a file that does not parse", async ({ page }) => {
  await signIn(page);
  await page.goto(`/console/studies/${STUDY}`);

  const box = page.getByLabel("The study file");
  const original = await box.inputValue();
  await box.fill(original.replace("- id: volume", "- id: Volume"));
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.locator(SAID).first()).toContainText("problem");

  await page.goto(`/console/studies/${STUDY}/edit`);
  await expect(page.locator(".problem")).toContainText("form cannot work on it");
  await expect(page.locator(".problem")).toContainText("never be the thing that breaks one");

  // Put it back.
  await page.goto(`/console/studies/${STUDY}`);
  await page.getByLabel("The study file").fill(original);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.locator(SAID).first()).toContainText("No problems found");
});

test("give the study file back exactly as it was", async ({ page }) => {
  test.skip(borrowed.length === 0, "nothing was borrowed");

  await signIn(page);
  await page.goto(`/console/studies/${STUDY}`);
  await page.getByLabel("The study file").fill(borrowed);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.locator(SAID).first()).toContainText("No problems found");

  expect(await fileText(page)).toBe(borrowed);
});

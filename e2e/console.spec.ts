import { expect, test } from "@playwright/test";

// These need a database. CI gives them one; locally, `docker compose up -d postgres`
// and `npm run migrate` first. The suite is skipped when there is nothing to talk to.
const configured = Boolean(process.env.DATABASE_URL && process.env.OPERATOR_PASSPHRASE);
const passphrase = process.env.OPERATOR_PASSPHRASE ?? "";

// Next's route announcer also carries role="alert", so messages are found by their class.
const message = ".problem";

test.skip(!configured, "needs DATABASE_URL and OPERATOR_PASSPHRASE");
test.describe.configure({ mode: "serial" });

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/console/login");
  await page.getByLabel("Passphrase").fill(passphrase);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/console$/);
}

test("a wrong passphrase says so and does not sign anyone in", async ({ page }) => {
  await page.goto("/console/login");
  await page.getByLabel("Passphrase").fill("not the passphrase");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator(message)).toContainText("does not match");

  await page.goto("/console");
  await expect(page).toHaveURL(/\/console\/login$/);
});

test("saving settings turns the matching checklist lines green without a reload", async ({ page }) => {
  await signIn(page);
  await page.goto("/console/settings");
  await page.getByLabel("Survey link domain").fill("https://surveys.ethoslabs.us");
  await page.getByLabel("Postal address").fill("PO Box 1234, Somewhere, CA 90001");
  await page.getByLabel("Reply-to address").fill("research@example.org");
  await page.getByRole("button", { name: "Save settings" }).click();

  // "Nothing changed" when a previous run left the same values; either way the checklist
  // below must agree with what the form now says.
  await expect(page.locator(message)).toContainText(/Settings saved\.|Nothing changed\./);
  // The health panel is on this same page. It must not still be telling the operator to
  // do the thing they just did.
  const domainLine = page.locator("li", { hasText: "Survey link domain confirmed" });
  await expect(domainLine).toContainText("Done");
  await expect(domainLine).toContainText("surveys.ethoslabs.us/s/");
  await expect(page.locator("li", { hasText: "Postal address and reply-to" })).toContainText("Done");
});

test("a bad domain is refused with a message that says what to type", async ({ page }) => {
  await signIn(page);
  await page.goto("/console/settings");
  await page.getByLabel("Survey link domain").fill("surveys.ethoslabs.us/survey");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.locator(message)).toContainText("must start with https://");
});

test("the activity log records what the operator did", async ({ page }) => {
  await signIn(page);
  await page.goto("/console/activity");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Activity");
  await expect(page.locator(".rows li").first()).toContainText(/Settings saved|Signed in/);
});

test("signing out closes the console again", async ({ page }) => {
  await signIn(page);
  await page.goto("/console/settings");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/console\/login$/);
  await page.goto("/console");
  await expect(page).toHaveURL(/\/console\/login$/);
});

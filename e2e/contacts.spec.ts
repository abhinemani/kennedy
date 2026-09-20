import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

// Milestone 1, walked the way the operator would: load the registry, import a supplier's
// file, clear what did not match, then draw a sample. Every fixture here is obviously fake.

const configured = Boolean(process.env.DATABASE_URL && process.env.OPERATOR_PASSPHRASE);
const passphrase = process.env.OPERATOR_PASSPHRASE ?? "";

test.skip(!configured, "needs DATABASE_URL and OPERATOR_PASSPHRASE");
test.describe.configure({ mode: "serial" });

const STUDY = "brandeis-records-2026";
const NAMES = ["Riverton", "Fairview", "Greenfield", "Oakdale", "Westbrook", "Milbrook", "Norwood", "Eastport"];
const STATES = ["MI", "OH", "WA", "CA"];
const ROLES = ["clerk", "records_officer", "manager", "attorney"];

// Four size bands, so every stratum in the worked example has something in it.
const POPULATIONS = [4_000, 25_000, 120_000, 400_000];
const TYPES = ["city", "city", "township", "county"];

let dir = "";
let registryCsv = "";
let contactsCsv = "";
let governments = 0;
let contactRows = 0;
const UNRESOLVABLE = 6;

// Emails identify a contact, so a second run against the same database would import nobody.
// A per-run tag keeps every run a real import, and keeps the fixtures obviously fake.
const RUN = `r${Date.now().toString(36)}`;

test.beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "kennedy-fixtures-"));

  const registry: string[] = ["geoid,name,state,type,population,annual_budget,email_domain"];
  const contacts: string[] = ["Email Address,Full Name,Job Title,Our Role Code,Agency Name,ST,Gov Type"];

  let n = 0;
  for (const state of STATES) {
    for (const [i, name] of NAMES.entries()) {
      n += 1;
      const band = i % 4;
      const population = POPULATIONS[band]! + n;
      const type = TYPES[band]!;
      const slug = name.toLowerCase();
      registry.push(
        `TEST${String(n).padStart(6, "0")},"City of ${name}",${state},${type},${population},${population * 1200},${slug}.example`,
      );
      // Every government gets one contact in a primary role and one in another.
      for (const roleIndex of [i % 2, 2 + (i % 2)]) {
        const role = ROLES[roleIndex]!;
        contacts.push(
          `${role}.${n}.${roleIndex}.${RUN}@${slug}.example,Test Person ${n}${roleIndex},${role},${role},"City of ${name}",${state},${type}`,
        );
      }
    }
  }
  governments = registry.length - 1;

  for (let k = 0; k < UNRESOLVABLE; k += 1) {
    contacts.push(
      `mystery.${k}.${RUN}@nowhere.example,Test Person X${k},Clerk,clerk,"Place Not In The Registry ${k}",MI,city`,
    );
  }
  contactRows = contacts.length - 1;

  registryCsv = path.join(dir, "registry.csv");
  contactsCsv = path.join(dir, "contacts.csv");
  writeFileSync(registryCsv, registry.join("\n"));
  writeFileSync(contactsCsv, contacts.join("\n"));
});

async function signIn(page: Page) {
  await page.goto("/console/login");
  await page.getByLabel("Passphrase").fill(passphrase);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/console$/);
}

test("the registry loads from a file, and says what it did", async ({ page }) => {
  await signIn(page);
  await page.goto("/console/contacts/registry");

  await page.getByLabel("The file").setInputFiles(registryCsv);
  await page.getByRole("button", { name: "Upload registry" }).click();

  await expect(page.locator(".problem")).toContainText(/governments added/, { timeout: 30_000 });
  await expect(page.locator(".panel").first()).toContainText("governments loaded");
});

test("uploading the same registry again updates rather than doubling", async ({ page }) => {
  await signIn(page);
  await page.goto("/console/contacts/registry");
  const before = (await page.locator(".panel").first().textContent()) ?? "";

  await page.getByLabel("The file").setInputFiles(registryCsv);
  await page.getByRole("button", { name: "Upload registry" }).click();
  await expect(page.locator(".problem")).toContainText(`${governments.toLocaleString("en-US")} updated`, {
    timeout: 30_000,
  });

  await page.goto("/console/contacts/registry");
  expect((await page.locator(".panel").first().textContent()) ?? "").toBe(before);
});

test("an import is previewed before anything is saved", async ({ page }) => {
  await signIn(page);
  await page.goto("/console/contacts/import");

  await page.getByLabel("The file").setInputFiles(contactsCsv);

  // The column names are theirs, not ours, so each one is pointed at by hand.
  await page.getByLabel("Email address").selectOption("Email Address");
  await page.getByLabel("Full name").selectOption("Full Name");
  await page.getByLabel("Job title").selectOption("Job Title");
  await page.getByLabel("Role", { exact: true }).selectOption("Our Role Code");
  await page.getByLabel("Government name").selectOption("Agency Name");
  await page.getByLabel("State").selectOption("ST");
  await page.getByLabel("Government type").selectOption("Gov Type");
  await page.getByLabel("Save these choices as").fill("power-almanac");

  await page.getByRole("button", { name: "Preview this import" }).click();
  await page.waitForURL(/\/console\/contacts\/import\/[0-9a-f-]+$/, { timeout: 30_000 });

  await expect(page.locator(".panel").first()).toContainText("Will be added as new contacts");
  const summary = (await page.locator(".panel").first().textContent()) ?? "";
  expect(summary).toContain(String(contactRows - UNRESOLVABLE));
  expect(summary).toContain(String(UNRESOLVABLE));

  // Still nothing saved at this point.
  await expect(page.getByRole("button", { name: /Import .* contacts/ })).toBeVisible();
});

test("confirming the import creates a named list and holds the rest for review", async ({ page }) => {
  await signIn(page);
  await page.goto("/console/contacts/import");

  await page.getByLabel("The file").setInputFiles(contactsCsv);
  // The saved profile from the previous test fills the columns in by itself.
  await expect(page.getByLabel("Email address")).toHaveValue("Email Address");

  await page.getByRole("button", { name: "Preview this import" }).click();
  await page.waitForURL(/\/console\/contacts\/import\/[0-9a-f-]+$/, { timeout: 30_000 });

  await page.getByLabel("List name").fill(`Obviously fake test list ${RUN}`);
  await page.getByLabel("Where these came from").fill("fixtures");
  await page.getByRole("button", { name: /Import .* contacts/ }).click();

  await page.waitForURL(/\/console\/contacts\/lists/, { timeout: 30_000 });
  await expect(page.getByRole("status")).toContainText("contacts imported");
  await expect(page.locator(".rows")).toContainText(`Obviously fake test list ${RUN}`);
});

test("importing the same file twice adds nobody twice", async ({ page }) => {
  await signIn(page);
  await page.goto("/console/contacts/lists");
  const before = (await page.locator("p.sub").textContent()) ?? "";

  await page.goto("/console/contacts/import");
  await page.getByLabel("The file").setInputFiles(contactsCsv);
  await page.getByRole("button", { name: "Preview this import" }).click();
  await page.waitForURL(/\/console\/contacts\/import\/[0-9a-f-]+$/, { timeout: 30_000 });

  await expect(page.locator(".panel").first()).toContainText("Already on file, so skipped");

  // There is nobody new, so importing is off and the screen says why in those words.
  await expect(page.getByRole("button", { name: /Import .* contacts/ })).toBeDisabled();
  await expect(page.locator("form.panel").first()).toContainText("already on file");

  await page.getByRole("button", { name: "Discard this import" }).click();
  await page.waitForURL(/\/console\/contacts\/import\?discarded=\d+$/, { timeout: 30_000 });
  // A staged file holds names and emails, so discarding must actually throw them away.
  await expect(page.getByRole("status")).toContainText("uploaded rows were thrown away");

  await page.goto("/console/contacts/lists");
  expect((await page.locator("p.sub").textContent()) ?? "").toBe(before);
});

test("rows that matched nothing wait in the review queue", async ({ page }) => {
  await signIn(page);
  await page.goto("/console/contacts/review");
  await expect(page.locator("p.sub")).toContainText("could not be matched");
  await expect(page.locator(".panel").first()).toContainText("Place Not In The Registry");
});

test("the audience screen shows the thirteen lists with real counts", async ({ page }) => {
  await signIn(page);
  await page.goto("/console/contacts/lists");

  await expect(page.getByRole("heading", { name: "Power Almanac lists" })).toBeVisible();
  const clerks = page.locator(".list", { hasText: "Clerks" }).first();
  await expect(clerks).toContainText("contacts");
  // A list nobody was imported into is still shown, because the thirteen always are.
  await expect(page.locator(".list", { hasText: "Fire chiefs" })).toContainText("none yet");
});

test("the sample screen shows the counts and every skip reason before drawing", async ({ page }) => {
  await signIn(page);
  await page.goto(`/console/studies/${STUDY}/sample`);

  await expect(page.getByRole("heading", { name: "Who is eligible" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Who is left out, and why" })).toBeVisible();

  const skips = page.locator(".panel", { hasText: "Role is not in this study" }).first();
  await expect(skips).toContainText("Role is not in this study");
  await expect(skips).toContainText("contacts were in the frame");
});

test("drawing the sample mints a link each, and drawing again adds nobody", async ({ page }) => {
  await signIn(page);
  await page.goto(`/console/studies/${STUDY}/sample`);

  await page.getByRole("button", { name: "Draw sample" }).click();
  await expect(page.getByRole("status")).toContainText(/Drew .* people and made a link for each/, {
    timeout: 30_000,
  });
  await expect(page.getByRole("status")).toContainText("Nothing has been sent.");

  await page.goto(`/console/studies/${STUDY}/sample`);
  await expect(page.locator("p.sub")).toContainText("have already been drawn");

  await page.getByRole("button", { name: "Draw sample" }).click();
  await expect(page.getByRole("status")).toContainText("Nothing new to draw", { timeout: 30_000 });
});

test("a preview the operator walked away from is swept, not kept", async ({ page }) => {
  // Staged rows hold names and emails for people who were never imported. Abandoning a
  // preview is the common case, and no button can catch it.
  await signIn(page);
  await page.goto("/console/contacts/import");
  await page.getByLabel("The file").setInputFiles(contactsCsv);
  await page.getByRole("button", { name: "Preview this import" }).click();
  await page.waitForURL(/\/console\/contacts\/import\/[0-9a-f-]+$/, { timeout: 30_000 });

  // Walk away, and come back a long time later.
  await page.goto("/console/contacts/import?aged=1");
  await expect(page.getByRole("heading", { name: "Import contacts" })).toBeVisible();
});

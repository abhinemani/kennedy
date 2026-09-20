import { expect, test, type Page } from "@playwright/test";

// Milestone 4. These are the rules that cost a sending domain if they break, so they are
// checked through the screens the operator actually uses.

const configured = Boolean(process.env.DATABASE_URL && process.env.OPERATOR_PASSPHRASE);
const passphrase = process.env.OPERATOR_PASSPHRASE ?? "";
const webhookSecret = process.env.SEND_WEBHOOK_SECRET ?? "";

test.skip(!configured, "needs DATABASE_URL and OPERATOR_PASSPHRASE");
test.describe.configure({ mode: "serial" });

const STUDY = "brandeis-records-2026";

// Next's route announcer also carries role="alert", so messages are found by their class.
const BLOCKED = ".problem";
const SAID = "[role=status]";

async function signIn(page: Page) {
  await page.goto("/console/login");
  await page.getByLabel("Passphrase").fill(passphrase);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/console$/);
}

/** Put the study back the way it ships, so this file can be run again on the same database. */
async function resetToShippedState(page: Page) {
  // Earlier runs on this database will have used up a day's allowance, so the spec sets its
  // own headroom rather than depending on what is left.
  await page.goto("/console/settings");
  await page.getByLabel("Messages per inbox per day").fill("5000");
  await page.getByLabel("Send provider").selectOption("dryrun");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.locator(".problem")).toContainText(/Settings saved|Nothing changed/);

  await page.goto(`/console/studies/${STUDY}/follow-ups`);
  const resume = page.getByRole("button", { name: "Resume sending" });
  if (await resume.count()) await resume.click();

  await page.goto(`/console/studies/${STUDY}/file`);
  const box = page.getByLabel("The study file");
  const text = await box.inputValue();
  if (!text.includes("CHANGE_ME")) {
    await box.fill(text.replace(/^(  contact_email:) .*$/m, "$1 CHANGE_ME"));
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.locator(SAID).first()).toContainText("Saved");
  }
}

test("sending is blocked while the study still says CHANGE_ME", async ({ page }) => {
  await signIn(page);
  await resetToShippedState(page);

  await page.goto(`/console/studies/${STUDY}/follow-ups`);
  await expect(page.locator(BLOCKED)).toContainText("CHANGE_ME");
  await expect(page.getByRole("button", { name: /Record .* as a dry run|Queue .* emails|Make a merge file/ }).first()).toBeDisabled();
});

test("the email preview shows what would arrive", async ({ page }) => {
  await signIn(page);
  await page.goto(`/console/studies/${STUDY}/follow-ups?preview=1`);

  const preview = page.locator("pre");
  await expect(preview).toContainText("/s/EXAMPLE_LINK_FOR_PREVIEW");
  await expect(preview).toContainText("/u/EXAMPLE_LINK_FOR_PREVIEW");
  // Plain text only: no markup ever reaches a government mail filter.
  expect(await preview.textContent()).not.toMatch(/<[a-z][\s\S]*>/i);
});

test("filling in the placeholders and the addresses unblocks sending", async ({ page }) => {
  await signIn(page);

  await page.goto("/console/settings");
  await page.getByLabel("Survey link domain").fill("https://surveys.ethoslabs.us");
  await page.getByLabel("Postal address").fill("PO Box 1234, Somewhere, CA 90001");
  await page.getByLabel("Reply-to address").fill("research@example.org");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.locator(".problem")).toContainText(/Settings saved|Nothing changed/);

  await page.goto(`/console/studies/${STUDY}/file`);
  const box = page.getByLabel("The study file");
  const text = await box.inputValue();
  await box.fill(text.replaceAll("CHANGE_ME", "research@example.org"));
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.locator(SAID).first()).toContainText("Saved");

  await page.goto(`/console/studies/${STUDY}/follow-ups`);
  await expect(page.locator(".ok-note")).toContainText("Nothing is blocking a send");
});

test("the screen shows who gets a touch and every reason the rest do not", async ({ page }) => {
  await signIn(page);
  await page.goto(`/console/studies/${STUDY}/follow-ups`);

  const touchOne = page.locator("section").first();
  await expect(touchOne).toContainText("Would receive this touch");
  await expect(touchOne).toContainText("Left out: already answered");
  await expect(touchOne).toContainText("Left out: unsubscribed or suppressed");
  await expect(touchOne).toContainText("Left out: already had this one");
});

const countIn = async (section: import("@playwright/test").Locator, label: string) => {
  const text = await section.locator("li", { hasText: label }).locator(".when").first().textContent();
  return Number((text ?? "0").replace(/[^0-9]/g, ""));
};

// Carried between the two tests below, which are serial.
let dueBefore = 0;
let hadBefore = 0;

test("a dry run records the touch and sends nothing", async ({ page }) => {
  await signIn(page);
  await page.goto(`/console/studies/${STUDY}/follow-ups`);

  const before = page.locator("section").first();
  dueBefore = await countIn(before, "Would receive this touch");
  hadBefore = await countIn(before, "already had this one");
  expect(dueBefore).toBeGreaterThan(0);

  const queue = page.getByRole("button", { name: /Record .* as a dry run/ }).first();
  await expect(queue).toBeEnabled();
  await queue.click();
  await expect(page.locator(SAID).first()).toContainText("nothing was sent", { timeout: 30_000 });

  await page.goto(`/console/studies/${STUDY}/follow-ups`);
  await expect(page.locator("section").first()).toContainText("already went out");
});

test("nobody gets the same touch twice", async ({ page }) => {
  await signIn(page);
  await page.goto(`/console/studies/${STUDY}/follow-ups`);

  const touchOne = page.locator("section").first();
  const dueAfter = await countIn(touchOne, "Would receive this touch");
  const hadAfter = await countIn(touchOne, "already had this one");

  // Everyone the send reached moved from "due" to "already had this one", and nobody was
  // created or lost on the way. How many actually went depends on the daily limit.
  expect(hadAfter).toBeGreaterThan(hadBefore);
  expect(dueAfter).toBeLessThan(dueBefore);
  expect(dueAfter + hadAfter).toBe(dueBefore + hadBefore);
});

test("the daily limit holds the rest back, and says so", async ({ page }) => {
  await signIn(page);
  await page.goto("/console/settings");
  await page.getByLabel("Messages per inbox per day").fill("1");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.locator(".problem")).toContainText(/Settings saved|Nothing changed/);

  await page.goto(`/console/studies/${STUDY}/follow-ups`);
  const second = page.locator("section").nth(1);
  await expect(second).toContainText("Held back by today\u2019s limit");

  await page.goto("/console/settings");
  await page.getByLabel("Messages per inbox per day").fill("5000");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.locator(".problem")).toContainText(/Settings saved|Nothing changed/);
});

test("someone who answered never appears in a later touch", async ({ page }) => {
  await signIn(page);
  await page.goto(`/console/studies/${STUDY}/follow-ups`);

  // The survey spec completed one response and unsubscribed another link.
  const sections = page.locator("section");
  const second = sections.nth(1);
  await expect(second).toContainText("Left out: already answered");
  expect(await countIn(second, "already answered")).toBeGreaterThan(0);
});

test("pausing by hand stops every touch, and resuming brings them back", async ({ page }) => {
  await signIn(page);
  await page.goto(`/console/studies/${STUDY}/follow-ups`);

  await page.getByRole("button", { name: "Pause sending" }).click();
  await expect(page.locator(BLOCKED)).toContainText("Paused by hand");
  await expect(page.getByRole("button", { name: /Record .* as a dry run/ }).first()).toBeDisabled();

  await page.getByRole("button", { name: "Resume sending" }).click();
  await expect(page.locator(".ok-note")).toContainText("Nothing is blocking a send");
});

test("the webhook refuses anyone without the shared secret", async ({ request }) => {
  const get = await request.get("/api/webhooks/dryrun");
  expect(get.status()).toBe(405);

  const unsigned = await request.post("/api/webhooks/dryrun", {
    data: { providerMessageId: "dryrun-0", type: "bounced" },
  });
  expect([401, 503]).toContain(unsigned.status());
});

test("bounces above the threshold pause sending, with a reason worth reading", async ({ page, request }) => {
  test.skip(!webhookSecret, "needs SEND_WEBHOOK_SECRET");

  await signIn(page);

  // Switch to the merge-file provider, which is how this is really sent until a platform is
  // picked: the operator downloads the file, sends it, and reports what came back.
  await page.goto("/console/settings");
  await page.getByLabel("Send provider").selectOption("csv");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.locator(".problem")).toContainText(/Settings saved|Nothing changed/);

  // Queue whatever is still due, so there is a real send history behind this. The breaker
  // deliberately waits for 100 reported sends before it judges anything.
  const merged: { studyContactId: string; touch: number }[] = [];
  for (const touch of [1, 2, 3]) {
    await page.goto(`/console/studies/${STUDY}/follow-ups`);
    const buttons = page.getByRole("button", { name: /Make a merge file/ });
    for (let b = 0; b < (await buttons.count()); b += 1) {
      const button = buttons.nth(b);
      if (await button.isEnabled()) {
        await button.click();
        await expect(page.locator(SAID).first()).toContainText(/ready to merge|already been used|Nobody is due/, {
          timeout: 30_000,
        });
        break;
      }
    }

    // Fetched from inside the page so the signed-in cookie goes with it. The request
    // fixtures have their own cookie jars and would be turned away.
    const file = await page.evaluate(async (url) => {
      const response = await fetch(url, { credentials: "same-origin" });
      return { ok: response.ok, body: response.ok ? await response.text() : "" };
    }, `/console/studies/${STUDY}/follow-ups/${touch}/download`);

    if (!file.ok) continue;
    for (const id of studyContactIdsIn(file.body)) merged.push({ studyContactId: id, touch });
  }

  test.skip(merged.length < 100, `needs 100 sends for the breaker to judge, had ${merged.length}`);

  // A tenth of them bounced, well over the three percent threshold.
  const events = merged.map((m, i) => ({ ...m, type: i % 10 === 0 ? "bounced" : "delivered" }));
  const response = await request.post("/api/webhooks/csv", {
    headers: { "x-kennedy-secret": webhookSecret },
    data: { events },
  });
  expect(response.ok()).toBe(true);

  const body = (await response.json()) as { applied: number; paused: string | null };
  expect(body.applied).toBe(events.length);
  expect(body.paused).toMatch(/bounced/);

  await page.goto(`/console/studies/${STUDY}/follow-ups`);
  await expect(page.locator(BLOCKED)).toContainText(/bounced/);
  await expect(page.getByRole("button", { name: /Make a merge file/ }).first()).toBeDisabled();
});

test("resuming after the breaker actually resumes, rather than tripping again", async ({ page }) => {
  test.skip(!webhookSecret, "needs SEND_WEBHOOK_SECRET");

  await signIn(page);
  await page.goto(`/console/studies/${STUDY}/follow-ups`);
  const tripped = await page.locator(BLOCKED).filter({ hasText: "bounced" }).count();
  test.skip(tripped === 0, "the breaker did not trip, so there is nothing to resume from");

  // The breaker is a latch, not a gate re-judged on every page load. If it were the latter,
  // Resume would do nothing at all: the same history would block again immediately.
  await page.getByRole("button", { name: "Resume sending" }).click();
  await expect(page.locator(".ok-note")).toContainText("Nothing is blocking a send");
  // The numbers that tripped it are still shown, so resuming is an informed choice.
  await expect(page.locator(".panel").first()).toContainText("bounced");
});

test("a bounced address is suppressed, so no later study writes to it", async ({ page }) => {
  test.skip(!webhookSecret, "needs SEND_WEBHOOK_SECRET");

  await signIn(page);
  await page.goto("/console/contacts/lists");
  await expect(page.locator("p.sub")).toContainText("unsubscribed or suppressed");
  const text = (await page.locator("p.sub").textContent()) ?? "";
  const suppressed = Number(text.match(/([\d,]+) of them/)?.[1]?.replace(/,/g, "") ?? "0");
  expect(suppressed).toBeGreaterThan(1);
});

/**
 * study_contact_id is the only UUID in the merge file, so it is pulled out by shape. Splitting
 * the file into lines would not work: an email body carries its own newlines inside quotes.
 */
function studyContactIdsIn(csv: string): string[] {
  const found = csv.matchAll(/"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"/g);
  return [...new Set([...found].map((m) => m[1]!))];
}

test("the study is left unpaused, and the provider put back", async ({ page }) => {
  await signIn(page);

  await page.goto("/console/settings");
  await page.getByLabel("Send provider").selectOption("dryrun");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.locator(".problem")).toContainText(/Settings saved|Nothing changed/);

  await page.goto(`/console/studies/${STUDY}/follow-ups`);

  const resume = page.getByRole("button", { name: "Resume sending" });
  if (await resume.count()) await resume.click();
  await expect(page.getByRole("button", { name: "Pause sending" })).toBeVisible();
});

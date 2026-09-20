import { expect, type Page } from "@playwright/test";

/**
 * Walks the survey from the intro to the end screen, answering whatever is put in front of it.
 *
 * Every screen is a router update rather than a page load, so the only reliable signal that a
 * step landed is the question changing. The plausibility prompt is a screen of its own with no
 * Continue button on it, which is why it is handled before anything else.
 */
export async function walkSurvey(page: Page, token: string, openText = "Redaction and chasing colleagues took the time.") {
  await page.goto(`/s/${token}`);
  const intro = (await page.locator(".q").first().textContent())?.trim() ?? "";
  await page.getByRole("button", { name: /Start the survey|Pick up where you left off/ }).click();
  // The first question has to be on screen before anything decides what to click.
  await expect(page.locator(".q").first()).not.toHaveText(intro);

  for (let i = 0; i < 30; i += 1) {
    if (await page.getByRole("button", { name: "Record my response" }).count()) return;

    const asked = (await page.locator(".q").first().textContent())?.trim() ?? "";

    const standBy = page.getByRole("button", { name: "Yes, that is right" });
    if (await standBy.count()) {
      await standBy.click();
      await expect(page.locator(".q").first(), `stuck confirming: ${asked}`).not.toHaveText(asked);
      continue;
    }

    const option = page.locator(".opts .opt, .scale .opt").first();
    if (await option.count()) {
      await option.click();
      await expect(page.locator(".q").first(), `stuck on: ${asked}`).not.toHaveText(asked);
      continue;
    }

    const number = page.getByRole("spinbutton");
    if (await number.count()) await number.fill("800");

    const textarea = page.locator("textarea").first();
    if (await textarea.count()) await textarea.fill(openText);

    const text = page.locator('input[type="text"]').first();
    if (await text.count()) await text.fill("Deputy clerk");

    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.locator(".q").first(), `stuck on: ${asked}`).not.toHaveText(asked);
  }

  await expect(page.getByRole("button", { name: "Record my response" })).toBeVisible();
}

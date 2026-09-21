"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { isSignedIn, passphraseMatches, signIn, signOut } from "@/lib/auth";
import { checkLimit, clearFailures, noteFailure } from "@/lib/rate-limit";
import { record } from "@/lib/activity";
import { env } from "@/lib/env";
import { DEFAULT_SETTINGS, readSettings, writeSettings } from "@/lib/settings";
import { testModel } from "@/lib/model";
import { hashIp } from "@/core/tokens";
import { loadSampleData, removeSampleData } from "@/db/queries/sample-data";
import { readTemplate } from "./studies/actions";

async function callerKey(): Promise<string> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const salt = env.ipHashSalt() ?? "unsalted";
  return hashIp(ip, salt);
}

export async function attemptSignIn(_prev: string | null, form: FormData): Promise<string | null> {
  const key = `login:${await callerKey()}`;
  const window = 10 * 60 * 1000;

  // Failures count, successes do not, so signing in from a second tab never locks anyone out.
  const limit = checkLimit(key, 8, window);
  if (!limit.ok) {
    return `Too many wrong tries. Wait ${limit.retryInSeconds} seconds and try again.`;
  }

  if (!env.operatorPassphrase()) {
    return "No passphrase is set on the server yet. Set OPERATOR_PASSPHRASE in the Railway dashboard under Variables, then redeploy.";
  }
  if (!env.sessionSecret()) {
    return "SESSION_SECRET is not set on the server, so a sign-in cannot be remembered. Set it in the Railway dashboard under Variables, then redeploy.";
  }

  const attempt = String(form.get("passphrase") ?? "");
  if (!passphraseMatches(attempt)) {
    noteFailure(key, window);
    await record("sign_in_failed");
    return "That passphrase does not match. Try again.";
  }

  clearFailures(key);
  await signIn();
  await record("sign_in");
  redirect("/console");
}

export async function endSession(): Promise<void> {
  await record("sign_out");
  await signOut();
  redirect("/console/login");
}

export async function saveSettings(_prev: string | null, form: FormData): Promise<string | null> {
  if (!(await isSignedIn())) redirect("/console/login");

  const text = (name: string) => {
    const value = String(form.get(name) ?? "").trim();
    return value.length ? value : null;
  };
  const number = (name: string, fallback: number) => {
    const value = Number(form.get(name));
    return Number.isFinite(value) && value >= 0 ? value : fallback;
  };

  const domain = text("linkDomain");
  if (domain && !/^https:\/\/[a-z0-9.-]+$/i.test(domain)) {
    return "The survey link domain must start with https:// and be just the domain, with no path. For example https://surveys.ethoslabs.us";
  }

  const before = await readSettings();
  const next = {
    linkDomain: domain,
    postalAddress: text("postalAddress"),
    replyTo: text("replyTo"),
    sendProvider: String(form.get("sendProvider") ?? DEFAULT_SETTINGS.sendProvider),
    instantlyWebhookId: before.instantlyWebhookId,
    perInboxDailyLimit: number("perInboxDailyLimit", DEFAULT_SETTINGS.perInboxDailyLimit),
    contactHistoryWindowDays: number("contactHistoryWindowDays", DEFAULT_SETTINGS.contactHistoryWindowDays),
    bounceRate: number("bounceRate", DEFAULT_SETTINGS.bounceRate * 100) / 100,
    complaintRate: number("complaintRate", DEFAULT_SETTINGS.complaintRate * 100) / 100,
  };

  try {
    await writeSettings(next);
  } catch {
    return "Could not save. The database did not answer. Check the first line of the setup checklist.";
  }
  const changed = Object.keys(next).filter(
    (k) => before[k as keyof typeof before] !== next[k as keyof typeof next],
  );
  await record("settings_saved", { changed });
  // The checklist sits on this page and on the setup screen. Without this, a save leaves
  // the operator looking at a line that still says the thing they just fixed is missing.
  revalidatePath("/console");
  revalidatePath("/console/settings");
  return changed.length ? "Settings saved." : "Nothing changed.";
}

/** The checklist's "Test it": one real call, so a wrong key is found here and not mid-survey. */
export async function testTheModel(_prev: string | null): Promise<string | null> {
  if (!(await isSignedIn())) redirect("/console/login");

  const result = await testModel();
  await record("model_tested", { ok: result.ok });
  return result.ok
    ? `The model answered. The AI follow-up has something to talk to.`
    : result.why;
}

/**
 * Sample data. A complete fake dataset for every screen, loaded and removed from the console
 * so seeing the product never needs a command (rule 10). Everything it writes is marked, and
 * removal finds it by those marks and nothing else.
 */
export async function loadSample(_prev: string | null): Promise<string | null> {
  if (!(await isSignedIn())) redirect("/console/login");

  let template: string;
  try {
    template = await readTemplate("brandeis-records-2026");
  } catch {
    return "The worked example template is missing from this build, so there is nothing to base the sample study on.";
  }

  let result: Awaited<ReturnType<typeof loadSampleData>>;
  try {
    result = await loadSampleData(template);
  } catch (err) {
    await record("sample_data_failed", { message: err instanceof Error ? err.message : String(err) });
    return "Could not load the sample data. The database did not finish the job. Press Remove sample data to clear what was written, then try again.";
  }
  if (!result.ok) return result.problem;

  await record("sample_data_loaded", result.counts);
  revalidatePath("/console");
  revalidatePath("/console/settings");
  return `Sample data loaded: ${result.counts.governments} fake governments, ${result.counts.contacts} fake contacts, and a fielding study with ${result.counts.responses} responses. Open Studies to look around.`;
}

export async function removeSample(_prev: string | null): Promise<string | null> {
  if (!(await isSignedIn())) redirect("/console/login");

  let counts: Awaited<ReturnType<typeof removeSampleData>>;
  try {
    counts = await removeSampleData();
  } catch (err) {
    await record("sample_data_remove_failed", { message: err instanceof Error ? err.message : String(err) });
    return "Could not remove the sample data. The database did not finish the job. Try again; nothing real was touched.";
  }

  await record("sample_data_removed", counts);
  revalidatePath("/console");
  revalidatePath("/console/settings");
  return "Sample data removed. Only records marked as sample data were deleted.";
}

/**
 * Ask Instantly to send its delivery reports here. One press, from Settings; the webhook
 * carries the shared secret as a header, which is how the route tells Instantly from anyone.
 */
export async function connectInstantly(_prev: string | null, _form: FormData): Promise<string | null> {
  if (!(await isSignedIn())) redirect("/console/login");
  const current = await readSettings();
  if (!current.linkDomain) return "Save the survey link domain first. That is the address Instantly will post to.";
  const secret = process.env.SEND_WEBHOOK_SECRET;
  if (!secret) return "SEND_WEBHOOK_SECRET is not set, so reports could not be told apart from anyone else's. Set it in the Railway dashboard under Variables.";
  try {
    const { registerWebhook } = await import("@/lib/providers/instantly");
    const id = await registerWebhook(`${current.linkDomain}/api/webhooks/instantly`, secret);
    await writeSettings({ ...current, instantlyWebhookId: id || "connected" });
  } catch (err) {
    return err instanceof Error ? err.message : "Instantly did not accept the webhook.";
  }
  await record("instantly_connected", {});
  revalidatePath("/console");
  revalidatePath("/console/settings");
  return "Connected. Instantly will report sends, bounces and unsubscribes here.";
}

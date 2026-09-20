"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isSignedIn } from "@/lib/auth";
import { record } from "@/lib/activity";
import { parseStudy } from "@/core/study-schema";
import { studyBySlug } from "@/db/queries/studies";
import { pausedReason, recordQueued, setPaused } from "@/db/queries/sending";
import { readSettings } from "@/lib/settings";
import { buildMessages, planTouch, providerFor, whyBlocked, CsvProvider } from "@/lib/sending";

async function requireOperator() {
  if (!(await isSignedIn())) redirect("/console/login");
}

export async function queueTouch(_prev: string | null, form: FormData): Promise<string | null> {
  await requireOperator();
  const slug = String(form.get("slug") ?? "");
  const touch = Number(form.get("touch") ?? 0);

  const study = await studyBySlug(slug);
  if (!study) return "That study no longer exists.";

  const parsed = parseStudy(study.draftText);
  if (!parsed.ok) return "Fix the problems in the study file before sending anything.";

  const settings = await readSettings();
  const manual = await pausedReason(study.id);

  // Checked again here, so nothing can be clicked past between looking and queueing.
  const blocked = await whyBlocked(parsed.study, study.draftText, settings, study.id, manual);
  if (blocked.blocked) return blocked.reason;

  const plan = await planTouch(parsed.study, study.id, touch, settings);
  if (!plan) return `This study has no touch ${touch}.`;
  if (plan.willSend === 0) {
    return plan.result.send.length === 0
      ? "Nobody is due this touch. Everyone has either answered, unsubscribed, or already had it."
      : `Today's limit of ${settings.perInboxDailyLimit.toLocaleString("en-US")} has already been used. The rest will be ready tomorrow.`;
  }

  const chosen = plan.result.send.slice(0, plan.willSend);
  const built = await buildMessages(parsed.study, touch, chosen, settings);
  if ("problem" in built) return built.problem;

  const provider = providerFor(settings.sendProvider);
  const ids = await provider.enqueue(built.messages);
  const byContact = new Map(ids.map((i) => [i.studyContactId, i.providerMessageId]));

  const written = await recordQueued(
    built.messages.map((m) => ({
      studyContactId: m.studyContactId,
      touch: m.touch,
      subjectVariant: m.subjectVariant,
      provider: provider.name,
      providerMessageId: byContact.get(m.studyContactId) ?? `${provider.name}-unknown`,
    })),
  );

  await record("touch_queued", { slug, touch, count: written, provider: provider.name });
  revalidatePath(`/console/studies/${slug}/follow-ups`);

  const held = plan.heldByThrottle > 0 ? ` ${plan.heldByThrottle.toLocaleString("en-US")} were held back by today's limit.` : "";
  if (provider.name === "dryrun") {
    return `Dry run: ${written.toLocaleString("en-US")} emails were written down and nothing was sent.${held}`;
  }
  if (provider instanceof CsvProvider) {
    return `${written.toLocaleString("en-US")} emails are ready to merge. Download the file below.${held}`;
  }
  return `${written.toLocaleString("en-US")} emails queued.${held}`;
}

export async function pauseSending(form: FormData): Promise<void> {
  await requireOperator();
  const slug = String(form.get("slug") ?? "");
  const study = await studyBySlug(slug);
  if (!study) redirect("/console/studies");

  await setPaused(study.id, "Paused by hand. Resume when you are ready.");
  await record("sending_paused", { slug, by: "operator" });
  revalidatePath(`/console/studies/${slug}/follow-ups`);
  redirect(`/console/studies/${slug}/follow-ups`);
}

export async function resumeSending(form: FormData): Promise<void> {
  await requireOperator();
  const slug = String(form.get("slug") ?? "");
  const study = await studyBySlug(slug);
  if (!study) redirect("/console/studies");

  const was = await pausedReason(study.id);
  await setPaused(study.id, null);
  // Worth recording what was overridden: resuming past a breaker trip is a real decision.
  await record("sending_resumed", { slug, cleared: was });
  revalidatePath(`/console/studies/${slug}/follow-ups`);
  redirect(`/console/studies/${slug}/follow-ups`);
}

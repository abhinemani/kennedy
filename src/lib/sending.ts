import { touchAudience, type AudienceResult } from "@/core/audience";
import { evaluateBreaker, type BreakerConfig } from "@/core/breaker";
import {
  assertSendable, DryRunProvider, pickSubject, renderTemplate, toCsv,
  type MergeFields, type OutgoingMessage, type SendProvider,
} from "@/core/send";
import { readyToSend, type Study } from "@/core/study-schema";
import { audienceRows, recentStatuses, recipients, sentToday } from "@/db/queries/sending";
import type { Settings } from "./settings";

/**
 * Exports a merge-ready file instead of delivering. The operator sends it from wherever they
 * already send mail, which is what the spec asks for until a platform is chosen: a
 * transactional email provider's terms generally forbid purchased lists.
 */
export class CsvProvider implements SendProvider {
  name = "csv";
  file = "";
  private readonly run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  async enqueue(messages: OutgoingMessage[]) {
    this.file = toCsv(messages);
    // Unique per batch, for the same reason the dry-run provider's ids are.
    return messages.map((m, i) => ({ studyContactId: m.studyContactId, providerMessageId: `csv-${this.run}-${i}` }));
  }
}

export function providerFor(name: string): SendProvider {
  return name === "csv" ? new CsvProvider() : new DryRunProvider();
}

export type TouchPlan = {
  touch: number;
  day: number;
  subjects: string[];
  audience: "all" | "started_only";
  result: AudienceResult;
  /** After the daily throttle has been applied. */
  willSend: number;
  heldByThrottle: number;
};

export function breakerConfigFrom(settings: Settings): BreakerConfig {
  return {
    bounceWindow: 200,
    bounceRate: settings.bounceRate,
    complaintWindow: 1000,
    complaintRate: settings.complaintRate,
    minSends: 100,
  };
}

export type SendBlock = { blocked: true; reason: string } | { blocked: false };

/**
 * Everything that has to be true before an email may leave. Checked on the screen so the
 * operator sees it, and again before queueing so it cannot be clicked past.
 *
 * The circuit breaker is deliberately not re-evaluated here. It is a latch: it trips when a
 * provider reports a bounce or a complaint, writes its reason onto the study, and stays
 * tripped until the operator resumes. Re-judging it on every page load would mean Resume did
 * nothing at all, because the same history would immediately block again.
 */
export async function whyBlocked(
  study: Study,
  draftText: string,
  settings: Settings,
  _studyId: string,
  pause: string | null,
): Promise<SendBlock> {
  if (pause) return { blocked: true, reason: pause };

  if (!readyToSend(draftText)) {
    return {
      blocked: true,
      reason: "This study still contains CHANGE_ME. Fill those in before any email goes out.",
    };
  }
  if (!settings.postalAddress) {
    return { blocked: true, reason: "Every email must carry a postal address. Add one in Settings." };
  }
  if (!settings.linkDomain) {
    return { blocked: true, reason: "No survey link domain is saved, so links would point nowhere. Add one in Settings." };
  }

  return { blocked: false };
}

/** What the recent numbers look like, shown as information even when sending is allowed. */
export async function deliveryHealth(studyId: string, settings: Settings) {
  const recent = await recentStatuses(studyId);
  if (recent.length === 0) return null;

  const share = (status: string, window: number) => {
    const slice = recent.slice(0, window);
    return slice.length === 0 ? 0 : slice.filter((s) => s === status).length / slice.length;
  };
  const bounce = share("bounced", 200);
  const complaint = share("complained", 1000);

  return {
    sends: recent.length,
    bounce,
    complaint,
    hot: bounce > settings.bounceRate || complaint > settings.complaintRate,
  };
}

export async function planTouch(
  study: Study,
  studyId: string,
  touchNumber: number,
  settings: Settings,
  now = new Date(),
): Promise<TouchPlan | null> {
  const touch = study.sequence.find((t) => t.touch === touchNumber);
  if (!touch) return null;

  const contacts = await audienceRows(studyId);
  const result = touchAudience(contacts, {
    touch: touch.touch,
    now,
    historyWindowDays: settings.contactHistoryWindowDays,
    audience: touch.audience,
  });

  const already = await sentToday(studyId);
  const room = Math.max(0, settings.perInboxDailyLimit - already);
  const willSend = Math.min(result.send.length, room);

  return {
    touch: touch.touch,
    day: touch.day,
    subjects: touch.subjects,
    audience: touch.audience ?? "all",
    result,
    willSend,
    heldByThrottle: result.send.length - willSend,
  };
}

export function mergeFieldsFor(
  r: { firstName: string; entityName: string; token: string },
  settings: Settings,
): MergeFields {
  const base = settings.linkDomain ?? "";
  return {
    first_name: r.firstName,
    entity_name: r.entityName,
    link: `${base}/s/${r.token}`,
    unsubscribe: `${base}/u/${r.token}`,
    postal_address: settings.postalAddress ?? "",
  };
}

export type BuiltMessage = OutgoingMessage & { subjectVariant: number };

/** Render the touch for a set of people, refusing anything that breaks the email rules. */
export async function buildMessages(
  study: Study,
  touchNumber: number,
  studyContactIds: string[],
  settings: Settings,
): Promise<{ messages: BuiltMessage[] } | { problem: string }> {
  const touch = study.sequence.find((t) => t.touch === touchNumber);
  if (!touch) return { problem: `This study has no touch ${touchNumber}.` };

  const people = await recipients(studyContactIds);
  const built: BuiltMessage[] = [];

  for (const person of people) {
    const fields = mergeFieldsFor(person, settings);
    let body: string;
    let subject: string;
    let variant: number;
    try {
      body = renderTemplate(touch.body, fields);
      const picked = pickSubject(touch.subjects, person.studyContactId);
      subject = renderTemplate(picked.subject, fields);
      variant = picked.variant;
      assertSendable(body, fields);
    } catch (err) {
      return { problem: err instanceof Error ? err.message : "This email could not be rendered." };
    }
    built.push({
      studyContactId: person.studyContactId,
      to: person.email,
      firstName: person.firstName,
      subject,
      body,
      touch: touch.touch,
      subjectVariant: variant,
    });
  }

  return { messages: built };
}

/** A single rendered email for the preview screen, using a stand-in recipient. */
export function previewMessage(study: Study, touchNumber: number, settings: Settings) {
  const touch = study.sequence.find((t) => t.touch === touchNumber);
  if (!touch) return null;

  const fields = mergeFieldsFor(
    { firstName: "Sam", entityName: "City of Riverton", token: "EXAMPLE_LINK_FOR_PREVIEW" },
    { ...settings, postalAddress: settings.postalAddress ?? "(no postal address saved yet)" },
  );

  try {
    const body = renderTemplate(touch.body, fields);
    const subjects = touch.subjects.map((s) => renderTemplate(s, fields));
    let problem: string | null = null;
    try {
      assertSendable(body, fields);
    } catch (err) {
      problem = err instanceof Error ? err.message : "This email breaks one of the email rules.";
    }
    return { subjects, body, problem };
  } catch (err) {
    return { subjects: [], body: "", problem: err instanceof Error ? err.message : "Could not render this email." };
  }
}

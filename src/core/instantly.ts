// The pure part of the Instantly provider: what a message is called there, and what its
// delivery reports mean here. The HTTP lives in src/lib/providers/instantly.ts.
//
// Instantly sends from a campaign. Kennedy keeps its own sequence, so each touch of a study
// maps to one single-step Instantly campaign whose template is just {{subject}} and {{body}};
// Kennedy renders the whole email per person and passes it in as lead variables. Instantly
// does the throttling, the rotation across inboxes, and the bounce handling; Kennedy decides
// who gets what and when, as always.

import type { OutgoingMessage, ProviderEvent } from "./send";

/** Lead variables the campaign template reads. Names are what the template must use. */
export const LEAD_VARIABLES = ["subject", "body", "link", "unsubscribe", "kennedy_touch", "kennedy_study_contact_id"] as const;

/**
 * A message's id at the provider. Instantly has one lead per email per campaign, so the pair
 * names the message; a delivery report carries both and finds its message without a lookup.
 */
export function providerMessageId(campaignId: string, email: string): string {
  return `instantly:${campaignId}:${email.trim().toLowerCase()}`;
}

export type LeadPayload = {
  campaign: string;
  email: string;
  first_name: string;
  custom_variables: Record<string, string>;
  skip_if_in_campaign: boolean;
};

/** The body Kennedy posts to create one lead. Everything the email needs travels with it. */
export function leadPayload(m: OutgoingMessage, campaignId: string, link: string, unsubscribe: string): LeadPayload {
  return {
    campaign: campaignId,
    email: m.to,
    first_name: m.firstName,
    custom_variables: {
      subject: m.subject,
      body: m.body,
      link,
      unsubscribe,
      kennedy_touch: String(m.touch),
      kennedy_study_contact_id: m.studyContactId,
    },
    // The same person is never added to the same touch twice, whatever the operator presses.
    skip_if_in_campaign: true,
  };
}

/** Which touch a campaign id belongs to, from the study file. Null when none claims it. */
export function touchForCampaign(sequence: { touch: number; campaign?: string }[], campaignId: string): number | null {
  return sequence.find((t) => t.campaign === campaignId)?.touch ?? null;
}

/** Touches with no campaign id yet, so sending can refuse with a sentence that names them. */
export function touchesWithoutCampaign(sequence: { touch: number; campaign?: string }[]): number[] {
  return sequence.filter((t) => !t.campaign || /CHANGE_ME/.test(t.campaign)).map((t) => t.touch);
}

export type InstantlyEvent = {
  event_type?: string;
  campaign_id?: string;
  lead_email?: string;
  timestamp?: string;
};

export type Translated = {
  /** Message statuses Kennedy understands, keyed by the provider message id. */
  events: ProviderEvent[];
  /** Addresses that asked Instantly to stop. Suppressed as unsubscribed, not counted as complaints. */
  unsubscribed: string[];
  /** Event types seen but not acted on, for the activity log. */
  ignored: string[];
};

const STATUS: Record<string, ProviderEvent["type"]> = {
  email_sent: "delivered",
  email_bounced: "bounced",
};

/**
 * Instantly's webhook payload, read into Kennedy's terms. Replies, opens and the rest are
 * not delivery states and are left alone; an unsubscribe is a suppression, not a complaint,
 * because the person asked politely and the circuit breaker should not punish that.
 */
export function translateWebhook(payload: unknown): Translated {
  const list: InstantlyEvent[] = Array.isArray(payload)
    ? (payload as InstantlyEvent[])
    : payload && typeof payload === "object"
      ? [payload as InstantlyEvent]
      : [];
  const out: Translated = { events: [], unsubscribed: [], ignored: [] };
  for (const e of list) {
    const type = String(e.event_type ?? "");
    const email = String(e.lead_email ?? "").trim().toLowerCase();
    const campaign = String(e.campaign_id ?? "");
    if (type === "lead_unsubscribed") {
      if (email) out.unsubscribed.push(email);
      continue;
    }
    const status = STATUS[type];
    if (!status || !email || !campaign) {
      out.ignored.push(type || "unknown");
      continue;
    }
    out.events.push({ providerMessageId: providerMessageId(campaign, email), type: status });
  }
  return out;
}

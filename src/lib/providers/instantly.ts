import { leadPayload, providerMessageId } from "@/core/instantly";
import type { OutgoingMessage, SendProvider } from "@/core/send";
import { env } from "@/lib/env";

// Instantly, over its v2 API. Kennedy hands each rendered email to the campaign that stands
// for its touch, as a lead with the subject and body as variables; Instantly sends it from
// its warmed inboxes at the pace set there, and reports back through the webhook.

const BASE = "https://api.instantly.ai/api/v2";

export class InstantlyNotConfigured extends Error {}

async function call(path: string, body: unknown): Promise<Record<string, unknown>> {
  const key = env.instantlyKey();
  if (!key) throw new InstantlyNotConfigured("INSTANTLY_API_KEY is not set. Add it in the Railway dashboard under Variables.");
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const text = (await res.text().catch(() => "")).slice(0, 300);
    throw new Error(`Instantly answered ${res.status} to ${path}: ${text || res.statusText}`);
  }
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

export class InstantlyProvider implements SendProvider {
  name = "instantly";
  /** Campaign id per touch, from the study file. */
  constructor(private readonly campaigns: Map<number, string>) {}

  async enqueue(messages: OutgoingMessage[]) {
    const out: { studyContactId: string; providerMessageId: string }[] = [];
    for (const m of messages) {
      const campaign = this.campaigns.get(m.touch);
      if (!campaign) throw new Error(`Touch ${m.touch} has no Instantly campaign id in the study file.`);
      const link = m.body.match(/https?:\/\/\S+\/s\/\S+/)?.[0] ?? "";
      const unsubscribe = m.body.match(/https?:\/\/\S+\/u\/\S+/)?.[0] ?? "";
      await call("/leads", leadPayload(m, campaign, link, unsubscribe));
      out.push({ studyContactId: m.studyContactId, providerMessageId: providerMessageId(campaign, m.to) });
    }
    return out;
  }
}

/**
 * Ask Instantly to post its delivery reports to Kennedy, carrying the shared secret as a
 * header so the webhook route can tell it from anyone else. Returns the webhook's id.
 */
export async function registerWebhook(targetUrl: string, secret: string): Promise<string> {
  const events = ["email_sent", "email_bounced", "lead_unsubscribed"];
  let last = "";
  for (const event_type of events) {
    const made = await call("/webhooks", {
      target_hook_url: targetUrl,
      event_type,
      headers: { "x-kennedy-secret": secret },
    });
    last = String(made.id ?? last);
  }
  return last;
}

export type OutgoingMessage = { studyContactId: string; to: string; firstName: string; subject: string; body: string; touch: number };
export type ProviderEvent = { providerMessageId: string; type: "delivered" | "bounced" | "complained" | "failed" };

/** Canvass decides who gets what and when. A provider only delivers. */
export interface SendProvider {
  name: string;
  enqueue(messages: OutgoingMessage[]): Promise<{ studyContactId: string; providerMessageId: string }[]>;
  handleWebhook?(payload: unknown): ProviderEvent[];
}

export type MergeFields = { first_name: string; entity_name: string; link: string; unsubscribe: string; postal_address: string };

export function renderTemplate(template: string, f: MergeFields): string {
  const out = template.replace(/\{(\w+)\}/g, (whole, k: string) => (k in f ? f[k as keyof MergeFields] : whole));
  const left = out.match(/\{\w+\}/g);
  if (left) throw new Error(`Unknown merge field ${left[0]}`);
  return out;
}

/** Rule: plain text, exactly one survey link, an unsubscribe link, a postal address. */
export function assertSendable(body: string, f: MergeFields): void {
  const links = body.match(/https?:\/\/\S+/g) ?? [];
  const others = links.filter((l) => l !== f.link && l !== f.unsubscribe);
  if (!body.includes(f.link)) throw new Error("The email is missing its survey link.");
  if (!body.includes(f.unsubscribe)) throw new Error("The email is missing its unsubscribe link.");
  if (!f.postal_address.trim() || /CHANGE_ME/.test(f.postal_address)) throw new Error("Set a postal address before sending.");
  if (others.length) throw new Error(`The email contains an extra link: ${others[0]}`);
  if (/<[a-z][\s\S]*>/i.test(body)) throw new Error("Emails are plain text. Remove the HTML.");
}

/** Deterministic subject pick so a contact keeps the same variant across retries. */
export function pickSubject(subjects: string[], studyContactId: string): { subject: string; variant: number } {
  let h = 0; for (const ch of studyContactId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const variant = h % subjects.length;
  return { subject: subjects[variant]!, variant };
}

const cell = (s: string) => `"${s.replace(/"/g, '""')}"`;
export function toCsv(messages: OutgoingMessage[]): string {
  const head = ["email", "first_name", "subject", "body", "touch", "study_contact_id"];
  return [head.join(","), ...messages.map((m) => [m.to, m.firstName, m.subject, m.body, String(m.touch), m.studyContactId].map(cell).join(","))].join("\r\n");
}

/** The default provider. Records what would be sent and sends nothing. */
export class DryRunProvider implements SendProvider {
  name = "dryrun"; log: OutgoingMessage[] = [];
  async enqueue(messages: OutgoingMessage[]) { this.log.push(...messages); return messages.map((m, i) => ({ studyContactId: m.studyContactId, providerMessageId: `dryrun-${this.log.length - messages.length + i}` })); }
}

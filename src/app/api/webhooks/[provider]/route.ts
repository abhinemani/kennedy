import { evaluateBreaker, type SendStatus } from "@/core/breaker";
import { applyEventByContact, applyProviderEvent, recentStatuses, setPaused } from "@/db/queries/sending";
import { suppressEmail } from "@/db/queries/suppression";
import { readSettings } from "@/lib/settings";
import { breakerConfigFrom } from "@/lib/sending";
import { record } from "@/lib/activity";

// Where a send provider reports what happened to a message. A bounce or a complaint
// suppresses the address at once and feeds the circuit breaker.
//
// This is the one route a third party posts to, so it is guarded by a shared secret rather
// than by a session. Without SEND_WEBHOOK_SECRET set, it refuses everything.
// A report names the message either by the id the provider gave us, or, when the operator
// sent a merge file themselves, by the study_contact_id and touch that file carried.
type Incoming = {
  providerMessageId?: string;
  studyContactId?: string;
  touch?: number;
  type?: string;
  events?: Incoming[];
};

const ALLOWED: SendStatus[] = ["delivered", "bounced", "complained", "failed"];

export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const secret = process.env.SEND_WEBHOOK_SECRET;
  if (!secret) return new Response("No webhook secret is configured.", { status: 503 });

  const given = request.headers.get("x-kennedy-secret");
  if (given !== secret) return new Response("Not allowed.", { status: 401 });

  const { provider } = await params;

  let payload: Incoming;
  try {
    payload = (await request.json()) as Incoming;
  } catch {
    return new Response("Expected JSON.", { status: 400 });
  }

  const events = payload.events ?? [payload];
  const settings = await readSettings();
  let applied = 0;
  let studyId: string | null = null;

  for (const event of events) {
    const type = event.type as SendStatus | undefined;
    if (!type || !ALLOWED.includes(type)) continue;

    const hit = event.providerMessageId
      ? await applyProviderEvent(event.providerMessageId, type)
      : event.studyContactId && Number.isInteger(event.touch)
        ? await applyEventByContact(event.studyContactId, event.touch as number, type)
        : null;
    if (!hit) continue;
    applied += 1;
    studyId = hit.studyId;

    // Bounces and complaints suppress automatically (spec section 9).
    if (type === "bounced" || type === "complained") {
      await suppressEmail(hit.email, type === "bounced" ? "bounced" : "complaint");
    }
  }

  let paused: string | null = null;
  if (studyId) {
    const breaker = evaluateBreaker(await recentStatuses(studyId), breakerConfigFrom(settings));
    if (breaker.paused) {
      await setPaused(studyId, breaker.reason);
      paused = breaker.reason;
      await record("sending_paused", { by: "circuit_breaker", reason: breaker.reason });
    }
  }

  await record("webhook_received", { provider, events: events.length, applied });
  return Response.json({ applied, paused });
}

export function GET() {
  return new Response("Providers post here.", { status: 405 });
}

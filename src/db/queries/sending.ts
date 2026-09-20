import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { messages, studies, studyContacts } from "@/db/schema";
import type { AudienceContact } from "@/core/audience";
import type { SendStatus } from "@/core/breaker";

export type Recipient = {
  studyContactId: string;
  email: string;
  firstName: string;
  entityName: string;
  token: string;
};

/** Everything `touchAudience` needs to decide who gets this touch, and why the rest do not. */
export async function audienceRows(studyId: string): Promise<AudienceContact[]> {
  const rows = await db().execute<Record<string, unknown>>(sql`
    select
      sc.id,
      exists (
        select 1 from responses r
         where r.study_contact_id = sc.id and r.status = 'complete'
      ) as completed,
      exists (
        select 1 from link_events e
         where e.study_contact_id = sc.id and e.type = 'started'
      ) as started,
      exists (select 1 from suppressions s where s.email = c.email) as suppressed,
      c.email_status::text as email_status,
      (
        select max(m2.created_at)
          from messages m2
          join study_contacts sc2 on sc2.id = m2.study_contact_id
         where sc2.contact_id = sc.contact_id and sc2.study_id <> sc.study_id
      ) as last_other_study,
      coalesce(
        (select array_agg(m.touch) from messages m where m.study_contact_id = sc.id),
        '{}'
      ) as touches
    from study_contacts sc
    join contacts c on c.id = sc.contact_id
    where sc.study_id = ${studyId}
  `);

  return (rows as unknown as Record<string, unknown>[]).map((r) => ({
    studyContactId: String(r.id),
    completed: Boolean(r.completed),
    started: Boolean(r.started),
    suppressed: Boolean(r.suppressed),
    emailStatus: String(r.email_status) as AudienceContact["emailStatus"],
    lastContactedByOtherStudy: r.last_other_study ? new Date(String(r.last_other_study)) : null,
    touchesSent: Array.isArray(r.touches) ? (r.touches as unknown[]).map(Number) : [],
  }));
}

export async function recipients(ids: string[]): Promise<Recipient[]> {
  if (ids.length === 0) return [];
  const out: Recipient[] = [];
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const rows = await db()
      .select({
        studyContactId: studyContacts.id,
        token: studyContacts.token,
        email: sql<string>`c.email`,
        fullName: sql<string | null>`c.full_name`,
        entityName: sql<string>`e.name`,
      })
      .from(studyContacts)
      .innerJoin(sql`contacts c`, sql`c.id = ${studyContacts.contactId}`)
      .innerJoin(sql`entities e`, sql`e.id = c.entity_id`)
      .where(inArray(studyContacts.id, chunk));

    for (const r of rows) {
      out.push({
        studyContactId: r.studyContactId,
        token: r.token,
        email: r.email,
        firstName: (r.fullName ?? "").split(" ")[0] || "there",
        entityName: r.entityName,
      });
    }
  }
  return out;
}

export async function recordQueued(
  rows: { studyContactId: string; touch: number; subjectVariant: number; provider: string; providerMessageId: string }[],
): Promise<number> {
  if (rows.length === 0) return 0;
  let written = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const inserted = await db()
      .insert(messages)
      .values(
        chunk.map((r) => ({
          studyContactId: r.studyContactId,
          touch: r.touch,
          subjectVariant: r.subjectVariant,
          provider: r.provider,
          providerMessageId: r.providerMessageId,
          status: "sent" as const,
          sentAt: new Date(),
        })),
      )
      .onConflictDoNothing()
      .returning({ id: messages.id });
    written += inserted.length;
  }
  return written;
}

/** Newest first, which is the order the circuit breaker expects. */
export async function recentStatuses(studyId: string, limit = 1000): Promise<SendStatus[]> {
  const rows = await db().execute<{ status: string }>(sql`
    select m.status::text as status
      from messages m
      join study_contacts sc on sc.id = m.study_contact_id
     where sc.study_id = ${studyId} and m.status <> 'queued'
     order by m.created_at desc
     limit ${limit}
  `);
  return (rows as unknown as { status: string }[]).map((r) => r.status as SendStatus);
}

/** How many have gone out today, for the per-inbox daily throttle. */
export async function sentToday(studyId: string): Promise<number> {
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const rows = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(messages)
    .innerJoin(studyContacts, eq(studyContacts.id, messages.studyContactId))
    .where(and(eq(studyContacts.studyId, studyId), gte(messages.sentAt, midnight)));
  return rows[0]?.n ?? 0;
}

export async function touchesSoFar(studyId: string) {
  const rows = await db().execute<{ touch: number; n: number; at: string }>(sql`
    select m.touch, count(*)::int as n, max(m.sent_at) as at
      from messages m
      join study_contacts sc on sc.id = m.study_contact_id
     where sc.study_id = ${studyId}
     group by m.touch order by m.touch
  `);
  return (rows as unknown as Record<string, unknown>[]).map((r) => ({
    touch: Number(r.touch),
    n: Number(r.n),
    at: r.at ? new Date(String(r.at)) : null,
  }));
}

export async function setPaused(studyId: string, reason: string | null): Promise<void> {
  await db().update(studies).set({ sendingPausedReason: reason, updatedAt: new Date() }).where(eq(studies.id, studyId));
}

export async function pausedReason(studyId: string): Promise<string | null> {
  const rows = await db().select({ reason: studies.sendingPausedReason }).from(studies).where(eq(studies.id, studyId)).limit(1);
  return rows[0]?.reason ?? null;
}

/** Applied when a provider reports what happened to a message. */
export async function applyProviderEvent(
  providerMessageId: string,
  status: SendStatus,
): Promise<{ email: string; studyId: string } | null> {
  const rows = await db().execute<{ email: string; study_id: string }>(sql`
    update messages m
       set status = ${status}::message_status, updated_at = now()
      from study_contacts sc, contacts c
     where m.provider_message_id = ${providerMessageId}
       and sc.id = m.study_contact_id
       and c.id = sc.contact_id
    returning c.email, sc.study_id
  `);
  const row = (rows as unknown as { email: string; study_id: string }[])[0];
  return row ? { email: row.email, studyId: row.study_id } : null;
}

/**
 * The same thing, addressed by our own identifier instead of the provider's.
 *
 * When the operator sends a merge file themselves there is no provider message id they could
 * ever quote back: what they have is the study_contact_id in the file. Bounce reports keyed
 * that way are the normal case for that route.
 */
export async function applyEventByContact(
  studyContactId: string,
  touch: number,
  status: SendStatus,
): Promise<{ email: string; studyId: string } | null> {
  const rows = await db().execute<{ email: string; study_id: string }>(sql`
    update messages m
       set status = ${status}::message_status, updated_at = now()
      from study_contacts sc, contacts c
     where m.study_contact_id = ${studyContactId}
       and m.touch = ${touch}
       and sc.id = m.study_contact_id
       and c.id = sc.contact_id
    returning c.email, sc.study_id
  `);
  const row = (rows as unknown as { email: string; study_id: string }[])[0];
  return row ? { email: row.email, studyId: row.study_id } : null;
}

export async function lastMessages(studyId: string, limit = 20) {
  return db()
    .select({
      id: messages.id,
      touch: messages.touch,
      status: messages.status,
      provider: messages.provider,
      sentAt: messages.sentAt,
    })
    .from(messages)
    .innerJoin(studyContacts, eq(studyContacts.id, messages.studyContactId))
    .where(eq(studyContacts.studyId, studyId))
    .orderBy(desc(messages.createdAt))
    .limit(limit);
}

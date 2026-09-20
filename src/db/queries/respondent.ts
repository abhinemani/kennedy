import { and, desc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  answers, contacts, entities, freeText, handRaises, linkEvents, panelMembers,
  responses, studies, studyContacts, studyVersions,
} from "@/db/schema";
import type { Study } from "@/core/study-schema";
import { looksLikeToken } from "@/core/tokens";

export type Link = {
  studyContactId: string;
  studyId: string;
  slug: string;
  status: typeof studies.$inferSelect["status"];
  tokenStatus: "active" | "completed" | "expired";
  attributes: Record<string, string | number>;
  entityName: string;
  firstName: string | null;
  email: string;
  versionId: string;
  study: Study;
};

/** Everything a respondent page needs, and nothing that identifies them beyond their own link. */
export async function linkFor(token: string): Promise<Link | null> {
  if (!looksLikeToken(token)) return null;

  const rows = await db()
    .select({
      studyContactId: studyContacts.id,
      studyId: studies.id,
      slug: studies.slug,
      status: studies.status,
      tokenStatus: studyContacts.tokenStatus,
      attributes: studyContacts.attributes,
      entityName: entities.name,
      firstName: contacts.fullName,
      email: contacts.email,
      versionId: studyVersions.id,
      content: studyVersions.content,
    })
    .from(studyContacts)
    .innerJoin(studies, eq(studies.id, studyContacts.studyId))
    .innerJoin(contacts, eq(contacts.id, studyContacts.contactId))
    .innerJoin(entities, eq(entities.id, contacts.entityId))
    .innerJoin(studyVersions, eq(studyVersions.studyId, studies.id))
    .where(eq(studyContacts.token, token))
    .orderBy(desc(studyVersions.version))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return {
    studyContactId: row.studyContactId,
    studyId: row.studyId,
    slug: row.slug,
    status: row.status,
    tokenStatus: row.tokenStatus,
    attributes: (row.attributes ?? {}) as Record<string, string | number>,
    entityName: row.entityName,
    firstName: row.firstName?.split(" ")[0] ?? null,
    email: row.email,
    versionId: row.versionId,
    study: row.content as Study,
  };
}

/** A GET may record this and nothing else. "Loaded" is never counted as opened (rule 1). */
export async function recordLoaded(studyContactId: string, userAgent: string | null, ipHash: string | null) {
  await db().insert(linkEvents).values({ studyContactId, type: "loaded", userAgent, ipHash });
}

export async function recordStarted(studyContactId: string, userAgent: string | null, ipHash: string | null) {
  await db().insert(linkEvents).values({ studyContactId, type: "started", userAgent, ipHash });
}

export type ResponseRow = typeof responses.$inferSelect;

export async function responseFor(studyContactId: string): Promise<ResponseRow | null> {
  const rows = await db().select().from(responses)
    .where(and(eq(responses.studyContactId, studyContactId), eq(responses.stageId, "survey")))
    .orderBy(desc(responses.createdAt)).limit(1);
  return rows[0] ?? null;
}

/** One completed response per token (rule 2). Starting again returns the existing one. */
export async function startResponse(link: Link): Promise<ResponseRow> {
  const existing = await responseFor(link.studyContactId);
  if (existing) return existing;
  const rows = await db().insert(responses).values({
    studyContactId: link.studyContactId,
    studyVersionId: link.versionId,
    engine: link.study.engine,
    status: "partial",
  }).returning();
  return rows[0]!;
}

export async function answersFor(responseId: string): Promise<Record<string, unknown>> {
  const rows = await db().select().from(answers).where(eq(answers.responseId, responseId));
  const out: Record<string, unknown> = {};
  for (const row of rows) out[row.questionId] = row.value;
  return out;
}

/** Saved as each question is answered, so a closed tab keeps what was already given. */
export async function saveAnswer(responseId: string, questionId: string, value: unknown, isFreeText: boolean) {
  await db().insert(answers)
    .values({ responseId, questionId, value: value as object, answeredAt: new Date() })
    .onConflictDoUpdate({
      target: [answers.responseId, answers.questionId],
      set: { value: value as object, answeredAt: new Date() },
    });

  // Free text lives apart from identifying fields (rule 5).
  if (isFreeText) {
    await db().delete(freeText).where(and(eq(freeText.responseId, responseId), eq(freeText.questionId, questionId)));
    const text = typeof value === "string" ? value.trim() : "";
    if (text) await db().insert(freeText).values({ responseId, questionId, text });
  }
}

export async function otherCompletesFromEntity(studyId: string, studyContactId: string): Promise<number> {
  const rows = await db().execute<{ n: number }>(sql`
    select count(*)::int as n
    from responses r
    join study_contacts sc on sc.id = r.study_contact_id
    join contacts c on c.id = sc.contact_id
    where sc.study_id = ${studyId}
      and r.status = 'complete'
      and sc.id <> ${studyContactId}
      and c.entity_id = (
        select c2.entity_id from study_contacts sc2
        join contacts c2 on c2.id = sc2.contact_id
        where sc2.id = ${studyContactId}
      )
  `);
  return Number(rows[0]?.n ?? 0);
}

export async function medianDurationSeconds(studyId: string): Promise<number | null> {
  const rows = await db().execute<{ median: number | null }>(sql`
    select percentile_cont(0.5) within group (order by r.duration_seconds) as median
    from responses r
    join study_contacts sc on sc.id = r.study_contact_id
    where sc.study_id = ${studyId} and r.status = 'complete' and r.duration_seconds is not null
  `);
  const value = rows[0]?.median;
  return value === null || value === undefined ? null : Number(value);
}

export async function markComplete(
  responseId: string,
  studyContactId: string,
  durationSeconds: number,
  flags: string[],
  quotePermission: boolean,
) {
  await db().update(responses).set({
    status: "complete", completedAt: new Date(), durationSeconds,
    qualityFlags: flags, quotePermission, updatedAt: new Date(),
  }).where(eq(responses.id, responseId));
  await db().update(studyContacts).set({ tokenStatus: "completed", updatedAt: new Date() })
    .where(eq(studyContacts.id, studyContactId));
}

export async function saveHandRaises(
  responseId: string,
  raises: { type: string; email: string; domainMatch: boolean }[],
) {
  await db().delete(handRaises).where(eq(handRaises.responseId, responseId));
  if (raises.length) {
    await db().insert(handRaises).values(raises.map((r) => ({
      responseId, type: r.type, email: r.email, domainMatch: r.domainMatch,
    })));
  }
}

/** Only an official's own choice creates a panel row (rule 12). */
export async function joinPanel(contactIdFromStudyContact: string, studyId: string) {
  const rows = await db().select({ contactId: studyContacts.contactId }).from(studyContacts)
    .where(eq(studyContacts.id, contactIdFromStudyContact)).limit(1);
  const contactId = rows[0]?.contactId;
  if (!contactId) return;
  await db().insert(panelMembers)
    .values({ contactId, joinedViaStudyId: studyId, status: "active" })
    .onConflictDoNothing();
}

/** Peer values for a metric, from included responses in the same stratum. */
export async function peerAnswers(studyId: string, stratumKey: string, questionIds: string[]) {
  if (questionIds.length === 0) return [];
  const rows = await db().execute<{ response_id: string; question_id: string; value: unknown }>(sql`
    select a.response_id, a.question_id, a.value
    from answers a
    join responses r on r.id = a.response_id
    join study_contacts sc on sc.id = r.study_contact_id
    where sc.study_id = ${studyId}
      and sc.stratum_key = ${stratumKey}
      and r.status = 'complete'
      and r.review_status <> 'excluded'
      and a.question_id in ${sql.raw(`(${questionIds.map((q) => `'${q.replace(/'/g, "''")}'`).join(",")})`)}
  `);
  return rows as unknown as { response_id: string; question_id: string; value: unknown }[];
}

export async function peerAttributes(studyId: string, stratumKey: string) {
  const rows = await db().execute<{ response_id: string; attributes: unknown }>(sql`
    select r.id as response_id, sc.attributes
    from responses r
    join study_contacts sc on sc.id = r.study_contact_id
    where sc.study_id = ${studyId} and sc.stratum_key = ${stratumKey}
      and r.status = 'complete' and r.review_status <> 'excluded'
  `);
  return rows as unknown as { response_id: string; attributes: Record<string, unknown> }[];
}

export { ne };

import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { interviews, interviewTurns } from "@/db/schema";
import type { Turn } from "@/core/interview";

export type InterviewRow = typeof interviews.$inferSelect;

export async function interviewFor(responseId: string, stageId: string): Promise<InterviewRow | null> {
  const rows = await db()
    .select()
    .from(interviews)
    .where(and(eq(interviews.responseId, responseId), eq(interviews.stageId, stageId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function startInterview(responseId: string, stageId: string, model: string | null): Promise<InterviewRow> {
  const existing = await interviewFor(responseId, stageId);
  if (existing) {
    if (existing.status === "invited") {
      const updated = await db()
        .update(interviews)
        .set({ status: "started", startedAt: new Date(), model, updatedAt: new Date() })
        .where(eq(interviews.id, existing.id))
        .returning();
      return updated[0] ?? existing;
    }
    return existing;
  }
  const rows = await db()
    .insert(interviews)
    .values({ responseId, stageId, status: "started", startedAt: new Date(), model })
    .returning();
  return rows[0]!;
}

/** Transcripts live apart from identity, like every other piece of free text (rule 5). */
export async function turnsFor(interviewId: string): Promise<(Turn & { n: number; topicId: string | null; scripted: boolean })[]> {
  const rows = await db()
    .select()
    .from(interviewTurns)
    .where(eq(interviewTurns.interviewId, interviewId))
    .orderBy(asc(interviewTurns.n));

  return rows.map((r) => ({
    n: r.n,
    speaker: r.speaker as Turn["speaker"],
    text: r.text,
    topicId: r.topicId,
    scripted: r.scripted,
  }));
}

export async function addTurn(
  interviewId: string,
  speaker: "interviewer" | "respondent",
  text: string,
  topicId: string | null,
  scripted: boolean,
): Promise<void> {
  const rows = await db()
    .select({ max: sql<number>`coalesce(max(${interviewTurns.n}), -1)::int` })
    .from(interviewTurns)
    .where(eq(interviewTurns.interviewId, interviewId));
  const next = (rows[0]?.max ?? -1) + 1;

  await db()
    .insert(interviewTurns)
    .values({ interviewId, n: next, speaker, text, topicId, scripted })
    .onConflictDoNothing();
}

export async function finishInterview(interviewId: string, status: "completed" | "abandoned"): Promise<void> {
  await db()
    .update(interviews)
    .set({ status, completedAt: new Date(), updatedAt: new Date() })
    .where(eq(interviews.id, interviewId));
}

/** How many people have been invited already, for the stage's cap. */
export async function invitedCount(studyId: string, stageId: string): Promise<number> {
  const rows = await db().execute<{ n: number }>(sql`
    select count(*)::int as n
      from interviews i
      join responses r on r.id = i.response_id
      join study_contacts sc on sc.id = r.study_contact_id
     where sc.study_id = ${studyId} and i.stage_id = ${stageId}
  `);
  return Number((rows as unknown as { n: number }[])[0]?.n ?? 0);
}

export type InterviewSummary = {
  id: string;
  stageId: string;
  status: string;
  startedAt: Date | null;
  completedAt: Date | null;
  stratumKey: string;
  turns: number;
};

/** For the console. No name, no email, no government: a transcript is not a person. */
export async function interviewsFor(studyId: string): Promise<InterviewSummary[]> {
  const rows = await db().execute<Record<string, unknown>>(sql`
    select i.id, i.stage_id, i.status, i.started_at, i.completed_at, sc.stratum_key,
           (select count(*)::int from interview_turns t where t.interview_id = i.id) as turns
      from interviews i
      join responses r on r.id = i.response_id
      join study_contacts sc on sc.id = r.study_contact_id
     where sc.study_id = ${studyId}
     order by i.created_at desc
  `);
  return (rows as unknown as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    stageId: String(r.stage_id),
    status: String(r.status),
    startedAt: r.started_at ? new Date(String(r.started_at)) : null,
    completedAt: r.completed_at ? new Date(String(r.completed_at)) : null,
    stratumKey: String(r.stratum_key),
    turns: Number(r.turns ?? 0),
  }));
}

export async function latestInterviews(studyId: string, limit = 10) {
  const list = await interviewsFor(studyId);
  return list.slice(0, limit);
}

export async function interviewById(id: string): Promise<InterviewRow | null> {
  const rows = await db().select().from(interviews).where(eq(interviews.id, id)).limit(1);
  return rows[0] ?? null;
}

export { desc };

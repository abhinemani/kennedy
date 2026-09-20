import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { followups } from "@/db/schema";

export type FollowupRow = typeof followups.$inferSelect;

/** One follow-up per open question per response. Asking again returns the one already asked. */
export async function followupFor(responseId: string, sourceQuestionId: string): Promise<FollowupRow | null> {
  const rows = await db()
    .select()
    .from(followups)
    .where(and(eq(followups.responseId, responseId), eq(followups.sourceQuestionId, sourceQuestionId)))
    .limit(1);
  return rows[0] ?? null;
}

/** Every generated question is logged, whether the model wrote it or the fallback did. */
export async function recordFollowup(
  responseId: string,
  sourceQuestionId: string,
  generatedQuestion: string,
  model: string | null,
  fallbackUsed: boolean,
): Promise<FollowupRow> {
  const existing = await followupFor(responseId, sourceQuestionId);
  if (existing) return existing;

  const rows = await db()
    .insert(followups)
    .values({ responseId, sourceQuestionId, generatedQuestion, model, fallbackUsed })
    .returning();
  return rows[0]!;
}

export async function saveFollowupAnswer(id: string, answerText: string | null): Promise<void> {
  await db().update(followups).set({ answerText, updatedAt: new Date() }).where(eq(followups.id, id));
}

/** For the console: what was asked, how often the fallback stood in, and what came back. */
export async function followupsFor(studyId: string) {
  const rows = await db().execute<Record<string, unknown>>(sql`
    select f.id, f.source_question_id, f.generated_question, f.answer_text, f.fallback_used,
           f.model, f.created_at, sc.stratum_key
      from followups f
      join responses r on r.id = f.response_id
      join study_contacts sc on sc.id = r.study_contact_id
     where sc.study_id = ${studyId}
     order by f.created_at desc
  `);
  return (rows as unknown as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    sourceQuestionId: String(r.source_question_id),
    generatedQuestion: String(r.generated_question),
    answerText: r.answer_text ? String(r.answer_text) : null,
    fallbackUsed: Boolean(r.fallback_used),
    model: r.model ? String(r.model) : null,
    createdAt: r.created_at ? new Date(String(r.created_at)) : null,
    stratumKey: String(r.stratum_key),
  }));
}

export { desc };

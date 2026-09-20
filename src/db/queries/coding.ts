import { sql } from "drizzle-orm";
import { db } from "@/db/client";

/**
 * Agreement on the double-coded sample.
 *
 * A random share of open answers is coded twice. Agreement is the share of those where both
 * passes landed on the same theme, and it goes in the methods note: a coding scheme nobody
 * has checked is an opinion, not a measurement.
 */
export async function codingAgreement(studyId: string): Promise<{ sampled: number; agreed: number } | null> {
  const rows = await db().execute<{ sampled: number; agreed: number }>(sql`
    with passes as (
      select tc.free_text_id,
             max(case when tc.is_second_pass then tc.theme_id end) as second,
             max(case when not tc.is_second_pass then tc.theme_id end) as first
        from text_codes tc
        join free_text ft on ft.id = tc.free_text_id
        join responses r on r.id = ft.response_id
        join study_contacts sc on sc.id = r.study_contact_id
       where sc.study_id = ${studyId}
       group by tc.free_text_id
    )
    select count(*)::int as sampled,
           count(*) filter (where first = second)::int as agreed
      from passes
     where first is not null and second is not null
  `);
  const row = (rows as unknown as { sampled: number; agreed: number }[])[0];
  if (!row || Number(row.sampled) === 0) return null;
  return { sampled: Number(row.sampled), agreed: Number(row.agreed) };
}

// ---------------------------------------------------------------- the codebook

import { and, eq } from "drizzle-orm";
import { codebookThemes, freeText, textCodes } from "@/db/schema";
import type { Theme } from "@/core/coding";

export async function themesFor(studyId: string) {
  return db().select().from(codebookThemes).where(eq(codebookThemes.studyId, studyId)).orderBy(codebookThemes.code);
}

export async function themeList(studyId: string): Promise<Theme[]> {
  const rows = await themesFor(studyId);
  return rows.map((r) => ({ code: r.code, label: r.label, definition: r.definition ?? undefined }));
}

/** The study file's codebook is the starting point; the operator edits from there. */
export async function seedThemes(studyId: string, themes: Theme[]): Promise<number> {
  const existing = await themesFor(studyId);
  const have = new Set(existing.map((t) => t.code));
  const missing = themes.filter((t) => !have.has(t.code));
  if (missing.length === 0) return 0;

  await db().insert(codebookThemes).values(
    missing.map((t) => ({ studyId, code: t.code, label: t.label, definition: t.definition ?? null })),
  );
  return missing.length;
}

export async function saveTheme(studyId: string, code: string, label: string, definition: string | null) {
  const existing = await db()
    .select()
    .from(codebookThemes)
    .where(and(eq(codebookThemes.studyId, studyId), eq(codebookThemes.code, code)))
    .limit(1);

  if (existing[0]) {
    await db().update(codebookThemes).set({ label, definition, updatedAt: new Date() }).where(eq(codebookThemes.id, existing[0].id));
  } else {
    await db().insert(codebookThemes).values({ studyId, code, label, definition });
  }
}

export async function removeTheme(themeId: string) {
  await db().delete(textCodes).where(eq(textCodes.themeId, themeId));
  await db().delete(codebookThemes).where(eq(codebookThemes.id, themeId));
}

// ---------------------------------------------------------------- codes

export type CodableAnswer = {
  freeTextId: string;
  responseId: string;
  questionId: string;
  text: string;
  stratumKey: string;
  themeId: string | null;
  themeCode: string | null;
  coder: string | null;
  confidence: number | null;
  isDoubleCoded: boolean;
};

/** Written answers with whatever code they already carry, excluded responses left out. */
export async function codableAnswers(studyId: string, limit = 300): Promise<CodableAnswer[]> {
  const rows = await db().execute<Record<string, unknown>>(sql`
    select ft.id as free_text_id, ft.response_id, ft.question_id, ft.text, sc.stratum_key,
           tc.theme_id, t.code as theme_code, tc.coder, tc.confidence,
           exists (
             select 1 from text_codes x where x.free_text_id = ft.id and x.is_second_pass
           ) as double_coded
      from free_text ft
      join responses r on r.id = ft.response_id
      join study_contacts sc on sc.id = r.study_contact_id
      left join text_codes tc on tc.free_text_id = ft.id and not tc.is_second_pass
      left join codebook_themes t on t.id = tc.theme_id
     where sc.study_id = ${studyId} and r.review_status <> 'excluded'
     order by (tc.theme_id is null) desc, ft.created_at
     limit ${limit}
  `);

  return (rows as unknown as Record<string, unknown>[]).map((r) => ({
    freeTextId: String(r.free_text_id),
    responseId: String(r.response_id),
    questionId: String(r.question_id),
    text: String(r.text),
    stratumKey: String(r.stratum_key),
    themeId: r.theme_id ? String(r.theme_id) : null,
    themeCode: r.theme_code ? String(r.theme_code) : null,
    coder: r.coder ? String(r.coder) : null,
    confidence: r.confidence === null || r.confidence === undefined ? null : Number(r.confidence),
    isDoubleCoded: Boolean(r.double_coded),
  }));
}

/** A code the operator confirmed or chose. The coder is recorded, because it matters which. */
export async function setCode(
  freeTextId: string,
  themeId: string,
  coder: "ai" | "human",
  confidence: number | null,
  isSecondPass: boolean,
) {
  await db()
    .delete(textCodes)
    .where(and(eq(textCodes.freeTextId, freeTextId), eq(textCodes.isSecondPass, isSecondPass)));
  await db().insert(textCodes).values({ freeTextId, themeId, coder, confidence, isSecondPass });
}

export async function clearCode(freeTextId: string, isSecondPass: boolean) {
  await db()
    .delete(textCodes)
    .where(and(eq(textCodes.freeTextId, freeTextId), eq(textCodes.isSecondPass, isSecondPass)));
}

export async function freeTextIds(studyId: string): Promise<string[]> {
  const rows = await db().execute<{ id: string }>(sql`
    select ft.id from free_text ft
      join responses r on r.id = ft.response_id
      join study_contacts sc on sc.id = r.study_contact_id
     where sc.study_id = ${studyId} and r.review_status <> 'excluded'
     order by ft.created_at
  `);
  return (rows as unknown as { id: string }[]).map((r) => String(r.id));
}

export async function answerById(freeTextId: string) {
  const rows = await db().select().from(freeText).where(eq(freeText.id, freeTextId)).limit(1);
  return rows[0] ?? null;
}

/** Codes per respondent, for theme counts that count people rather than mentions. */
export async function codesForCounting(studyId: string) {
  const rows = await db().execute<{ response_id: string; code: string }>(sql`
    select ft.response_id, t.code
      from text_codes tc
      join free_text ft on ft.id = tc.free_text_id
      join codebook_themes t on t.id = tc.theme_id
      join responses r on r.id = ft.response_id
      join study_contacts sc on sc.id = r.study_contact_id
     where sc.study_id = ${studyId} and not tc.is_second_pass and r.review_status <> 'excluded'
  `);
  return (rows as unknown as { response_id: string; code: string }[]).map((r) => ({
    responseId: String(r.response_id),
    themeCode: String(r.code),
  }));
}

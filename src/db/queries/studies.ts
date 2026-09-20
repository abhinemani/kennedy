import { createHash } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { studies, studyVersions } from "@/db/schema";
import { parseStudy, type Study } from "@/core/study-schema";

export type StudyRow = typeof studies.$inferSelect;
export type VersionRow = typeof studyVersions.$inferSelect;

export async function listStudies(): Promise<StudyRow[]> {
  return db().select().from(studies).orderBy(desc(studies.createdAt));
}

export async function studyBySlug(slug: string): Promise<StudyRow | null> {
  const rows = await db().select().from(studies).where(eq(studies.slug, slug)).limit(1);
  return rows[0] ?? null;
}

export async function createStudy(text: string): Promise<{ slug: string } | { problem: string }> {
  const parsed = parseStudy(text);
  if (!parsed.ok) return { problem: parsed.problems[0]?.message ?? "The template does not parse." };
  const s = parsed.study;
  if (await studyBySlug(s.slug)) return { problem: `A study with the name "${s.slug}" already exists.` };
  await db().insert(studies).values({
    slug: s.slug, name: s.name, engine: s.engine, features: s.features, draftText: text, status: "draft",
  });
  return { slug: s.slug };
}

export async function saveDraft(slug: string, text: string): Promise<void> {
  await db().update(studies).set({ draftText: text, updatedAt: new Date() }).where(eq(studies.slug, slug));
}

export async function versionsOf(studyId: string): Promise<VersionRow[]> {
  return db().select().from(studyVersions).where(eq(studyVersions.studyId, studyId)).orderBy(desc(studyVersions.version));
}

export async function latestVersion(studyId: string): Promise<VersionRow | null> {
  const rows = await versionsOf(studyId);
  return rows[0] ?? null;
}

export async function versionById(id: string): Promise<VersionRow | null> {
  const rows = await db().select().from(studyVersions).where(eq(studyVersions.id, id)).limit(1);
  return rows[0] ?? null;
}

export function hashOf(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

export type PublishResult =
  | { ok: true; version: number; unchanged: boolean }
  | { ok: false; problem: string };

/** Publishing freezes the text. A published version is never edited (rule 9). */
export async function publish(slug: string): Promise<PublishResult> {
  const study = await studyBySlug(slug);
  if (!study) return { ok: false, problem: "That study no longer exists." };

  const parsed = parseStudy(study.draftText);
  if (!parsed.ok) return { ok: false, problem: "Fix the problems listed beside the file before publishing." };

  const hash = hashOf(study.draftText);
  const previous = await latestVersion(study.id);
  if (previous?.contentHash === hash) {
    return { ok: true, version: previous.version, unchanged: true };
  }

  const version = (previous?.version ?? 0) + 1;
  await db().insert(studyVersions).values({
    studyId: study.id, version, sourceText: study.draftText, content: parsed.study, contentHash: hash,
  });
  await db().update(studies)
    .set({ name: parsed.study.name, engine: parsed.study.engine, features: parsed.study.features, updatedAt: new Date() })
    .where(eq(studies.id, study.id));
  return { ok: true, version, unchanged: false };
}

export async function setStatus(slug: string, status: StudyRow["status"]): Promise<void> {
  await db().update(studies).set({ status, updatedAt: new Date() }).where(eq(studies.slug, slug));
}

export function studyOf(version: VersionRow): Study {
  return version.content as Study;
}

export async function responseCounts(studyId: string): Promise<{ started: number; complete: number }> {
  const rows = await db().execute<{ started: number; complete: number }>(sql`
    select
      count(*)::int as started,
      count(*) filter (where r.status = 'complete')::int as complete
    from responses r
    join study_contacts sc on sc.id = r.study_contact_id
    where sc.study_id = ${studyId}
  `);
  const row = rows[0];
  return { started: Number(row?.started ?? 0), complete: Number(row?.complete ?? 0) };
}

export async function studyAndVersion(slug: string) {
  const study = await studyBySlug(slug);
  if (!study) return null;
  const version = await latestVersion(study.id);
  return { study, version };
}

export async function isPublished(studyId: string): Promise<boolean> {
  const rows = await db().select({ n: sql<number>`count(*)::int` }).from(studyVersions).where(eq(studyVersions.studyId, studyId));
  return (rows[0]?.n ?? 0) > 0;
}

export { and, eq };

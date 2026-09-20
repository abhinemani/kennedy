import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { responses } from "@/db/schema";
import type { AnalysisResponse, Funnel } from "@/core/analysis";

/** Every response in a study, with the answers and the attributes the analysis needs. */
export async function analysisRows(studyId: string): Promise<AnalysisResponse[]> {
  const rows = await db().execute<Record<string, unknown>>(sql`
    select
      r.id as response_id,
      c.entity_id,
      c.role::text as role,
      sc.stratum_key,
      r.completed_at,
      r.review_status::text as review_status,
      r.exclusion_reason,
      r.quality_flags,
      sc.attributes,
      coalesce(
        (select jsonb_object_agg(a.question_id, a.value)
           from answers a
          where a.response_id = r.id and a.question_id not like '\\_\\_%'),
        '{}'::jsonb
      ) as answers
    from responses r
    join study_contacts sc on sc.id = r.study_contact_id
    join contacts c on c.id = sc.contact_id
    where sc.study_id = ${studyId} and r.status = 'complete'
  `);

  return (rows as unknown as Record<string, unknown>[]).map((r) => ({
    responseId: String(r.response_id),
    entityId: String(r.entity_id),
    role: String(r.role),
    stratumKey: String(r.stratum_key),
    completedAt: r.completed_at ? new Date(String(r.completed_at)) : new Date(0),
    reviewStatus: String(r.review_status) as AnalysisResponse["reviewStatus"],
    exclusionReason: r.exclusion_reason ? String(r.exclusion_reason) : null,
    answers: (r.answers ?? {}) as Record<string, unknown>,
    attributes: (r.attributes ?? {}) as Record<string, unknown>,
  }));
}

export async function funnel(studyId: string): Promise<Funnel> {
  const rows = await db().execute<Record<string, unknown>>(sql`
    select
      (select count(*) from study_contacts where study_id = ${studyId}) as drawn,
      (select count(distinct m.study_contact_id) from messages m
         join study_contacts sc on sc.id = m.study_contact_id
        where sc.study_id = ${studyId}) as emailed,
      (select count(distinct e.study_contact_id) from link_events e
         join study_contacts sc on sc.id = e.study_contact_id
        where sc.study_id = ${studyId} and e.type = 'loaded') as loaded,
      (select count(distinct e.study_contact_id) from link_events e
         join study_contacts sc on sc.id = e.study_contact_id
        where sc.study_id = ${studyId} and e.type = 'started') as started,
      (select count(*) from responses r
         join study_contacts sc on sc.id = r.study_contact_id
        where sc.study_id = ${studyId} and r.status = 'complete') as completed,
      (select count(*) from responses r
         join study_contacts sc on sc.id = r.study_contact_id
        where sc.study_id = ${studyId} and r.status = 'complete'
          and r.review_status <> 'excluded') as included
  `);
  const r = (rows as unknown as Record<string, unknown>[])[0] ?? {};
  const num = (k: string) => Number(r[k] ?? 0);
  return {
    drawn: num("drawn"),
    emailed: num("emailed"),
    loaded: num("loaded"),
    started: num("started"),
    completed: num("completed"),
    included: num("included"),
  };
}

/** How many governments of each band exist in the registry: the denominator for weighting. */
export async function frameByBand(bands: { key: string; max: number | null }[]): Promise<Record<string, number>> {
  const rows = await db().execute<{ population: number | null; n: number }>(sql`
    select population, count(*)::int as n from entities group by population
  `);
  const out: Record<string, number> = {};
  for (const b of bands) out[b.key] = 0;

  for (const row of rows as unknown as { population: number | null; n: number }[]) {
    const population = row.population === null ? null : Number(row.population);
    if (population === null) continue;
    const band = bands.find((b) => b.max === null || population <= b.max);
    if (band) out[band.key] = (out[band.key] ?? 0) + Number(row.n);
  }
  return out;
}

export type ReviewRow = {
  responseId: string;
  entityName: string;
  state: string;
  role: string;
  stratumKey: string;
  completedAt: Date | null;
  durationSeconds: number | null;
  qualityFlags: string[];
  reviewStatus: "pending" | "included" | "excluded";
  exclusionReason: string | null;
};

/** Flagged first, because that is what the operator came here to look at. */
export async function reviewQueue(studyId: string, limit = 200): Promise<ReviewRow[]> {
  const rows = await db().execute<Record<string, unknown>>(sql`
    select r.id, e.name as entity_name, e.state, c.role::text as role, sc.stratum_key,
           r.completed_at, r.duration_seconds, r.quality_flags,
           r.review_status::text as review_status, r.exclusion_reason
      from responses r
      join study_contacts sc on sc.id = r.study_contact_id
      join contacts c on c.id = sc.contact_id
      join entities e on e.id = c.entity_id
     where sc.study_id = ${studyId} and r.status = 'complete'
     order by jsonb_array_length(coalesce(r.quality_flags, '[]'::jsonb)) desc, r.completed_at desc
     limit ${limit}
  `);

  return (rows as unknown as Record<string, unknown>[]).map((r) => ({
    responseId: String(r.id),
    entityName: String(r.entity_name),
    state: String(r.state),
    role: String(r.role),
    stratumKey: String(r.stratum_key),
    completedAt: r.completed_at ? new Date(String(r.completed_at)) : null,
    durationSeconds: r.duration_seconds === null ? null : Number(r.duration_seconds),
    qualityFlags: Array.isArray(r.quality_flags) ? (r.quality_flags as string[]) : [],
    reviewStatus: String(r.review_status) as ReviewRow["reviewStatus"],
    exclusionReason: r.exclusion_reason ? String(r.exclusion_reason) : null,
  }));
}

export async function setReview(
  responseId: string,
  status: "pending" | "included" | "excluded",
  reason: string | null,
): Promise<void> {
  await db()
    .update(responses)
    .set({ reviewStatus: status, exclusionReason: status === "excluded" ? reason : null, updatedAt: new Date() })
    .where(eq(responses.id, responseId));
}

export async function fieldingDates(studyId: string): Promise<{ from: Date | null; to: Date | null }> {
  const rows = await db().execute<{ from: string | null; to: string | null }>(sql`
    select min(m.sent_at) as from, max(r.completed_at) as to
      from study_contacts sc
      left join messages m on m.study_contact_id = sc.id
      left join responses r on r.study_contact_id = sc.id and r.status = 'complete'
     where sc.study_id = ${studyId}
  `);
  const r = (rows as unknown as { from: string | null; to: string | null }[])[0];
  return { from: r?.from ? new Date(r.from) : null, to: r?.to ? new Date(r.to) : null };
}

/** Free text, joined to nothing that identifies anyone. */
export async function freeTextRows(studyId: string) {
  const rows = await db().execute<Record<string, unknown>>(sql`
    select ft.id, ft.response_id, ft.question_id, ft.text, sc.stratum_key, r.review_status::text as review_status
      from free_text ft
      join responses r on r.id = ft.response_id
      join study_contacts sc on sc.id = r.study_contact_id
     where sc.study_id = ${studyId}
     order by ft.created_at
  `);
  return (rows as unknown as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    responseId: String(r.response_id),
    questionId: String(r.question_id),
    text: String(r.text),
    stratumKey: String(r.stratum_key),
    reviewStatus: String(r.review_status),
  }));
}

export async function handRaiseRows(studyId: string) {
  const rows = await db().execute<Record<string, unknown>>(sql`
    select h.type, h.email, h.domain_match, h.verified_at, h.created_at,
           e.name as entity_name, e.state, c.role::text as role, c.full_name
      from hand_raises h
      join responses r on r.id = h.response_id
      join study_contacts sc on sc.id = r.study_contact_id
      join contacts c on c.id = sc.contact_id
      join entities e on e.id = c.entity_id
     where sc.study_id = ${studyId}
     order by h.created_at desc
  `);
  return (rows as unknown as Record<string, unknown>[]).map((r) => ({
    type: String(r.type),
    email: String(r.email),
    domainMatch: Boolean(r.domain_match),
    verifiedAt: r.verified_at ? new Date(String(r.verified_at)) : null,
    createdAt: r.created_at ? new Date(String(r.created_at)) : null,
    entityName: String(r.entity_name),
    state: String(r.state),
    role: String(r.role),
    fullName: r.full_name ? String(r.full_name) : null,
  }));
}

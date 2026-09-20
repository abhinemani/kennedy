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

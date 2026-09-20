import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { studyContacts } from "@/db/schema";
import { drawSample, type Candidate, type DrawResult } from "@/core/draw";
import { bandOf } from "@/core/lists";
import type { Study } from "@/core/study-schema";
import { mintToken } from "@/core/tokens";
import { audienceContacts } from "./contacts";

export type SamplePlan = DrawResult & { candidates: number };

function bands(study: Study) {
  return study.sample.strata.bands.map((b) => ({ key: b.key, label: b.label, max: b.max }));
}

/**
 * Work out the draw without writing anything, so the Sample screen can show the operator
 * every count and every skip reason before they commit to it.
 */
export async function planSample(study: Study, allowedLicenseScopes: string[], now = new Date()): Promise<SamplePlan> {
  const rows = await audienceContacts();
  const frame = study.sample.frame;
  const bandList = bands(study);

  const candidates: Candidate[] = rows
    .filter((r) => frame.entity_types.includes(r.entityType))
    .filter((r) => (frame.min_population === undefined ? true : (r.population ?? 0) >= frame.min_population))
    .map((r) => ({
      contactId: r.id,
      stratumKey: bandOf(r.population, bandList) ?? "unbanded",
      role: r.role,
      suppressed: r.suppressed,
      emailStatus: r.emailStatus,
      licenseScope: r.licenseScope,
      lastContactedAt: r.lastContactedAt,
    }));

  const targets: Record<string, number> = {};
  for (const band of study.sample.strata.bands) targets[band.key] = band.target;

  const result = drawSample({
    candidates,
    targets,
    eligibleRoles: [...frame.roles],
    primaryRoles: study.sample.primary_roles ? [...study.sample.primary_roles] : undefined,
    allowedLicenseScopes,
    historyWindowDays: study.sample.contact_history_window_days,
    pilotSize: study.sample.pilot_size,
    seed: study.sample.seed,
    now,
  });

  return { ...result, candidates: candidates.length };
}

export type DrawOutcome = { minted: number; alreadyDrawn: number };

/**
 * Write the plan down: one row per chosen contact, each with its own token and a snapshot of
 * the attributes as they were at draw time. Drawing twice never re-mints a token for someone
 * already in the study.
 */
export async function commitSample(studyId: string, study: Study, plan: SamplePlan): Promise<DrawOutcome> {
  const existing = await db()
    .select({ contactId: studyContacts.contactId })
    .from(studyContacts)
    .where(eq(studyContacts.studyId, studyId));
  const have = new Set(existing.map((e) => e.contactId));

  const attributes = await attributesFor(plan.picked.map((p) => p.contactId), study);

  let minted = 0;
  const fresh = plan.picked.filter((p) => !have.has(p.contactId));

  for (let i = 0; i < fresh.length; i += 200) {
    const chunk = fresh.slice(i, i + 200);
    if (chunk.length === 0) continue;
    await db().insert(studyContacts).values(
      chunk.map((p) => ({
        studyId,
        contactId: p.contactId,
        stratumKey: p.stratumKey,
        token: mintToken(),
        isPilot: p.isPilot,
        attributes: attributes.get(p.contactId) ?? {},
      })),
    ).onConflictDoNothing();
    minted += chunk.length;
  }

  return { minted, alreadyDrawn: have.size };
}

async function attributesFor(contactIds: string[], study: Study) {
  const out = new Map<string, Record<string, string | number | null>>();
  if (contactIds.length === 0) return out;

  const bandList = bands(study);
  for (let i = 0; i < contactIds.length; i += 500) {
    const chunk = contactIds.slice(i, i + 500);
    const rows = await db().execute<Record<string, unknown>>(sql`
      select c.id, c.role::text as role, e.state, e.type::text as entity_type,
             e.population, e.email_domain
      from contacts c join entities e on e.id = c.entity_id
      where c.id in ${sql.raw(`(${chunk.map((id) => `'${id}'`).join(",")})`)}
    `);
    for (const r of rows as unknown as Record<string, unknown>[]) {
      const population = r.population === null ? null : Number(r.population);
      out.set(String(r.id), {
        role: String(r.role),
        state: String(r.state),
        entity_type: String(r.entity_type),
        population,
        population_band: bandOf(population, bandList),
        email_domain: r.email_domain ? String(r.email_domain) : null,
      });
    }
  }
  return out;
}

export async function drawnSummary(studyId: string) {
  const rows = await db().execute<{ stratum_key: string; n: number; pilots: number }>(sql`
    select stratum_key, count(*)::int as n, count(*) filter (where is_pilot)::int as pilots
    from study_contacts where study_id = ${studyId}
    group by stratum_key order by stratum_key
  `);
  return (rows as unknown as Record<string, unknown>[]).map((r) => ({
    stratumKey: String(r.stratum_key),
    n: Number(r.n),
    pilots: Number(r.pilots),
  }));
}

import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  contactListMembers, contactLists, contacts, entities, importRows, mappingProfiles,
  panelMembers, studyContacts, suppressions,
} from "@/db/schema";
import { normalizeEmail, normalizeName, normalizeState, normalizeType, resolveEntity, type RegistryEntity } from "@/core/resolve";
import { isRole, type RoleKey } from "@/core/lists";
import type { Row } from "@/core/csv";

export type EntityRow = typeof entities.$inferSelect;

// ---------------------------------------------------------------- the registry

export type RegistryUpload = { added: number; updated: number; skipped: { line: number; reason: string }[] };

const ENTITY_TYPES = ["city", "county", "township", "special_district", "school_district", "state_agency"] as const;
type EntityType = (typeof ENTITY_TYPES)[number];

export async function loadRegistry(rows: Row[]): Promise<RegistryUpload> {
  const skipped: { line: number; reason: string }[] = [];
  let added = 0;
  let updated = 0;

  const existing = await db().select().from(entities);
  const byGeoid = new Map(existing.filter((e) => e.geoid).map((e) => [e.geoid!, e]));
  const byKey = new Map(existing.map((e) => [entityKey(e.state, e.type, e.name), e]));

  for (const [index, row] of rows.entries()) {
    const line = index + 2;
    const name = (row.name ?? "").trim();
    const state = normalizeState(row.state ?? "");
    const type = normalizeType(row.type ?? "") as EntityType | null;

    if (!name) { skipped.push({ line, reason: "No name." }); continue; }
    if (state.length !== 2) { skipped.push({ line, reason: "No state." }); continue; }
    if (!type) { skipped.push({ line, reason: `Government type "${row.type ?? ""}" is not one we know.` }); continue; }

    const population = toInt(row.population);
    const annualBudget = toInt(row.annual_budget);
    const geoid = (row.geoid ?? "").trim() || null;
    const emailDomain = (row.email_domain ?? "").trim().toLowerCase() || null;

    const found = (geoid ? byGeoid.get(geoid) : undefined) ?? byKey.get(entityKey(state, type, name));

    if (found) {
      await db().update(entities)
        .set({ name, state, type, population, annualBudget, emailDomain, geoid: geoid ?? found.geoid, updatedAt: new Date() })
        .where(eq(entities.id, found.id));
      updated += 1;
    } else {
      const inserted = await db().insert(entities)
        .values({ geoid, name, state, type, population, annualBudget, emailDomain, source: "registry_upload" })
        .returning();
      const row0 = inserted[0];
      if (row0) {
        if (geoid) byGeoid.set(geoid, row0);
        byKey.set(entityKey(state, type, name), row0);
      }
      added += 1;
    }
  }

  return { added, updated, skipped };
}

const entityKey = (state: string, type: string, name: string) =>
  `${normalizeState(state)}|${type}|${normalizeName(name)}`;

function toInt(value: string | undefined): number | null {
  if (!value) return null;
  const n = Number(value.replace(/[,$\s]/g, ""));
  return Number.isFinite(n) ? Math.round(n) : null;
}

export async function countEntities(): Promise<number> {
  const rows = await db().select({ n: sql<number>`count(*)::int` }).from(entities);
  return rows[0]?.n ?? 0;
}

export async function registrySample(limit = 10): Promise<EntityRow[]> {
  return db().select().from(entities).orderBy(desc(entities.createdAt)).limit(limit);
}

export async function searchRegistry(query: string, limit = 20): Promise<EntityRow[]> {
  const like = `%${query.trim().toLowerCase()}%`;
  return db().select().from(entities)
    .where(sql`lower(${entities.name}) like ${like} or lower(${entities.state}) = ${query.trim().toLowerCase()}`)
    .limit(limit);
}

// ---------------------------------------------------------------- importing contacts

export type StagedCounts = { total: number; ready: number; duplicate: number; unresolved: number; ambiguous: number };

export type StagedRow = {
  id: string;
  raw: Record<string, string>;
  problem: string;
  resolvedEntityId: string | null;
};

const PENDING = "pending";

export async function stageImport(batch: string, mapped: Row[]): Promise<void> {
  if (mapped.length === 0) return;
  const chunkSize = 500;
  for (let i = 0; i < mapped.length; i += chunkSize) {
    await db().insert(importRows).values(
      mapped.slice(i, i + chunkSize).map((raw) => ({ batch, raw, problem: PENDING })),
    );
  }
}

export async function stagedRows(batch: string): Promise<StagedRow[]> {
  const rows = await db().select().from(importRows).where(eq(importRows.batch, batch));
  return rows.map((r) => ({
    id: r.id,
    raw: (r.raw ?? {}) as Record<string, string>,
    problem: r.problem,
    resolvedEntityId: r.resolvedEntityId,
  }));
}

export type Judged = StagedRow & { verdict: "ready" | "duplicate" | "unresolved" | "ambiguous"; note: string };

/** Work out what would happen to each staged row, without changing anything. */
export async function judgeBatch(batch: string): Promise<{ rows: Judged[]; counts: StagedCounts }> {
  const staged = await stagedRows(batch);
  const registry = await db().select().from(entities);
  const slim: RegistryEntity[] = registry.map((e) => ({
    id: e.id, name: e.name, state: e.state, type: e.type, population: e.population,
  }));

  const emails = staged.map((s) => normalizeEmail(s.raw.email ?? "")).filter(Boolean);
  const existing = emails.length
    ? await db().select({ email: contacts.email }).from(contacts).where(inArray(contacts.email, emails))
    : [];
  const taken = new Set(existing.map((e) => e.email));
  const seenInFile = new Set<string>();

  const rows: Judged[] = staged.map((s) => {
    const email = normalizeEmail(s.raw.email ?? "");
    if (!email) return { ...s, verdict: "unresolved", note: "No email address in this row." };

    if (taken.has(email) || seenInFile.has(email)) {
      return { ...s, verdict: "duplicate", note: "Already on file; this row will be skipped." };
    }
    seenInFile.add(email);

    if (s.resolvedEntityId) {
      return { ...s, verdict: "ready", note: "Matched by hand." };
    }

    const resolution = resolveEntity(
      { geoid: s.raw.geoid, entityName: s.raw.entity_name ?? "", state: s.raw.state ?? "", type: s.raw.entity_type },
      slim,
    );
    if (resolution.kind === "matched") return { ...s, verdict: "ready", note: `Matched ${resolution.entity.name}.` };
    if (resolution.kind === "ambiguous") {
      return { ...s, verdict: "ambiguous", note: `${resolution.candidates.length} governments fit that name.` };
    }
    return { ...s, verdict: "unresolved", note: resolution.reason };
  });

  const counts: StagedCounts = {
    total: rows.length,
    ready: rows.filter((r) => r.verdict === "ready").length,
    duplicate: rows.filter((r) => r.verdict === "duplicate").length,
    unresolved: rows.filter((r) => r.verdict === "unresolved").length,
    ambiguous: rows.filter((r) => r.verdict === "ambiguous").length,
  };
  return { rows, counts };
}

export type ImportResult = { listId: string; imported: number; duplicates: number; needsReview: number };

/** Promote what resolved into contacts; leave the rest in the review queue. */
export async function commitBatch(
  batch: string,
  listName: string,
  source: string,
  licenseScope: string,
): Promise<ImportResult> {
  const { rows } = await judgeBatch(batch);
  const registry = await db().select().from(entities);
  const slim: RegistryEntity[] = registry.map((e) => ({
    id: e.id, name: e.name, state: e.state, type: e.type, population: e.population,
  }));

  const list = (
    await db().insert(contactLists).values({ name: listName, source, licenseScope, rowCount: 0 }).returning()
  )[0]!;

  let imported = 0;
  for (const row of rows.filter((r) => r.verdict === "ready")) {
    const entityId =
      row.resolvedEntityId ??
      (() => {
        const r = resolveEntity(
          { geoid: row.raw.geoid, entityName: row.raw.entity_name ?? "", state: row.raw.state ?? "", type: row.raw.entity_type },
          slim,
        );
        return r.kind === "matched" ? r.entity.id : null;
      })();
    if (!entityId) continue;

    const role = (row.raw.role ?? "").trim();
    const inserted = await db().insert(contacts)
      .values({
        entityId,
        fullName: row.raw.full_name || null,
        title: row.raw.title || null,
        role: (isRole(role) ? role : "other") as RoleKey,
        email: normalizeEmail(row.raw.email ?? ""),
        phone: row.raw.phone || null,
        source,
        sourceRef: batch,
        licenseScope,
      })
      .onConflictDoNothing()
      .returning();

    const contact = inserted[0];
    if (contact) {
      await db().insert(contactListMembers).values({ listId: list.id, contactId: contact.id }).onConflictDoNothing();
      imported += 1;
    }
  }

  await db().update(contactLists).set({ rowCount: imported, updatedAt: new Date() }).where(eq(contactLists.id, list.id));

  // Rows that could not be placed stay for the review queue, under their own reason.
  for (const row of rows.filter((r) => r.verdict === "unresolved" || r.verdict === "ambiguous")) {
    await db().update(importRows).set({ problem: row.note, updatedAt: new Date() }).where(eq(importRows.id, row.id));
  }
  await db().delete(importRows).where(
    and(eq(importRows.batch, batch), inArray(importRows.id, rows.filter((r) => r.verdict === "ready" || r.verdict === "duplicate").map((r) => r.id))),
  );

  return {
    listId: list.id,
    imported,
    duplicates: rows.filter((r) => r.verdict === "duplicate").length,
    needsReview: rows.filter((r) => r.verdict === "unresolved" || r.verdict === "ambiguous").length,
  };
}

export async function discardBatch(batch: string): Promise<{ removed: number }> {
  const removed = await db()
    .delete(importRows)
    .where(and(eq(importRows.batch, batch), eq(importRows.problem, PENDING)))
    .returning({ id: importRows.id });
  return { removed: removed.length };
}

/**
 * Staged rows hold names and email addresses for people who were never imported. A preview
 * the operator simply walked away from must not keep them, so anything still pending after a
 * day is swept whenever the Import screen is opened.
 */
export async function sweepAbandonedImports(olderThanHours = 24): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanHours * 3_600_000);
  const removed = await db()
    .delete(importRows)
    .where(and(eq(importRows.problem, PENDING), lt(importRows.createdAt, cutoff)))
    .returning({ id: importRows.id });
  return removed.length;
}

// ---------------------------------------------------------------- the review queue

export async function needsReview(limit = 100): Promise<StagedRow[]> {
  const rows = await db().select().from(importRows).where(sql`${importRows.problem} <> ${PENDING}`).limit(limit);
  return rows.map((r) => ({
    id: r.id, raw: (r.raw ?? {}) as Record<string, string>, problem: r.problem, resolvedEntityId: r.resolvedEntityId,
  }));
}

export async function needsReviewCount(): Promise<number> {
  const rows = await db().select({ n: sql<number>`count(*)::int` }).from(importRows).where(sql`${importRows.problem} <> ${PENDING}`);
  return rows[0]?.n ?? 0;
}

export async function matchReviewRow(rowId: string, entityId: string, source: string, licenseScope: string): Promise<boolean> {
  const rows = await db().select().from(importRows).where(eq(importRows.id, rowId)).limit(1);
  const row = rows[0];
  if (!row) return false;

  const raw = (row.raw ?? {}) as Record<string, string>;
  const email = normalizeEmail(raw.email ?? "");
  if (!email) return false;

  const role = (raw.role ?? "").trim();
  const inserted = await db().insert(contacts)
    .values({
      entityId,
      fullName: raw.full_name || null,
      title: raw.title || null,
      role: (isRole(role) ? role : "other") as RoleKey,
      email,
      phone: raw.phone || null,
      source,
      sourceRef: row.batch,
      licenseScope,
    })
    .onConflictDoNothing()
    .returning();

  await db().delete(importRows).where(eq(importRows.id, rowId));
  return inserted.length > 0;
}

export async function skipReviewRow(rowId: string): Promise<void> {
  await db().delete(importRows).where(eq(importRows.id, rowId));
}

// ---------------------------------------------------------------- lists and the audience

export type ListRow = typeof contactLists.$inferSelect;

export async function allLists(): Promise<ListRow[]> {
  return db().select().from(contactLists).orderBy(desc(contactLists.createdAt));
}

export type AudienceContactRow = {
  id: string;
  role: string;
  state: string;
  entityType: string;
  population: number | null;
  licenseScope: string;
  source: string;
  lastContactedAt: Date | null;
  suppressed: boolean;
  emailStatus: string;
};

/** Every contact with the attributes the audience screen and the draw both need. */
export async function audienceContacts(): Promise<AudienceContactRow[]> {
  const rows = await db().execute<{
    id: string; role: string; state: string; entity_type: string; population: number | null;
    license_scope: string; source: string; last_contacted_at: string | null; suppressed: boolean; email_status: string;
  }>(sql`
    select
      c.id,
      c.role::text as role,
      e.state,
      e.type::text as entity_type,
      e.population,
      c.license_scope,
      c.source,
      c.email_status::text as email_status,
      (select max(m.created_at) from messages m
         join study_contacts sc on sc.id = m.study_contact_id
        where sc.contact_id = c.id) as last_contacted_at,
      exists (select 1 from suppressions s where s.email = c.email) as suppressed
    from contacts c
    join entities e on e.id = c.entity_id
  `);

  return (rows as unknown as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    role: String(r.role),
    state: String(r.state),
    entityType: String(r.entity_type),
    population: r.population === null ? null : Number(r.population),
    licenseScope: String(r.license_scope),
    source: String(r.source ?? "upload"),
    emailStatus: String(r.email_status),
    suppressed: Boolean(r.suppressed),
    lastContactedAt: r.last_contacted_at ? new Date(String(r.last_contacted_at)) : null,
  }));
}

export async function panelMemberRows() {
  return db()
    .select({
      id: panelMembers.id,
      status: panelMembers.status,
      joinedAt: panelMembers.createdAt,
      entityName: entities.name,
      state: entities.state,
      role: contacts.role,
    })
    .from(panelMembers)
    .innerJoin(contacts, eq(contacts.id, panelMembers.contactId))
    .leftJoin(entities, eq(entities.id, contacts.entityId))
    .orderBy(desc(panelMembers.createdAt));
}

export async function suppressionCount(): Promise<number> {
  const rows = await db().select({ n: sql<number>`count(*)::int` }).from(suppressions);
  return rows[0]?.n ?? 0;
}

export async function alreadyDrawn(studyId: string): Promise<number> {
  const rows = await db().select({ n: sql<number>`count(*)::int` }).from(studyContacts).where(eq(studyContacts.studyId, studyId));
  return rows[0]?.n ?? 0;
}

// ---------------------------------------------------------------- mapping profiles

export async function profiles() {
  return db().select().from(mappingProfiles).orderBy(mappingProfiles.name);
}

export async function saveProfile(name: string, columns: Record<string, string>) {
  await db().insert(mappingProfiles)
    .values({ name, columns })
    .onConflictDoUpdate({ target: mappingProfiles.name, set: { columns, updatedAt: new Date() } });
}

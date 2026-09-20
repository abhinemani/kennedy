import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { contacts, entities, studyContacts } from "@/db/schema";
import { mintToken } from "@/core/tokens";
import { bandOf } from "@/core/lists";
import type { Study } from "@/core/study-schema";

// A rehearsal link, so the operator can walk the whole survey on a phone before anyone real
// is asked. The government it points at is obviously fake and says so in its own name, so a
// rehearsal can never be mistaken for a response from a real place.
const FAKE_ENTITY_NAME = "Test City (not a real government)";

export async function createTestLink(study: Study, studyId: string): Promise<string> {
  const existing = await db().select().from(entities).where(eq(entities.name, FAKE_ENTITY_NAME)).limit(1);
  const entity =
    existing[0] ??
    (
      await db()
        .insert(entities)
        .values({
          name: FAKE_ENTITY_NAME,
          state: "ZZ",
          type: "city",
          population: 42_000,
          emailDomain: "example.org",
          source: "rehearsal",
        })
        .returning()
    )[0]!;

  const email = `rehearsal+${Date.now()}@example.org`;
  const contact = (
    await db()
      .insert(contacts)
      .values({
        entityId: entity.id,
        fullName: "Test Person",
        title: "Rehearsal",
        role: study.sample.frame.roles[0] ?? "clerk",
        email,
        source: "rehearsal",
        licenseScope: "owner_only",
        emailStatus: "unverified",
      })
      .returning()
  )[0]!;

  const bands = study.sample.strata.bands.map((b) => ({ key: b.key, label: b.label, max: b.max }));
  const band = bandOf(entity.population, bands) ?? bands[0]?.key ?? "all";
  const token = mintToken();

  await db().insert(studyContacts).values({
    studyId,
    contactId: contact.id,
    stratumKey: band,
    token,
    isPilot: true,
    attributes: {
      role: contact.role,
      state: entity.state,
      population: entity.population,
      population_band: band,
      entity_type: entity.type,
      email_domain: entity.emailDomain,
    },
  });

  return token;
}

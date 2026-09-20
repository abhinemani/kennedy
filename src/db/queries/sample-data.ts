import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  answers, benchmarkSeeds, contactListMembers, contactLists, contacts, entities, followups, freeText, handRaises,
  importRows, interviews, interviewTurns, linkEvents, messages, panelMembers, responses, studyContacts, textCodes,
} from "@/db/schema";
import {
  buildSampleData, SAMPLE_EMAIL_SUFFIX, SAMPLE_IMPORT_BATCH, SAMPLE_PROFILE_NAME, SAMPLE_SETTINGS, SAMPLE_SOURCE,
  SAMPLE_STUDY_SLUG, sampleStudyText,
} from "@/core/sample-data";
import { parseStudy } from "@/core/study-schema";
import { mintToken } from "@/core/tokens";
import { readSettings, writeSettings } from "@/lib/settings";
import { createStudy, latestVersion, publish, setStatus, studyBySlug } from "./studies";
import { saveProfile } from "./contacts";
import { suppressEmail } from "./suppression";
import { seedThemes, themesFor } from "./coding";
import { saveSeed } from "@/lib/benchmark-data";

// Loading and removing the sample dataset. Everything written here carries a mark the removal
// finds it by: the study's slug, the "sample_data" source on entities, contacts and lists, the
// ".sample.example" email suffix, the import batch name, and the mapping profile's name.

export type SampleCounts = { governments: number; contacts: number; responses: number; messages: number; interviews: number };

export type SampleStatus = { loaded: boolean; counts: SampleCounts };

export async function sampleDataStatus(): Promise<SampleStatus> {
  const study = await studyBySlug(SAMPLE_STUDY_SLUG);
  const rows = await db().execute<Record<string, unknown>>(sql`
    select
      (select count(*) from entities where source = ${SAMPLE_SOURCE}) as governments,
      (select count(*) from contacts where source = ${SAMPLE_SOURCE}) as contacts,
      (select count(*) from responses r join study_contacts sc on sc.id = r.study_contact_id
        where sc.study_id = ${study?.id ?? null}::uuid) as responses,
      (select count(*) from messages m join study_contacts sc on sc.id = m.study_contact_id
        where sc.study_id = ${study?.id ?? null}::uuid) as messages,
      (select count(*) from interviews i join responses r on r.id = i.response_id
        join study_contacts sc on sc.id = r.study_contact_id
        where sc.study_id = ${study?.id ?? null}::uuid) as interviews
  `);
  const r = (rows as unknown as Record<string, unknown>[])[0] ?? {};
  const n = (k: string) => Number(r[k] ?? 0);
  const counts = { governments: n("governments"), contacts: n("contacts"), responses: n("responses"), messages: n("messages"), interviews: n("interviews") };
  return { loaded: study !== null || counts.governments > 0 || counts.contacts > 0, counts };
}

const daysAgo = (days: number, hourOffset = 0) => new Date(Date.now() - days * 86_400_000 + hourOffset * 3_600_000);

export type LoadResult = { ok: true; counts: SampleCounts } | { ok: false; problem: string };

/** Writes the whole sample dataset. Refuses to run twice, so nothing is ever doubled. */
export async function loadSampleData(templateText: string): Promise<LoadResult> {
  const status = await sampleDataStatus();
  if (status.loaded) return { ok: false, problem: "Sample data is already loaded. Remove it first if you want a fresh copy." };

  // Settings: fill whatever is still blank, and only that, so a real address is never overwritten.
  const current = await readSettings();
  await writeSettings({
    ...current,
    linkDomain: current.linkDomain ?? SAMPLE_SETTINGS.linkDomain,
    postalAddress: current.postalAddress ?? SAMPLE_SETTINGS.postalAddress,
    replyTo: current.replyTo ?? SAMPLE_SETTINGS.replyTo,
  });

  // The study: the worked example, filled in, published, and fielding.
  const text = sampleStudyText(templateText);
  const created = await createStudy(text);
  if ("problem" in created) return { ok: false, problem: `The sample study could not be created: ${created.problem}` };
  const published = await publish(created.slug);
  if (!published.ok) return { ok: false, problem: `The sample study could not be published: ${published.problem}` };
  await setStatus(created.slug, "fielding");

  const studyRow = await studyBySlug(created.slug);
  const version = studyRow ? await latestVersion(studyRow.id) : null;
  if (!studyRow || !version) return { ok: false, problem: "The sample study was created but could not be read back." };
  const parsed = parseStudy(text);
  if (!parsed.ok) return { ok: false, problem: "The sample study file does not parse." };
  const study = parsed.study;
  const data = buildSampleData(study);

  // Governments and people.
  const entityIds = new Map<string, string>();
  for (let i = 0; i < data.entities.length; i += 200) {
    const chunk = data.entities.slice(i, i + 200);
    const inserted = await db().insert(entities).values(chunk.map((e) => ({
      geoid: e.geoid, name: e.name, state: e.state, type: e.type, population: e.population,
      annualBudget: e.annualBudget, county: e.county, emailDomain: e.emailDomain, source: SAMPLE_SOURCE,
    }))).returning({ id: entities.id, geoid: entities.geoid });
    for (const row of inserted) {
      const e = chunk.find((x) => x.geoid === row.geoid);
      if (e) entityIds.set(e.key, row.id);
    }
  }

  const contactIds = new Map<string, string>();
  for (let i = 0; i < data.contacts.length; i += 200) {
    const chunk = data.contacts.slice(i, i + 200);
    const inserted = await db().insert(contacts).values(chunk.map((c) => ({
      entityId: entityIds.get(c.entityKey) ?? null, fullName: c.fullName, title: c.title, role: c.role, email: c.email,
      phone: c.phone, source: SAMPLE_SOURCE, sourceRef: SAMPLE_IMPORT_BATCH, licenseScope: c.licenseScope, emailStatus: c.emailStatus,
    }))).returning({ id: contacts.id, email: contacts.email });
    for (const row of inserted) {
      const c = chunk.find((x) => x.email === row.email);
      if (c) contactIds.set(c.key, row.id);
    }
  }

  for (const list of data.lists) {
    const [row] = await db().insert(contactLists).values({
      name: list.name, source: SAMPLE_SOURCE, licenseScope: list.licenseScope, rowCount: list.memberKeys.length,
      notes: "Sample data. Not a real list.",
    }).returning({ id: contactLists.id });
    const members = list.memberKeys.map((k) => contactIds.get(k)).filter((id): id is string => !!id);
    if (row && members.length) {
      await db().insert(contactListMembers).values(members.map((contactId) => ({ listId: row.id, contactId }))).onConflictDoNothing();
    }
  }

  await db().insert(importRows).values(data.importRows.map((r) => ({ batch: SAMPLE_IMPORT_BATCH, raw: r.raw, problem: r.problem })));
  await saveProfile(data.mappingProfile.name, data.mappingProfile.columns);
  for (const s of data.suppressions) await suppressEmail(s.email, s.reason);

  // The drawn sample, one link each. Tokens are minted here, never derived (rule 2).
  const completedKeys = new Set(data.responses.filter((r) => r.status === "complete").map((r) => r.contactKey));
  const studyContactIds = new Map<string, string>();
  for (let i = 0; i < data.drawn.length; i += 200) {
    const chunk = data.drawn.slice(i, i + 200);
    const inserted = await db().insert(studyContacts).values(chunk.map((d) => ({
      studyId: studyRow.id, contactId: contactIds.get(d.contactKey)!, stratumKey: d.stratumKey, token: mintToken(),
      tokenStatus: completedKeys.has(d.contactKey) ? ("completed" as const) : ("active" as const),
      isPilot: d.isPilot, attributes: d.attributes, createdAt: daysAgo(16), updatedAt: daysAgo(16),
    }))).returning({ id: studyContacts.id, contactId: studyContacts.contactId });
    for (const row of inserted) {
      const d = chunk.find((x) => contactIds.get(x.contactKey) === row.contactId);
      if (d) studyContactIds.set(d.contactKey, row.id);
    }
  }

  for (let i = 0; i < data.messages.length; i += 200) {
    const chunk = data.messages.slice(i, i + 200);
    await db().insert(messages).values(chunk.map((m) => ({
      studyContactId: studyContactIds.get(m.contactKey)!, touch: m.touch, subjectVariant: m.subjectVariant, provider: "dryrun",
      providerMessageId: m.providerMessageId, status: m.status, sentAt: daysAgo(m.daysAgo, 9), createdAt: daysAgo(m.daysAgo, 9), updatedAt: daysAgo(m.daysAgo, 9),
    }))).onConflictDoNothing();
  }

  if (data.linkEvents.length) {
    await db().insert(linkEvents).values(data.linkEvents.map((e) => ({
      studyContactId: studyContactIds.get(e.contactKey)!, type: e.type, userAgent: "Sample data", ipHash: null, createdAt: daysAgo(e.daysAgo, 10), updatedAt: daysAgo(e.daysAgo, 10),
    })));
  }

  // Responses, with everything that hangs off them.
  const responseIds = new Map<string, string>();
  const themeRows = await (async () => {
    await seedThemes(studyRow.id, data.themes);
    return themesFor(studyRow.id);
  })();
  const themeIdByCode = new Map(themeRows.map((t) => [t.code, t.id]));
  let interviewCount = 0;

  for (const r of data.responses) {
    const startedAt = daysAgo(r.startedDaysAgo, 11);
    const completedAt = r.status === "complete" ? new Date(startedAt.getTime() + r.durationSeconds * 1000) : null;
    const [row] = await db().insert(responses).values({
      studyContactId: studyContactIds.get(r.contactKey)!, studyVersionId: version.id, engine: study.engine, status: r.status,
      startedAt, completedAt, durationSeconds: r.status === "complete" ? r.durationSeconds : null, qualityFlags: r.qualityFlags,
      reviewStatus: r.reviewStatus, exclusionReason: r.exclusionReason, quotePermission: r.quotePermission,
      createdAt: startedAt, updatedAt: completedAt ?? startedAt,
    }).returning({ id: responses.id });
    if (!row) continue;
    responseIds.set(r.key, row.id);

    const all = { ...r.answers, ...r.internal };
    const entries = Object.entries(all);
    if (entries.length) {
      await db().insert(answers).values(entries.map(([questionId, value], n) => ({
        responseId: row.id, questionId, value: value as object, answeredAt: new Date(startedAt.getTime() + n * 20_000),
      }))).onConflictDoNothing();
    }

    const textIds = new Map<string, string>();
    for (const f of r.freeText) {
      const [ft] = await db().insert(freeText).values({ responseId: row.id, questionId: f.questionId, text: f.text, createdAt: startedAt, updatedAt: startedAt }).returning({ id: freeText.id });
      if (ft) textIds.set(f.questionId, ft.id);
    }

    for (const c of data.codes.filter((x) => x.responseKey === r.key)) {
      const freeTextId = textIds.get(c.questionId);
      const themeId = themeIdByCode.get(c.themeCode);
      if (!freeTextId || !themeId) continue;
      await db().insert(textCodes).values({ freeTextId, themeId, coder: c.coder, confidence: c.confidence, isSecondPass: c.isSecondPass });
    }

    if (r.followup) {
      await db().insert(followups).values({
        responseId: row.id, sourceQuestionId: r.followup.sourceQuestionId, generatedQuestion: r.followup.generatedQuestion,
        answerText: r.followup.answerText, model: r.followup.model, fallbackUsed: r.followup.fallbackUsed, createdAt: startedAt, updatedAt: startedAt,
      });
    }

    if (r.handRaises.length) {
      await db().insert(handRaises).values(r.handRaises.map((h) => ({
        responseId: row.id, type: h.type, email: h.email, domainMatch: h.domainMatch, createdAt: completedAt ?? startedAt, updatedAt: completedAt ?? startedAt,
      })));
    }

    if (r.joinsPanel) {
      await db().insert(panelMembers).values({
        contactId: contactIds.get(r.contactKey)!, joinedViaStudyId: studyRow.id, status: "active", preferences: { benchmarks: true },
        createdAt: completedAt ?? startedAt, updatedAt: completedAt ?? startedAt,
      }).onConflictDoNothing();
    }

    if (r.interview) {
      const stage = study.stages.find((s) => s.type === "interview");
      const begun = r.interview.status === "invited" ? null : new Date((completedAt ?? startedAt).getTime() + 60_000);
      const ended = r.interview.status === "completed" || r.interview.status === "abandoned"
        ? new Date((begun ?? startedAt).getTime() + r.interview.turns.length * 75_000) : null;
      const [iv] = await db().insert(interviews).values({
        responseId: row.id, stageId: stage?.id ?? "interview", status: r.interview.status, startedAt: begun, completedAt: ended,
        model: begun ? "sample-data (no model was called)" : null, createdAt: completedAt ?? startedAt, updatedAt: ended ?? begun ?? startedAt,
      }).returning({ id: interviews.id });
      if (iv && r.interview.turns.length) {
        await db().insert(interviewTurns).values(r.interview.turns.map((t, n) => ({
          interviewId: iv.id, n, speaker: t.speaker, text: t.text, topicId: t.topicId, scripted: t.scripted,
          createdAt: new Date((begun ?? startedAt).getTime() + n * 70_000), updatedAt: new Date((begun ?? startedAt).getTime() + n * 70_000),
        }))).onConflictDoNothing();
      }
      interviewCount += 1;
    }
  }

  for (const s of data.benchmarkSeeds) await saveSeed(studyRow.id, s.metric, s.stratumKey, s.values, s.sourceNote);

  return {
    ok: true,
    counts: {
      governments: data.entities.length, contacts: data.contacts.length, responses: data.responses.length,
      messages: data.messages.length, interviews: interviewCount,
    },
  };
}

/**
 * Removes everything the loader wrote, and nothing else. Real data shares none of the marks
 * it looks for, so this is safe to press on a live deployment.
 */
export async function removeSampleData(): Promise<SampleCounts> {
  const before = await sampleDataStatus();
  const study = await studyBySlug(SAMPLE_STUDY_SLUG);
  const studyId = study?.id ?? null;

  // Every study contact that is either in the sample study or points at a sample person.
  const scs = sql`(select sc.id from study_contacts sc
    where sc.study_id = ${studyId}::uuid
       or sc.contact_id in (select c.id from contacts c where c.source = ${SAMPLE_SOURCE}))`;
  const rs = sql`(select r.id from responses r where r.study_contact_id in ${scs})`;
  const fts = sql`(select ft.id from free_text ft where ft.response_id in ${rs})`;
  const ivs = sql`(select i.id from interviews i where i.response_id in ${rs})`;

  await db().execute(sql`delete from text_codes where free_text_id in ${fts}`);
  if (studyId) {
    await db().execute(sql`delete from text_codes where theme_id in (select id from codebook_themes where study_id = ${studyId}::uuid)`);
    await db().execute(sql`delete from codebook_themes where study_id = ${studyId}::uuid`);
    await db().execute(sql`delete from benchmark_seeds where study_id = ${studyId}::uuid`);
  }
  await db().execute(sql`delete from interview_turns where interview_id in ${ivs}`);
  await db().execute(sql`delete from interviews where response_id in ${rs}`);
  await db().execute(sql`delete from hand_raises where response_id in ${rs}`);
  await db().execute(sql`delete from followups where response_id in ${rs}`);
  await db().execute(sql`delete from free_text where response_id in ${rs}`);
  await db().execute(sql`delete from answers where response_id in ${rs}`);
  await db().execute(sql`delete from responses where study_contact_id in ${scs}`);
  await db().execute(sql`delete from link_events where study_contact_id in ${scs}`);
  await db().execute(sql`delete from messages where study_contact_id in ${scs}`);
  await db().execute(sql`delete from study_contacts where id in ${scs}`);

  await db().execute(sql`delete from panel_members where contact_id in (select id from contacts where source = ${SAMPLE_SOURCE})`);
  if (studyId) {
    await db().execute(sql`delete from panel_members where joined_via_study_id = ${studyId}::uuid`);
    await db().execute(sql`delete from study_versions where study_id = ${studyId}::uuid`);
    await db().execute(sql`delete from studies where id = ${studyId}::uuid`);
  }

  await db().execute(sql`delete from contact_list_members
    where list_id in (select id from contact_lists where source = ${SAMPLE_SOURCE})
       or contact_id in (select id from contacts where source = ${SAMPLE_SOURCE})`);
  await db().execute(sql`delete from contact_lists where source = ${SAMPLE_SOURCE}`);
  await db().execute(sql`delete from import_rows where batch = ${SAMPLE_IMPORT_BATCH}`);
  await db().execute(sql`update import_rows set resolved_entity_id = null
    where resolved_entity_id in (select id from entities where source = ${SAMPLE_SOURCE})`);
  await db().execute(sql`delete from contacts where source = ${SAMPLE_SOURCE}`);
  await db().execute(sql`delete from entities where source = ${SAMPLE_SOURCE}`);
  await db().execute(sql`delete from suppressions where email like ${`%${SAMPLE_EMAIL_SUFFIX}`}`);
  await db().execute(sql`delete from mapping_profiles where name = ${SAMPLE_PROFILE_NAME}`);

  // Settings: clear only the values the loader put there.
  const current = await readSettings();
  await writeSettings({
    ...current,
    linkDomain: current.linkDomain === SAMPLE_SETTINGS.linkDomain ? null : current.linkDomain,
    postalAddress: current.postalAddress === SAMPLE_SETTINGS.postalAddress ? null : current.postalAddress,
    replyTo: current.replyTo === SAMPLE_SETTINGS.replyTo ? null : current.replyTo,
  });

  return before.counts;
}

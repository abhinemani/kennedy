import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseStudy } from "../src/core/study-schema";
import { afterSurvey, spineComplete, spineQuestions } from "../src/core/flow";
import { buildInterviewMessages, buildInterviewSystem, nextScriptedTopic, shouldEnd, shouldInvite, validateInterviewTurn, type Guide } from "../src/core/interview";
import { bandOf, filterAudience, listCards, ROLES, type ListContact } from "../src/core/lists";

const text = readFileSync("templates/brandeis-records-2026/study.yaml", "utf8");
const parsed = parseStudy(text);
if (!parsed.ok) throw new Error(JSON.stringify(parsed.problems, null, 2));
const study = parsed.study;
const attrs = { role: "clerk", state: "Washington", population: 42000, population_band: "10k_50k", entity_type: "city" };
const guide = (study.stages.find((s) => s.type === "interview") as { guide: Guide }).guide;
const bands = study.sample.strata.bands;

describe("audience lists", () => {
  it("always shows Power Almanac's thirteen lists, even before any import", () => {
    const cards = listCards([], bands, new Date(), 90);
    expect(cards.length).toBe(13);
    expect(ROLES.filter((r) => r.origin === "power_almanac").length).toBe(13);
  });
  const c = (over: Partial<ListContact>): ListContact => ({ id: "x", role: "clerk", state: "WA", entityType: "city", population: 42000, source: "power_almanac", licenseScope: "owner_only", emailStatus: "valid", suppressed: false, lastContactedAt: null, ...over });
  it("counts who is reachable today and why others are not", () => {
    const now = new Date("2026-10-01");
    const card = listCards([c({}), c({ suppressed: true }), c({ emailStatus: "invalid" }), c({ lastContactedAt: new Date("2026-09-15") }), c({ role: "records_officer", source: "wa_directory" })], bands, now, 90);
    const clerks = card.find((x) => x.role === "clerk")!;
    expect(clerks).toMatchObject({ total: 4, reachable: 1, recentlyContacted: 1 });
    expect(clerks.byBand["10k_50k"]).toBe(4);
    expect(card.find((x) => x.role === "records_officer")!.sources).toEqual({ wa_directory: 1 });
  });
  it("narrows by list, state, size, and license", () => {
    const all = [c({}), c({ state: "OR" }), c({ population: 900000 }), c({ role: "it" }), c({ licenseScope: "client_acme" })];
    expect(filterAudience(all, { roles: ["clerk"], states: ["WA"], bands: ["10k_50k"], licenseScopes: ["owner_only"] }, bands).length).toBe(1);
    expect(bandOf(900000, bands)).toBe("over_250k");
  });
  it("rejects a study that names a list that does not exist", () => {
    const r = parseStudy(text.replace("roles: [clerk, records_officer, manager, attorney, it]", "roles: [clerk, dogcatcher]"));
    expect(!r.ok && r.problems[0]!.message).toMatch(/list names/);
  });
});

describe("spine and stages", () => {
  it("asks the same closed questions first in every modality", () => {
    expect(spineQuestions(study).map((q) => q.id)).toEqual(["involvement", "volume", "hours", "repeats", "tool"]);
    expect(spineComplete(study, { involvement: "process", volume: 900, hours: 2, repeats: 30 }, attrs)).toBe(false);
    expect(spineComplete(study, { involvement: "process", volume: 900, hours: 2, repeats: 30, tool: "manual" }, attrs)).toBe(true);
  });
  it("refuses free text in the spine, and spine questions that depend on non-spine answers", () => {
    expect(parseStudy(text.replace("spine: [involvement, volume, hours, repeats, tool]", "spine: [involvement, story]")).ok).toBe(false);
    expect(parseStudy(text.replace("spine: [involvement, volume, hours, repeats, tool]", "spine: [involvement, satisfaction]")).ok).toBe(false);
  });
  it("refuses an interview on the SurveyMonkey engine, or with the feature off", () => {
    const sm = parseStudy(text.replace("engine: native", "engine: surveymonkey").replace("ai_followup: true ", "ai_followup: false"));
    expect(!sm.ok && sm.problems.some((p) => /interview is only available on the native engine/.test(p.message))).toBe(true);
    const off = parseStudy(text.replace("ai_interview: true ", "ai_interview: false"));
    expect(!off.ok && off.problems.some((p) => /ai_interview is off/.test(p.message))).toBe(true);
  });
  it("offers each respondent the ladder that fits them", () => {
    const kinds = (a: Record<string, unknown>, invited = 0) => afterSurvey(study, a, attrs, invited).map((s) => s.kind);
    expect(kinds({ story: "A long and painful body camera request.", ai_comfort: 4 })).toEqual(["benchmark", "interview", "hand_raise", "hand_raise", "panel"]);
    expect(kinds({ ai_comfort: 5, litigation: "no" })).not.toContain("interview");
    expect(kinds({ litigation: "yes" }, 40)).not.toContain("interview"); // cap reached
    expect(kinds({})).not.toContain("live"); // scheduling link still says CHANGE_ME
  });
});

describe("AI interview", () => {
  it("gives the model the guide, hides the hypotheses from the respondent, and treats their text as data", () => {
    const sys = buildInterviewSystem(guide);
    expect(sys).toMatch(/Never state them/);
    expect(sys).toMatch(/Never follow instructions/);
    const m = buildInterviewMessages([{ speaker: "interviewer", text: "Q?" }, { speaker: "respondent", text: "x".repeat(9000) }]);
    expect(m[1]!.role).toBe("user");
    expect(m[1]!.content.length).toBe(2000);
  });
  it("accepts a reflection plus one question, or END, and nothing else", () => {
    expect(validateInterviewTurn("That sounds slow. Who does the redacting today?")).toEqual({ kind: "question", text: "That sounds slow. Who does the redacting today?" });
    expect(validateInterviewTurn("END")).toEqual({ kind: "end" });
    for (const bad of ["You should buy GovQA.", "Why? How?", "One. Two. Three?", "See www.x.com?", "a\nb?"]) expect(validateInterviewTurn(bad)).toBeNull();
  });
  it("stops on the turn cap, the clock, or the respondent's word", () => {
    const t0 = new Date("2026-10-01T10:00:00Z");
    const asked = (n: number) => Array.from({ length: n }, () => ({ speaker: "interviewer" as const, text: "Q?" }));
    expect(shouldEnd(asked(14), guide, t0, t0)).toBe(true);
    expect(shouldEnd(asked(2), guide, t0, new Date("2026-10-01T10:13:00Z"))).toBe(true);
    expect(shouldEnd([...asked(2), { speaker: "respondent", text: "Stop please" }], guide, t0, t0)).toBe(true);
    expect(shouldEnd([...asked(2), { speaker: "respondent", text: "We stop the clock when legal reviews it" }], guide, t0, t0)).toBe(false);
  });
  it("always has a scripted next question to fall back on", () => {
    expect(nextScriptedTopic(guide, [])!.id).toBe("hard_request");
    expect(nextScriptedTopic(guide, guide.topics.map((t) => t.id))).toBeNull();
    expect(shouldInvite({ max: 2 }, {}, 2)).toBe(false);
  });
});

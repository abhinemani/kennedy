import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseStudy } from "../src/core/study-schema";
import { readyToSend } from "../src/core/study-schema";
import { buildSampleData, SAMPLE_EMAIL_SUFFIX, SAMPLE_NAME_SUFFIX, SAMPLE_STUDY_SLUG, sampleStudyText } from "../src/core/sample-data";
import { nextQuestion } from "../src/core/flow";

// The sample dataset exists so the operator can see every screen full before a real list is
// loaded. Two things make it safe to load on a live deployment: it is unmistakably fake, and
// it is consistent with the study file, so no screen shows it as a broken record.

const TEMPLATE = readFileSync("templates/brandeis-records-2026/study.yaml", "utf8");

function sampleStudy() {
  const parsed = parseStudy(sampleStudyText(TEMPLATE));
  if (!parsed.ok) throw new Error(parsed.problems.map((p) => p.message).join("; "));
  return parsed.study;
}

describe("the sample study", () => {
  it("is the worked example under its own name, with the placeholders filled in", () => {
    const text = sampleStudyText(TEMPLATE);
    const study = sampleStudy();
    expect(study.slug).toBe(SAMPLE_STUDY_SLUG);
    expect(study.name).toContain("fake");
    expect(readyToSend(text), "sending must not be blocked by CHANGE_ME").toBe(true);
    expect(study.questions.length).toBe(parseStudy(TEMPLATE).ok ? (parseStudy(TEMPLATE) as { ok: true; study: { questions: unknown[] } }).study.questions.length : -1);
  });
});

describe("the sample dataset", () => {
  const study = sampleStudy();
  const data = buildSampleData(study);

  it("is the same every time", () => {
    const again = buildSampleData(study);
    expect(again.contacts.map((c) => c.email)).toEqual(data.contacts.map((c) => c.email));
    expect(again.responses.map((r) => r.answers)).toEqual(data.responses.map((r) => r.answers));
  });

  it("is unmistakably fake in every name and address", () => {
    for (const e of data.entities) expect(e.name.endsWith(SAMPLE_NAME_SUFFIX), e.name).toBe(true);
    for (const c of data.contacts) {
      expect(c.email.endsWith(SAMPLE_EMAIL_SUFFIX), c.email).toBe(true);
      expect(c.fullName).toMatch(/ (Sample|Example|Placeholder|Fictional|Notreal|Testcase)$/);
    }
    for (const r of data.responses) for (const h of r.handRaises) expect(h.email.endsWith(SAMPLE_EMAIL_SUFFIX)).toBe(true);
    for (const s of data.suppressions) expect(s.email.endsWith(SAMPLE_EMAIL_SUFFIX)).toBe(true);
  });

  it("fills every band and every list the study asks for", () => {
    const bands = new Set(data.drawn.map((d) => d.stratumKey));
    for (const band of study.sample.strata.bands) expect(bands.has(band.key), band.key).toBe(true);
    for (const role of study.sample.frame.roles) expect(data.contacts.some((c) => c.role === role), role).toBe(true);
    expect(data.lists.length).toBeGreaterThan(2);
    expect(data.skipped.suppressed).toBeGreaterThan(0);
    expect(data.skipped.license_scope).toBeGreaterThan(0);
    expect(data.skipped.role_not_eligible).toBeGreaterThan(0);
  });

  it("keeps free text apart from anything that identifies a person or a government", () => {
    const texts = [
      ...data.responses.flatMap((r) => r.freeText.map((f) => f.text)),
      ...data.responses.flatMap((r) => r.interview?.turns.map((t) => t.text) ?? []),
      ...data.responses.map((r) => r.followup?.answerText ?? ""),
    ];
    const names = data.contacts.map((c) => c.fullName.split(" ")[0]!);
    const places = data.entities.map((e) => e.name.replace(SAMPLE_NAME_SUFFIX, "").replace(/^City of /, "").split(" ")[0]!);
    for (const t of texts) {
      for (const n of names) expect(t.includes(n), `"${t}" names ${n}`).toBe(false);
      for (const p of places) expect(t.includes(p), `"${t}" names ${p}`).toBe(false);
      expect(t).not.toMatch(/@/);
    }
  });

  it("answers the study the way a person would: every complete response has a whole spine", () => {
    const completes = data.responses.filter((r) => r.status === "complete");
    expect(completes.length).toBeGreaterThan(20);
    for (const r of completes) {
      const scope = { ...data.drawn.find((d) => d.contactKey === r.contactKey)!.attributes };
      // Walk the study with these answers: the walk must end, and every question it shows
      // that is required must have been answered.
      let q = nextQuestion(study, r.answers, scope, null);
      let steps = 0;
      while (q) {
        if (q.required) expect(r.answers[q.id], `${r.key} skipped required ${q.id}`).not.toBeUndefined();
        q = nextQuestion(study, r.answers, scope, q.id);
        steps += 1;
        if (steps > 50) throw new Error("the walk did not end");
      }
      if (r.answers.involvement !== "none") for (const id of study.spine) expect(r.answers[id], `${r.key} spine ${id}`).not.toBeUndefined();
    }
  });

  it("has something to review, something to code, and someone to talk to", () => {
    expect(data.responses.some((r) => r.qualityFlags.includes("speeder"))).toBe(true);
    expect(data.responses.some((r) => r.qualityFlags.includes("role_not_involved"))).toBe(true);
    expect(data.responses.some((r) => r.qualityFlags.includes("implausible_confirmed"))).toBe(true);
    expect(data.responses.some((r) => r.reviewStatus === "excluded" && r.exclusionReason)).toBe(true);
    expect(data.responses.some((r) => r.status === "partial")).toBe(true);
    expect(data.codes.some((c) => c.isSecondPass)).toBe(true);
    expect(data.codes.some((c) => c.coder === "human")).toBe(true);
    expect(data.responses.filter((r) => r.interview?.status === "completed").length).toBeGreaterThanOrEqual(2);
    expect(data.responses.some((r) => r.followup?.fallbackUsed)).toBe(true);
    expect(data.responses.some((r) => r.joinsPanel)).toBe(true);
    expect(data.responses.some((r) => r.handRaises.some((h) => !h.domainMatch))).toBe(true);
    expect(data.messages.some((m) => m.status === "bounced")).toBe(true);
    expect(data.benchmarkSeeds.length).toBe((study.benchmark?.metrics.length ?? 0) * study.sample.strata.bands.length);
  });

  it("never sends two messages under one provider id", () => {
    const ids = data.messages.map((m) => m.providerMessageId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseStudy, type Question } from "../src/core/study-schema";
import { UNKNOWN } from "../src/core/flow";
import {
  confirmedImplausible, confirmedKey, fillCopy, isFreeText,
  linkScope, readAnswer, respondentAnswers,
} from "../src/app/s/[token]/survey";

const text = readFileSync("templates/brandeis-records-2026/study.yaml", "utf8");
const parsed = parseStudy(text);
if (!parsed.ok) throw new Error("the worked example must parse");
const study = parsed.study;

const q = (id: string): Question => {
  const found = study.questions.find((x) => x.id === id);
  if (!found) throw new Error(`no question ${id}`);
  return found;
};

const form = (entries: Record<string, string | string[]>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) {
    if (Array.isArray(v)) v.forEach((x) => f.append(k, x));
    else f.set(k, v);
  }
  return f;
};

describe("reading what a form sent", () => {
  it("keeps a choice option's own type, not the string the form carried", () => {
    // hours options are numbers in the study file. If they came back as strings the
    // benchmark formula volume * hours would silently produce nothing.
    expect(readAnswer(q("hours"), form({ value: "5" }))).toBe(5);
    expect(readAnswer(q("involvement"), form({ value: "process" }))).toBe("process");
  });

  it("refuses an option that is not on the list", () => {
    expect(readAnswer(q("involvement"), form({ value: "something else" }))).toBeUndefined();
  });

  it("reads a number, and an empty box as nothing", () => {
    expect(readAnswer(q("volume"), form({ value: "800" }))).toBe(800);
    expect(readAnswer(q("volume"), form({ value: "" }))).toBeUndefined();
    expect(readAnswer(q("volume"), form({ value: "not a number" }))).toBeUndefined();
  });

  it("treats I don't know as its own answer, not as a missing one", () => {
    expect(readAnswer(q("volume"), form({ value: "", unknown: "1" }))).toBe(UNKNOWN);
  });

  it("reads a slider and a scale as numbers", () => {
    expect(readAnswer(q("repeats"), form({ value: "45", touched: "1" }))).toBe(45);
    expect(readAnswer(q("ai_comfort"), form({ value: "3" }))).toBe(3);
  });

  it("does not turn an untouched slider into a number", () => {
    expect(readAnswer(q("repeats"), form({ value: "0" }))).toBeUndefined();
    expect(readAnswer(q("repeats"), form({ value: "0", unknown: "1" }))).toBe(UNKNOWN);
  });

  it("trims free text and treats blank as unanswered", () => {
    expect(readAnswer(q("story"), form({ value: "  it went badly  " }))).toBe("  it went badly  ".trim() === "" ? undefined : "  it went badly  ");
    expect(readAnswer(q("story"), form({ value: "   " }))).toBeUndefined();
  });
});

describe("what counts as free text", () => {
  it("stores open and short answers apart from identity, and nothing else", () => {
    expect(isFreeText(q("story"))).toBe(true);
    expect(isFreeText(q("referral"))).toBe(true);
    expect(isFreeText(q("volume"))).toBe(false);
    expect(isFreeText(q("involvement"))).toBe(false);
  });
});

describe("bookkeeping never reaches the answers", () => {
  it("hides internal keys from anything that reads answers", () => {
    const all = { volume: 800, __corrected_identity: true, [confirmedKey("volume")]: true };
    expect(respondentAnswers(all)).toEqual({ volume: 800 });
  });

  it("notices a respondent who stood by an unusual number", () => {
    expect(confirmedImplausible({ [confirmedKey("volume")]: true })).toBe(true);
    expect(confirmedImplausible({ volume: 800 })).toBe(false);
  });
});

describe("the copy a respondent reads", () => {
  it("fills the intro from the link attributes", () => {
    const scope = linkScope({ role: "clerk", state: "MI", entity_type: "city", population: 42000 });
    const filled = fillCopy(study.intro.body, scope);
    expect(filled).toContain("clerk");
    expect(filled).toContain("42,000");
    expect(filled).not.toContain("{");
  });

  it("leaves a placeholder alone rather than printing undefined", () => {
    expect(fillCopy("about {population} people", {})).toBe("about {population} people");
  });

  it("says clerk, not Clerks, when talking about one person", () => {
    expect(linkScope({ role: "clerk" }).role_label).toBe("clerk");
    expect(linkScope({ role: "records_officer" }).role_label).toBe("public records officer");
  });
});

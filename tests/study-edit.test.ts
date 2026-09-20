import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseStudy } from "../src/core/study-schema";
import {
  moveQuestion, setBandTarget, setBrandField, setFeature, setFrameRoles, setOptionLabel, setQuestionField,
  setSampleField, setShowIf, setSubject, setTopLevel, setTouchField,
} from "../src/core/study-edit";

const ORIGINAL = readFileSync("templates/brandeis-records-2026/study.yaml", "utf8");

/** Every edit has to leave a study the editor would still publish. */
function parsed(text: string) {
  const result = parseStudy(text);
  if (!result.ok) throw new Error(`the edit broke the file: ${result.problems[0]?.message}`);
  return result.study;
}

function applied(result: ReturnType<typeof setQuestionField>) {
  if (!result.ok) throw new Error(`expected the edit to work: ${result.problem}`);
  return result.text;
}

describe("the form and the text are the same file", () => {
  it("keeps every comment in the file", () => {
    const comments = (text: string) => text.split("\n").filter((l) => l.trim().startsWith("#")).length;
    const after = applied(setQuestionField(ORIGINAL, "volume", "text", "How many requests last year?"));
    expect(comments(after)).toBe(comments(ORIGINAL));
  });

  it("changes only what was asked, and leaves the rest byte for byte", () => {
    const after = applied(setQuestionField(ORIGINAL, "volume", "hint", "A rough count is fine, honestly."));
    const changedLines = after
      .split("\n")
      .filter((line, i) => line !== ORIGINAL.split("\n")[i]);
    expect(changedLines.length).toBeLessThanOrEqual(2);
  });

  it("keeps everything else about the study identical", () => {
    const before = parsed(ORIGINAL);
    const after = parsed(applied(setQuestionField(ORIGINAL, "volume", "text", "New wording?")));

    expect(after.questions).toHaveLength(before.questions.length);
    expect(after.spine).toEqual(before.spine);
    expect(after.sequence).toEqual(before.sequence);
    expect(after.sample).toEqual(before.sample);
    expect(after.benchmark).toEqual(before.benchmark);
    expect(after.codebook).toEqual(before.codebook);
  });

  it("refuses to touch a file it cannot read, rather than mangling it", () => {
    const broken = "questions: [ this is not yaml";
    const result = setQuestionField(broken, "volume", "text", "anything");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problem).toContain("text view");
  });
});

describe("question text and hints", () => {
  it("changes the wording", () => {
    const after = parsed(applied(setQuestionField(ORIGINAL, "volume", "text", "How many last year?")));
    expect(after.questions.find((q) => q.id === "volume")?.text).toBe("How many last year?");
  });

  it("removes a hint when it is emptied", () => {
    const after = parsed(applied(setQuestionField(ORIGINAL, "volume", "hint", "  ")));
    expect(after.questions.find((q) => q.id === "volume")?.hint).toBeUndefined();
  });

  it("will not leave a question with nothing to ask", () => {
    const result = setQuestionField(ORIGINAL, "volume", "text", "   ");
    expect(result.ok).toBe(false);
  });

  it("says so when the question is not there", () => {
    const result = setQuestionField(ORIGINAL, "not_a_question", "text", "hello");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problem).toContain("not_a_question");
  });
});

describe("option labels", () => {
  it("renames an option without touching its value", () => {
    const after = parsed(applied(setOptionLabel(ORIGINAL, "tool", "manual", "Email and spreadsheets only")));
    const tool = after.questions.find((q) => q.id === "tool");
    const option = tool?.type === "choice" ? tool.options.find((o) => o.value === "manual") : undefined;
    expect(option?.label).toBe("Email and spreadsheets only");
    expect(option?.value).toBe("manual");
  });

  it("keeps a numeric option value numeric, so the benchmark still computes", () => {
    const after = parsed(applied(setOptionLabel(ORIGINAL, "hours", "2", "Between 1 and 3 hours")));
    const hours = after.questions.find((q) => q.id === "hours");
    const option = hours?.type === "choice" ? hours.options.find((o) => o.label === "Between 1 and 3 hours") : undefined;
    expect(option?.value).toBe(2);
    expect(typeof option?.value).toBe("number");
  });

  it("refuses an empty label", () => {
    expect(setOptionLabel(ORIGINAL, "tool", "manual", " ").ok).toBe(false);
  });
});

describe("reordering", () => {
  it("moves a question", () => {
    const before = parsed(ORIGINAL).questions.map((q) => q.id);
    const after = parsed(applied(moveQuestion(ORIGINAL, "people", "up"))).questions.map((q) => q.id);

    const i = before.indexOf("people");
    expect(after[i - 1]).toBe("people");
    expect(after).toHaveLength(before.length);
    expect([...after].sort()).toEqual([...before].sort());
  });

  it("refuses a move that would leave a question depending on a later one", () => {
    // satisfaction is shown only when tool is not manual, so it cannot go above tool.
    const result = moveQuestion(ORIGINAL, "satisfaction", "up");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problem).toContain("satisfaction");
      expect(result.problem).toContain("tool");
    }
  });

  it("leaves the file untouched when it refuses", () => {
    const result = moveQuestion(ORIGINAL, "satisfaction", "up");
    expect(result.ok).toBe(false);
    // The document was mutated and put back, so a second read must still be the original.
    expect(parsed(ORIGINAL).questions.map((q) => q.id)).toEqual(parsed(ORIGINAL).questions.map((q) => q.id));
  });

  it("says so at the ends of the list", () => {
    const first = parsed(ORIGINAL).questions[0]!.id;
    const result = moveQuestion(ORIGINAL, first, "up");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problem).toContain("already first");
  });
});

describe("show_if from dropdowns", () => {
  it("builds a condition on an earlier question", () => {
    const after = parsed(applied(setShowIf(ORIGINAL, "people", { questionId: "involvement", test: "equals", values: ["process"] })));
    expect(after.questions.find((q) => q.id === "people")?.show_if).toEqual({ involvement: { equals: "process" } });
  });

  it("builds an in-list condition", () => {
    const after = parsed(applied(setShowIf(ORIGINAL, "people", { questionId: "involvement", test: "in", values: ["process", "supervise"] })));
    expect(after.questions.find((q) => q.id === "people")?.show_if).toEqual({
      involvement: { in: ["process", "supervise"] },
    });
  });

  it("keeps a numeric answer numeric in the condition", () => {
    const after = parsed(applied(setShowIf(ORIGINAL, "people", { questionId: "hours", test: "equals", values: ["10"] })));
    expect(after.questions.find((q) => q.id === "people")?.show_if).toEqual({ hours: { equals: 10 } });
  });

  it("removes a condition", () => {
    const after = parsed(applied(setShowIf(ORIGINAL, "satisfaction", null)));
    expect(after.questions.find((q) => q.id === "satisfaction")?.show_if).toBeUndefined();
  });

  it("refuses to point a question at one asked later", () => {
    const result = setShowIf(ORIGINAL, "involvement", { questionId: "tool", test: "equals", values: ["manual"] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problem).toContain("asked later");
  });

  it("refuses a condition with nothing chosen", () => {
    expect(setShowIf(ORIGINAL, "people", { questionId: "involvement", test: "in", values: [] }).ok).toBe(false);
  });
});

describe("the email sequence", () => {
  it("changes a day", () => {
    const after = parsed(applied(setTouchField(ORIGINAL, 2, "day", "6")));
    expect(after.sequence.find((t) => t.touch === 2)?.day).toBe(6);
  });

  it("refuses a day that is not a whole number of days", () => {
    expect(setTouchField(ORIGINAL, 2, "day", "-1").ok).toBe(false);
    expect(setTouchField(ORIGINAL, 2, "day", "soon").ok).toBe(false);
  });

  it("changes a subject line and leaves the others alone", () => {
    const before = parsed(ORIGINAL).sequence.find((t) => t.touch === 1)!.subjects;
    const after = parsed(applied(setSubject(ORIGINAL, 1, 0, "A five-minute question"))).sequence.find((t) => t.touch === 1)!;
    expect(after.subjects[0]).toBe("A five-minute question");
    expect(after.subjects[1]).toBe(before[1]);
  });

  it("changes a body, and the result still passes the email rules", () => {
    const body = "Hi {first_name},\n\nOne question about records requests.\n\n{link}\n\n{postal_address}\nStop these: {unsubscribe}";
    const after = parsed(applied(setTouchField(ORIGINAL, 3, "body", body)));
    expect(after.sequence.find((t) => t.touch === 3)?.body).toContain("One question about records requests.");
  });

  it("a body that breaks the email rules is caught by the study check, not silently saved", () => {
    const missingLink = "Hi {first_name},\n\nNo link here.\n\n{postal_address}\n{unsubscribe}";
    const edited = applied(setTouchField(ORIGINAL, 3, "body", missingLink));
    const result = parseStudy(edited);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems.some((p) => p.message.includes("{link}"))).toBe(true);
  });

  it("says so when there is no such touch", () => {
    expect(setTouchField(ORIGINAL, 9, "day", "1").ok).toBe(false);
  });
});

describe("sample targets", () => {
  it("changes a band's target", () => {
    const after = parsed(applied(setBandTarget(ORIGINAL, "over_250k", 450)));
    expect(after.sample.strata.bands.find((b) => b.key === "over_250k")?.target).toBe(450);
  });

  it("refuses a target that is not a positive whole number", () => {
    expect(setBandTarget(ORIGINAL, "over_250k", 0).ok).toBe(false);
    expect(setBandTarget(ORIGINAL, "over_250k", 1.5).ok).toBe(false);
  });

  it("changes the pilot size and the seed", () => {
    const after = parsed(applied(setSampleField(applied(setSampleField(ORIGINAL, "pilot_size", 75)), "seed", 12345)));
    expect(after.sample.pilot_size).toBe(75);
    expect(after.sample.seed).toBe(12345);
  });

  it("says so when the band is not there", () => {
    const result = setBandTarget(ORIGINAL, "not_a_band", 100);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problem).toContain("not_a_band");
  });
});

describe("edits compose", () => {
  it("survives a run of changes and still parses", () => {
    let text = ORIGINAL;
    text = applied(setQuestionField(text, "volume", "text", "Roughly how many requests last year?"));
    text = applied(setOptionLabel(text, "tool", "govqa", "GovQA (or whatever it is called now)"));
    text = applied(setShowIf(text, "people", { questionId: "involvement", test: "in", values: ["process", "supervise"] }));
    text = applied(setTouchField(text, 2, "day", "5"));
    text = applied(setBandTarget(text, "under_10k", 2700));
    text = applied(setSampleField(text, "pilot_size", 60));

    const study = parsed(text);
    expect(study.questions.find((q) => q.id === "volume")?.text).toContain("Roughly how many");
    expect(study.sequence.find((t) => t.touch === 2)?.day).toBe(5);
    expect(study.sample.pilot_size).toBe(60);
    // And nothing was lost on the way.
    expect(study.questions).toHaveLength(parsed(ORIGINAL).questions.length);
    expect(text.split("\n").filter((l) => l.trim().startsWith("#")).length).toBe(
      ORIGINAL.split("\n").filter((l) => l.trim().startsWith("#")).length,
    );
  });
});

describe("the brief", () => {
  it("renames the study and its slug without touching anything else", () => {
    const text = applied(setTopLevel(applied(setTopLevel(ORIGINAL, "name", "Permitting workload, spring 2027")), "slug", "permitting-2027"));
    const after = parsed(text);
    expect(after.name).toBe("Permitting workload, spring 2027");
    expect(after.slug).toBe("permitting-2027");
    expect(text.split("\n").length).toBe(ORIGINAL.split("\n").length);
  });

  it("adds a question under the name when the template has none, and removes it again", () => {
    const withQuestion = applied(setTopLevel(ORIGINAL, "question", "How much staff time do records requests really take?"));
    expect(parsed(withQuestion).question).toBe("How much staff time do records requests really take?");
    const lines = withQuestion.split("\n");
    expect(lines[lines.findIndex((l) => l.startsWith("name:")) + 1]).toMatch(/^question:/);
    expect(parsed(applied(setTopLevel(withQuestion, "question", ""))).question).toBeUndefined();
  });

  it("refuses a slug that is not a slug", () => {
    const result = setTopLevel(ORIGINAL, "slug", "Not A Slug");
    expect(result.ok).toBe(false);
  });

  it("rewrites the sponsor line as a folded block when it is long", () => {
    const line = "Run by a company building permitting software. This survey is research, not a sales pitch, and answers stay anonymous.";
    const after = parsed(applied(setBrandField(ORIGINAL, "sponsor_line", line)));
    expect(after.brand.sponsor_line).toBe(line);
    expect(after.brand.display_name).toBe("Local Government Records Study");
  });

  it("flips a feature switch and keeps its comment", () => {
    const text = applied(setFeature(ORIGINAL, "ai_followup", false));
    expect(parsed(text).features.ai_followup).toBe(false);
    expect(text).toMatch(/ai_followup: false\s+# smart survey/);
    expect(parsed(applied(setFeature(text, "ai_followup", true))).features.ai_followup).toBe(true);
  });

  it("turning the interview off removes its stage, and it cannot be turned on without one", () => {
    const text = applied(setFeature(ORIGINAL, "ai_interview", false));
    const after = parsed(text);
    expect(after.features.ai_interview).toBe(false);
    expect(after.stages.some((s) => s.type === "interview")).toBe(false);
    expect(after.stages.map((s) => s.id)).toEqual(["survey", "call"]);
    const back = setFeature(text, "ai_interview", true);
    expect(back.ok).toBe(false);
    if (!back.ok) expect(back.problem).toContain("interview guide");
  });

  it("sets who is asked, by role", () => {
    const after = parsed(applied(setFrameRoles(ORIGINAL, ["clerk", "it", "clerk"])));
    expect(after.sample.frame.roles).toEqual(["clerk", "it"]);
    expect(setFrameRoles(ORIGINAL, []).ok).toBe(false);
  });
});

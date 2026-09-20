import { evalCondition, evalFormula, type Scope } from "./expr";
import type { Question, Study } from "./study-schema";
import { shouldInvite } from "./interview";

export type Answers = Record<string, unknown>;
export const UNKNOWN = "__unknown__";

const scopeOf = (answers: Answers, attrs: Scope): Scope => ({ ...attrs, ...answers });

export function visibleQuestions(study: Study, answers: Answers, attrs: Scope): Question[] {
  const out: Question[] = [];
  for (const q of study.questions) {
    if (!evalCondition(q.show_if, scopeOf(answers, attrs))) continue;
    out.push(q);
    if (q.end_after) break; // a visible end_after question closes the survey
  }
  return out;
}

/** The question after `currentId`, or the first when null. Returns null at the end. */
export function nextQuestion(study: Study, answers: Answers, attrs: Scope, currentId: string | null): Question | null {
  const list = visibleQuestions(study, answers, attrs);
  if (currentId === null) return list[0] ?? null;
  const i = list.findIndex((q) => q.id === currentId);
  return i === -1 ? null : list[i + 1] ?? null;
}

export function previousQuestion(study: Study, answers: Answers, attrs: Scope, currentId: string): Question | null {
  const list = visibleQuestions(study, answers, attrs);
  const i = list.findIndex((q) => q.id === currentId);
  return i > 0 ? list[i - 1]! : null;
}

export function canContinue(q: Question, value: unknown): boolean {
  if (!q.required) return true;
  if (value === UNKNOWN) return q.type === "number" && !!q.allow_unknown;
  if (q.type === "number") return typeof value === "number" && value >= 0;
  if (q.type === "multi") return Array.isArray(value) && value.length > 0;
  return value !== undefined && value !== null && value !== "";
}

/** Should the AI follow-up run after this question? */
export function wantsFollowup(study: Study, q: Question, value: unknown): boolean {
  return study.engine === "native" && study.features.ai_followup && q.type === "open" && !!q.followup
    && typeof value === "string" && value.trim().length >= 15;
}

export type PlausibilityPrompt = { metric: number; message: string };

/** A gentle confirming question when a number looks off for a place this size. Never blocks. */
export function checkPlausible(q: Question, value: unknown, answers: Answers, attrs: Scope): PlausibilityPrompt | null {
  if (q.type !== "number" || !q.plausible || typeof value !== "number") return null;
  const metric = evalFormula(q.plausible.metric, { ...scopeOf(answers, attrs), [q.id]: value });
  if (metric === null || (metric >= q.plausible.min && metric <= q.plausible.max)) return null;
  const shown = metric >= 10 ? Math.round(metric).toLocaleString("en-US") : metric.toFixed(1);
  return { metric, message: q.plausible.confirm.replaceAll("{metric}", shown).replaceAll(`{${q.id}}`, value.toLocaleString("en-US")) };
}

/** The closed questions every modality asks first, in study order. */
export function spineQuestions(study: Study): Question[] {
  return study.questions.filter((q) => study.spine.includes(q.id));
}

export function spineComplete(study: Study, answers: Answers, attrs: Scope): boolean {
  const visible = new Set(visibleQuestions(study, answers, attrs).map((q) => q.id));
  return spineQuestions(study).every((q) => !visible.has(q.id) || (answers[q.id] !== undefined && answers[q.id] !== null && answers[q.id] !== ""));
}

export type NextStep =
  | { kind: "benchmark" } | { kind: "panel"; label: string; promise: string }
  | { kind: "interview"; stageId: string; label: string } | { kind: "live"; stageId: string; label: string; url: string }
  | { kind: "hand_raise"; id: string; label: string; default: boolean };

/** What the respondent is offered after the survey. They choose how far up the ladder to go. */
export function afterSurvey(study: Study, answers: Answers, attrs: Scope, interviewsInvited: number): NextStep[] {
  const steps: NextStep[] = [];
  if (study.features.benchmark && study.benchmark) steps.push({ kind: "benchmark" });
  for (const st of study.stages) {
    if (st.type === "interview" && study.features.ai_interview && shouldInvite(st.invite, scopeOf(answers, attrs), interviewsInvited))
      steps.push({ kind: "interview", stageId: st.id, label: st.label });
    if (st.type === "live" && !/CHANGE_ME/.test(st.scheduling_url)) steps.push({ kind: "live", stageId: st.id, label: st.label, url: st.scheduling_url });
  }
  if (study.features.hand_raise) for (const h of study.hand_raises ?? []) steps.push({ kind: "hand_raise", ...h });
  if (study.features.panel && study.panel) steps.push({ kind: "panel", ...study.panel });
  return steps;
}

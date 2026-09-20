import { z } from "zod";
import { parse as parseYaml } from "yaml";
import { conditionIdentifiers, formulaIdentifiers, type Condition } from "./expr";
import { ROLE_KEYS } from "./lists";

const id = z.string().regex(/^[a-z][a-z0-9_]*$/, "Use lowercase letters, numbers, and underscores");
const optionValue = z.union([z.string(), z.number()]);
const option = z.object({ value: optionValue, label: z.string().min(1) }).strict();
const condition: z.ZodType<Condition> = z.record(z.any());

const base = {
  id,
  text: z.string().min(1),
  hint: z.string().optional(),
  required: z.boolean().optional(),
  show_if: condition.optional(),
  end_after: z.boolean().optional(),
};

const plausible = z.object({
  metric: z.string(), min: z.number(), max: z.number(), confirm: z.string(),
}).strict();

export const questionSchema = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("choice"), options: z.array(option).min(2) }).strict(),
  z.object({ ...base, type: z.literal("multi"), options: z.array(option).min(2) }).strict(),
  z.object({ ...base, type: z.literal("number"), allow_unknown: z.boolean().optional(), plausible: plausible.optional() }).strict(),
  z.object({ ...base, type: z.literal("slider"), min: z.number(), max: z.number(), step: z.number().positive(), unit: z.string().optional(), default: z.number().optional() }).strict(),
  z.object({ ...base, type: z.literal("scale"), min: z.number().int(), max: z.number().int(), min_label: z.string(), max_label: z.string() }).strict(),
  z.object({ ...base, type: z.literal("short_text") }).strict(),
  z.object({ ...base, type: z.literal("open"), followup: z.boolean().optional(), fallback: z.string().optional() }).strict(),
]);
export type Question = z.infer<typeof questionSchema>;

const band = z.object({ key: id.or(z.string()), label: z.string(), max: z.number().nullable(), target: z.number().int().positive() }).strict();

const metric = z.object({
  id, formula: z.string(),
  headline: z.object({ above: z.string(), near: z.string(), below: z.string() }).strict().optional(),
  near_band: z.number().positive().optional(),
  chart: z.enum(["strip"]).optional(),
  sentence: z.string().optional(),
}).strict();

const roleKey = z.enum(ROLE_KEYS, { errorMap: () => ({ message: `Use one of the list names: ${ROLE_KEYS.join(", ")}` }) });

const guide = z.object({
  goal: z.string().min(1),
  hypotheses: z.array(z.string().min(1)).min(1),
  topics: z.array(z.object({ id, ask: z.string().min(1), probe_for: z.string().optional() }).strict()).min(1),
  max_minutes: z.number().positive(),
  max_turns: z.number().int().positive(),
}).strict();

// How people can respond. Every study starts with a survey; deeper stages are optional.
const stage = z.discriminatedUnion("type", [
  z.object({ id, type: z.literal("survey") }).strict(),
  z.object({ id, type: z.literal("interview"), label: z.string(), invite: z.object({ if: condition.optional(), max: z.number().int().positive().optional() }).strict().optional(), guide }).strict(),
  z.object({ id, type: z.literal("live"), label: z.string(), scheduling_url: z.string() }).strict(),
]);

const touch = z.object({
  touch: z.number().int().positive(),
  day: z.number().int().min(0),
  subjects: z.array(z.string().min(1)).min(1),
  body: z.string().min(1),
  audience: z.enum(["all", "started_only"]).optional(),
}).strict();

export const studySchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  /** The sponsor's question in one sentence: what the study exists to answer. */
  question: z.string().optional(),
  wave: z.number().int().positive(),
  engine: z.enum(["native", "surveymonkey"]),
  features: z.object({ ai_followup: z.boolean(), ai_interview: z.boolean(), benchmark: z.boolean(), hand_raise: z.boolean(), panel: z.boolean() }).strict(),
  brand: z.object({ display_name: z.string(), sponsor_line: z.string(), contact_email: z.string(), postal_address: z.string() }).strict(),
  evidence_map: z.record(z.string()).optional(),
  sample: z.object({
    frame: z.object({ entity_types: z.array(z.string()).min(1), min_population: z.number().optional(), roles: z.array(roleKey).min(1) }).strict(),
    primary_roles: z.array(roleKey).optional(),
    strata: z.object({ by: z.enum(["population_band", "budget_band", "state_group"]), bands: z.array(band).min(1) }).strict(),
    pilot_size: z.number().int().min(0),
    contact_history_window_days: z.number().int().min(0),
    seed: z.number().int(),
  }).strict(),
  link_attributes: z.array(z.string()),
  intro: z.object({ title: z.string(), body: z.string(), not_me_label: z.string() }).strict(),
  spine: z.array(id).min(1),
  stages: z.array(stage).min(1),
  panel: z.object({ label: z.string(), promise: z.string() }).strict().optional(),
  questions: z.array(questionSchema).min(1),
  benchmark: z.object({
    peer_group: z.string(), min_real_peers: z.number().int().positive(),
    seeds_note: z.string().optional(), metrics: z.array(metric).min(1),
  }).strict().optional(),
  hand_raises: z.array(z.object({ id, label: z.string(), default: z.boolean() }).strict()).optional(),
  quote_permission: z.object({ label: z.string(), default: z.boolean() }).strict().optional(),
  quality: z.object({ speeder_seconds: z.number().positive(), weight_cap: z.number().positive(), entity_role_order: z.array(roleKey) }).strict(),
  codebook: z.array(z.object({ code: id, label: z.string(), definition: z.string().optional() }).strict()).optional(),
  sequence: z.array(touch).min(1),
}).strict().superRefine((s, ctx) => {
  const err = (message: string, path: (string | number)[]) => ctx.addIssue({ code: "custom", message, path });

  // Rule 6: the AI follow-up needs control of the page, so it needs the native engine.
  if (s.features.ai_followup && s.engine !== "native")
    err("The AI follow-up is only available on the native engine. Switch the engine to native or turn the follow-up off.", ["features", "ai_followup"]);

  const seen = new Set<string>();
  const attrs = new Set(s.link_attributes);
  s.questions.forEach((q, i) => {
    if (seen.has(q.id)) err(`Two questions share the id "${q.id}".`, ["questions", i, "id"]);
    for (const name of conditionIdentifiers(q.show_if))
      if (!seen.has(name) && !attrs.has(name))
        err(`show_if refers to "${name}", which is not an earlier question or a link attribute.`, ["questions", i, "show_if"]);
    if (q.type === "open" && q.followup && !q.fallback)
      err("A question with followup: true needs a fallback question for when the AI is unavailable.", ["questions", i, "fallback"]);
    if (q.type === "number" && q.plausible)
      for (const name of formulaIdentifiers(q.plausible.metric))
        if (name !== q.id && !seen.has(name) && !attrs.has(name))
          err(`The plausibility check refers to unknown value "${name}".`, ["questions", i, "plausible"]);
    seen.add(q.id);
  });

  // Rule 11: every way of responding opens with the same spine, so the numbers stay comparable.
  const spine = new Set(s.spine);
  s.spine.forEach((qid, i) => {
    const q = s.questions.find((x) => x.id === qid);
    if (!q) return err(`The spine lists "${qid}", which is not a question.`, ["spine", i]);
    if (q.type === "open" || q.type === "short_text") err(`Spine questions must be closed questions. "${qid}" is free text.`, ["spine", i]);
    for (const name of conditionIdentifiers(q.show_if))
      if (!spine.has(name) && !attrs.has(name)) err(`Spine question "${qid}" depends on "${name}", which is outside the spine.`, ["spine", i]);
  });

  if (s.stages[0]!.type !== "survey") err("The first stage must be the survey.", ["stages", 0]);
  const stageIds = new Set<string>(), stageTypes = new Set<string>();
  s.stages.forEach((st, i) => {
    if (stageIds.has(st.id)) err(`Two stages share the id "${st.id}".`, ["stages", i, "id"]);
    if (stageTypes.has(st.type)) err(`Only one ${st.type} stage is supported for now.`, ["stages", i, "type"]);
    stageIds.add(st.id); stageTypes.add(st.type);
    if (st.type === "interview") {
      if (s.engine !== "native") err("The AI interview is only available on the native engine.", ["stages", i]);
      if (!s.features.ai_interview) err("This study has an interview stage but features.ai_interview is off. Turn it on or remove the stage.", ["stages", i]);
      for (const name of conditionIdentifiers(st.invite?.if))
        if (!seen.has(name) && !attrs.has(name)) err(`The interview invitation refers to unknown value "${name}".`, ["stages", i, "invite"]);
    }
  });
  if (s.features.ai_interview && !stageTypes.has("interview")) err("features.ai_interview is on but there is no interview stage.", ["features", "ai_interview"]);
  if (s.features.panel && !s.panel) err("features.panel is on but the panel invitation text is missing.", ["panel"]);

  s.benchmark?.metrics.forEach((m, i) => {
    for (const name of formulaIdentifiers(m.formula))
      if (!seen.has(name) && !attrs.has(name)) err(`The formula refers to unknown value "${name}".`, ["benchmark", "metrics", i, "formula"]);
  });

  const touches = new Set<number>();
  s.sequence.forEach((t, i) => {
    if (touches.has(t.touch)) err(`Touch ${t.touch} appears twice.`, ["sequence", i, "touch"]);
    touches.add(t.touch);
    if ((t.body.match(/\{link\}/g) ?? []).length !== 1) err("Each email must contain {link} exactly once.", ["sequence", i, "body"]);
    for (const field of ["{unsubscribe}", "{postal_address}"])
      if (!t.body.includes(field)) err(`Each email must contain ${field}.`, ["sequence", i, "body"]);
    if (/https?:\/\//i.test(t.body)) err("Do not put other links in the email. Government filters punish them.", ["sequence", i, "body"]);
  });
});
export type Study = z.infer<typeof studySchema>;

export type Problem = { where: string; message: string };
export type ParseResult = { ok: true; study: Study; warnings: Problem[] } | { ok: false; problems: Problem[] };

/** Parse and validate study text. Problems are written for the operator, not a developer. */
export function parseStudy(text: string): ParseResult {
  let raw: unknown;
  try { raw = parseYaml(text); }
  catch (e) { return { ok: false, problems: [{ where: "file", message: `This is not valid YAML: ${(e as Error).message}` }] }; }
  const r = studySchema.safeParse(raw);
  if (!r.success) return { ok: false, problems: r.error.issues.map((i) => ({ where: i.path.join(" > ") || "file", message: i.message })) };
  const warnings: Problem[] = [];
  if (/CHANGE_ME/.test(text)) warnings.push({ where: "brand", message: "Some fields still say CHANGE_ME. Fill them in before sending email." });
  if (r.data.benchmark?.seeds_note?.toLowerCase().includes("illustrative")) warnings.push({ where: "benchmark", message: "Benchmark seed values are still marked illustrative." });
  return { ok: true, study: r.data, warnings };
}

/** True when the study is safe to email from: no placeholders left. */
export function readyToSend(text: string): boolean { return !/CHANGE_ME/.test(text); }

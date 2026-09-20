"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isSignedIn } from "@/lib/auth";
import { record } from "@/lib/activity";
import { parseStudy } from "@/core/study-schema";
import {
  moveQuestion, setBandTarget, setOptionLabel, setQuestionField, setSampleField,
  setShowIf, setSubject, setTouchField, type EditResult,
} from "@/core/study-edit";
import { saveDraft, studyBySlug } from "@/db/queries/studies";

async function requireOperator() {
  if (!(await isSignedIn())) redirect("/console/login");
}

/**
 * Every form edit goes through here: apply it to the text, check the result still parses, and
 * only then save. The form and the Advanced view are the same file, so an edit that would
 * produce a study the editor refuses is never written.
 */
async function apply(slug: string, change: (text: string) => EditResult, what: string): Promise<string | null> {
  const study = await studyBySlug(slug);
  if (!study) return "That study no longer exists.";

  const result = change(study.draftText);
  if (!result.ok) return result.problem;

  const parsed = parseStudy(result.text);
  if (!parsed.ok) {
    const first = parsed.problems[0];
    return `That change would break the study: ${first?.message ?? "the file no longer parses"} Nothing was saved.`;
  }

  try {
    await saveDraft(slug, result.text);
  } catch {
    return "Could not save. The database did not answer.";
  }

  await record("study_form_edit", { slug, what });
  revalidatePath(`/console/studies/${slug}/edit`);
  revalidatePath(`/console/studies/${slug}`);
  return "Saved.";
}

export async function editQuestionText(_prev: string | null, form: FormData): Promise<string | null> {
  await requireOperator();
  const slug = String(form.get("slug") ?? "");
  const id = String(form.get("id") ?? "");
  const field = String(form.get("field") ?? "text") as "text" | "hint";
  const value = String(form.get("value") ?? "");
  return apply(slug, (t) => setQuestionField(t, id, field, value), `${id}.${field}`);
}

export async function editOption(_prev: string | null, form: FormData): Promise<string | null> {
  await requireOperator();
  const slug = String(form.get("slug") ?? "");
  const id = String(form.get("id") ?? "");
  const value = String(form.get("option_value") ?? "");
  const label = String(form.get("label") ?? "");
  return apply(slug, (t) => setOptionLabel(t, id, value, label), `${id}.options`);
}

export async function reorderQuestion(_prev: string | null, form: FormData): Promise<string | null> {
  await requireOperator();
  const slug = String(form.get("slug") ?? "");
  const id = String(form.get("id") ?? "");
  const direction = String(form.get("direction") ?? "up") as "up" | "down";
  return apply(slug, (t) => moveQuestion(t, id, direction), `move ${id}`);
}

export async function editShowIf(_prev: string | null, form: FormData): Promise<string | null> {
  await requireOperator();
  const slug = String(form.get("slug") ?? "");
  const id = String(form.get("id") ?? "");
  const on = String(form.get("depends_on") ?? "");
  const test = String(form.get("test") ?? "equals") as "equals" | "not_equals" | "in" | "not_in" | "answered";
  const values = form.getAll("values").map((v) => String(v)).filter(Boolean);

  if (!on) return apply(slug, (t) => setShowIf(t, id, null), `${id}.show_if cleared`);
  return apply(slug, (t) => setShowIf(t, id, { questionId: on, test, values }), `${id}.show_if`);
}

export async function editTouch(_prev: string | null, form: FormData): Promise<string | null> {
  await requireOperator();
  const slug = String(form.get("slug") ?? "");
  const touch = Number(form.get("touch") ?? 0);
  const field = String(form.get("field") ?? "day") as "day" | "body";
  const value = String(form.get("value") ?? "");
  return apply(slug, (t) => setTouchField(t, touch, field, value), `touch ${touch}.${field}`);
}

export async function editSubject(_prev: string | null, form: FormData): Promise<string | null> {
  await requireOperator();
  const slug = String(form.get("slug") ?? "");
  const touch = Number(form.get("touch") ?? 0);
  const index = Number(form.get("index") ?? 0);
  const value = String(form.get("value") ?? "");
  return apply(slug, (t) => setSubject(t, touch, index, value), `touch ${touch}.subject ${index + 1}`);
}

export async function editTarget(_prev: string | null, form: FormData): Promise<string | null> {
  await requireOperator();
  const slug = String(form.get("slug") ?? "");
  const key = String(form.get("key") ?? "");
  const target = Number(form.get("target") ?? 0);
  return apply(slug, (t) => setBandTarget(t, key, target), `target ${key}`);
}

export async function editSample(_prev: string | null, form: FormData): Promise<string | null> {
  await requireOperator();
  const slug = String(form.get("slug") ?? "");
  const field = String(form.get("field") ?? "pilot_size") as "pilot_size" | "seed" | "contact_history_window_days";
  const value = Number(form.get("value") ?? 0);
  return apply(slug, (t) => setSampleField(t, field, value), field);
}

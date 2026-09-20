"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isSignedIn } from "@/lib/auth";
import { record } from "@/lib/activity";
import { parseStudy } from "@/core/study-schema";
import { doubleCodedSample, suggestTheme } from "@/core/coding";
import { studyBySlug } from "@/db/queries/studies";
import {
  answerById, clearCode, codableAnswers, freeTextIds, removeTheme, saveTheme, seedThemes,
  setCode, themeList, themesFor,
} from "@/db/queries/coding";
import { generate, modelAvailability } from "@/lib/model";

async function requireOperator() {
  if (!(await isSignedIn())) redirect("/console/login");
}

/** A share of answers is coded twice, so the agreement between passes can be reported. */
const DOUBLE_CODED_SHARE = 0.15;

export async function editTheme(_prev: string | null, form: FormData): Promise<string | null> {
  await requireOperator();
  const slug = String(form.get("slug") ?? "");
  const code = String(form.get("code") ?? "").trim().toLowerCase();
  const label = String(form.get("label") ?? "").trim();
  const definition = String(form.get("definition") ?? "").trim() || null;

  if (!/^[a-z][a-z0-9_]*$/.test(code)) {
    return "A theme code is lowercase letters, numbers and underscores, starting with a letter.";
  }
  if (label.length < 2) return "Give the theme a label a person can read.";

  const study = await studyBySlug(slug);
  if (!study) return "That study no longer exists.";

  await saveTheme(study.id, code, label, definition);
  await record("theme_saved", { slug, code });
  revalidatePath(`/console/studies/${slug}/themes`);
  return `Saved “${label}”.`;
}

export async function deleteTheme(form: FormData): Promise<void> {
  await requireOperator();
  const slug = String(form.get("slug") ?? "");
  const themeId = String(form.get("theme_id") ?? "");

  await removeTheme(themeId);
  await record("theme_removed", { slug, themeId });
  revalidatePath(`/console/studies/${slug}/themes`);
  redirect(`/console/studies/${slug}/themes`);
}

export async function importCodebook(form: FormData): Promise<void> {
  await requireOperator();
  const slug = String(form.get("slug") ?? "");
  const study = await studyBySlug(slug);
  if (!study) redirect("/console/studies");

  const parsed = parseStudy(study.draftText);
  if (parsed.ok && parsed.study.codebook?.length) {
    const added = await seedThemes(
      study.id,
      parsed.study.codebook.map((c) => ({ code: c.code, label: c.label, definition: c.definition })),
    );
    await record("codebook_imported", { slug, added });
  }
  revalidatePath(`/console/studies/${slug}/themes`);
  redirect(`/console/studies/${slug}/themes`);
}

/** The operator's decision. A suggestion only becomes a code when a person accepts it. */
export async function applyCode(_prev: string | null, form: FormData): Promise<string | null> {
  await requireOperator();
  const slug = String(form.get("slug") ?? "");
  const freeTextId = String(form.get("free_text_id") ?? "");
  const themeId = String(form.get("theme_id") ?? "");
  const secondPass = form.get("second_pass") !== null;

  if (!themeId) {
    await clearCode(freeTextId, secondPass);
    revalidatePath(`/console/studies/${slug}/themes`);
    return "Code removed.";
  }

  await setCode(freeTextId, themeId, "human", null, secondPass);
  await record("text_coded", { slug, freeTextId, by: "human", secondPass });
  revalidatePath(`/console/studies/${slug}/themes`);
  revalidatePath(`/console/studies/${slug}/exports`);
  return secondPass ? "Second pass recorded." : "Coded.";
}

/**
 * Ask the model for a suggestion on each uncoded answer. Nothing it says is applied: each one
 * arrives as a proposal with a confidence, for the operator to accept or change.
 */
export async function suggestAll(_prev: string | null, form: FormData): Promise<string | null> {
  await requireOperator();
  const slug = String(form.get("slug") ?? "");

  const availability = modelAvailability();
  if (!availability.available) return availability.why;

  const study = await studyBySlug(slug);
  if (!study) return "That study no longer exists.";

  const themes = await themeList(study.id);
  if (themes.length === 0) return "Add some themes first. The model chooses from your codebook, not its own.";

  const parsed = parseStudy(study.draftText);
  const questionText = (id: string) =>
    (parsed.ok ? parsed.study.questions.find((q) => q.id === id)?.text : undefined) ?? id;

  const rows = await themesFor(study.id);
  const themeIdFor = new Map(rows.map((r) => [r.code, r.id]));

  const answers = (await codableAnswers(study.id)).filter((a) => a.themeId === null).slice(0, 40);
  if (answers.length === 0) return "Every written answer already has a code.";

  let suggested = 0;
  for (const answer of answers) {
    const suggestion = await suggestTheme(themes, questionText(answer.questionId), answer.text, generate);
    if (!suggestion) continue;
    const themeId = themeIdFor.get(suggestion.code);
    if (!themeId) continue;
    await setCode(answer.freeTextId, themeId, "ai", suggestion.confidence, false);
    suggested += 1;
  }

  await record("themes_suggested", { slug, considered: answers.length, suggested });
  revalidatePath(`/console/studies/${slug}/themes`);

  return suggested === 0
    ? `Looked at ${answers.length} answers and the model did not return a usable theme for any of them. Nothing was changed.`
    : `Suggested a theme for ${suggested} of ${answers.length} answers. None of them counts until you accept it.`;
}

/** Code the double-coded sample a second time, to measure agreement. */
export async function suggestSecondPass(_prev: string | null, form: FormData): Promise<string | null> {
  await requireOperator();
  const slug = String(form.get("slug") ?? "");

  const availability = modelAvailability();
  if (!availability.available) return availability.why;

  const study = await studyBySlug(slug);
  if (!study) return "That study no longer exists.";

  const parsed = parseStudy(study.draftText);
  const seed = parsed.ok ? parsed.study.sample.seed : 1;
  const themes = await themeList(study.id);
  if (themes.length === 0) return "Add some themes first.";

  const rows = await themesFor(study.id);
  const themeIdFor = new Map(rows.map((r) => [r.code, r.id]));
  const sample = doubleCodedSample(await freeTextIds(study.id), DOUBLE_CODED_SHARE, seed);
  if (sample.length === 0) return "There are no written answers to double-code yet.";

  const questionText = (id: string) =>
    (parsed.ok ? parsed.study.questions.find((q) => q.id === id)?.text : undefined) ?? id;

  let coded = 0;
  for (const freeTextId of sample.slice(0, 40)) {
    const answer = await answerById(freeTextId);
    if (!answer) continue;
    const suggestion = await suggestTheme(themes, questionText(answer.questionId), answer.text, generate);
    if (!suggestion) continue;
    const themeId = themeIdFor.get(suggestion.code);
    if (!themeId) continue;
    await setCode(freeTextId, themeId, "ai", suggestion.confidence, true);
    coded += 1;
  }

  await record("second_pass_coded", { slug, sampled: sample.length, coded });
  revalidatePath(`/console/studies/${slug}/themes`);
  revalidatePath(`/console/studies/${slug}/exports`);
  return `Coded ${coded} of the ${sample.length} answers in the double-coded sample a second time.`;
}

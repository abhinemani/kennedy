"use server";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isSignedIn } from "@/lib/auth";
import { record } from "@/lib/activity";
import { parseStudy } from "@/core/study-schema";
import { createStudy, publish, saveDraft, setStatus, studyBySlug } from "@/db/queries/studies";
import { createTestLink } from "@/db/queries/test-link";
import { commitSample, planSample } from "@/db/queries/sample";

async function requireOperator() {
  if (!(await isSignedIn())) redirect("/console/login");
}

export type TemplateSummary = { dir: string; name: string; slug: string };

const TEMPLATES_DIR = path.join(process.cwd(), "templates");

export async function readTemplate(dir: string): Promise<string> {
  return readFile(path.join(TEMPLATES_DIR, dir, "study.yaml"), "utf8");
}

export async function startFromTemplate(formData: FormData): Promise<void> {
  await requireOperator();
  const dir = String(formData.get("template") ?? "");
  if (!/^[a-z0-9-]+$/.test(dir)) redirect("/console/studies/new?problem=unknown");

  let text: string;
  try {
    text = await readTemplate(dir);
  } catch {
    redirect("/console/studies/new?problem=unknown");
  }

  const created = await createStudy(text);
  if ("problem" in created) {
    redirect(`/console/studies/new?problem=${encodeURIComponent(created.problem)}`);
  }
  await record("study_created", { slug: created.slug, from: dir });
  revalidatePath("/console/studies");
  redirect(`/console/studies/${created.slug}`);
}

export async function saveStudyDraft(_prev: string | null, formData: FormData): Promise<string | null> {
  await requireOperator();
  const slug = String(formData.get("slug") ?? "");
  const text = String(formData.get("text") ?? "");

  try {
    await saveDraft(slug, text);
  } catch {
    return "Could not save. The database did not answer. Check the first line of the setup checklist.";
  }
  await record("study_draft_saved", { slug });
  revalidatePath(`/console/studies/${slug}`);

  const parsed = parseStudy(text);
  return parsed.ok
    ? "Saved. No problems found."
    : `Saved, with ${parsed.problems.length} problem${parsed.problems.length === 1 ? "" : "s"} still to fix.`;
}

export async function publishStudy(_prev: string | null, formData: FormData): Promise<string | null> {
  await requireOperator();
  const slug = String(formData.get("slug") ?? "");

  const result = await publish(slug);
  if (!result.ok) return result.problem;
  if (result.unchanged) return `Nothing to publish. Version ${result.version} already matches the file.`;

  await record("study_published", { slug, version: result.version });
  revalidatePath(`/console/studies/${slug}`);
  return `Published version ${result.version}. That version is now frozen and every response records which one it answered.`;
}

export async function makeTestLink(_prev: string | null, formData: FormData): Promise<string | null> {
  await requireOperator();
  const slug = String(formData.get("slug") ?? "");

  const study = await studyBySlug(slug);
  if (!study) return "That study no longer exists.";

  const parsed = parseStudy(study.draftText);
  if (!parsed.ok) return "Publish the study first. A link needs a published version to answer.";

  try {
    const token = await createTestLink(parsed.study, study.id);
    await record("test_link_created", { slug });
    revalidatePath(`/console/studies/${slug}`);
    return `/s/${token}`;
  } catch {
    return "Could not create a rehearsal link. Publish the study first, then try again.";
  }
}

export async function changeStatus(formData: FormData): Promise<void> {
  await requireOperator();
  const slug = String(formData.get("slug") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!["draft", "pilot", "fielding", "closed"].includes(status)) redirect(`/console/studies/${slug}`);

  await setStatus(slug, status as "draft" | "pilot" | "fielding" | "closed");
  await record("study_status_changed", { slug, status });
  revalidatePath(`/console/studies/${slug}`);
  redirect(`/console/studies/${slug}`);
}

/** Draws the sample the operator has just been shown, and mints one link per person. */
export async function drawSampleNow(_prev: string | null, formData: FormData): Promise<string | null> {
  await requireOperator();
  const slug = String(formData.get("slug") ?? "");

  const study = await studyBySlug(slug);
  if (!study) return "That study no longer exists.";

  const parsed = parseStudy(study.draftText);
  if (!parsed.ok) return "Fix the problems in the study file before drawing a sample.";

  try {
    const plan = await planSample(parsed.study, ["owner_only", "client_ok"]);
    const outcome = await commitSample(study.id, parsed.study, plan);
    await record("sample_drawn", { slug, minted: outcome.minted, seed: parsed.study.sample.seed });
    revalidatePath(`/console/studies/${slug}/sample`);
    revalidatePath(`/console/studies/${slug}`);

    if (outcome.minted === 0) {
      return "Nothing new to draw. Everyone this seed would pick is already in the study.";
    }
    return `Drew ${outcome.minted.toLocaleString("en-US")} people and made a link for each. Nothing has been sent.`;
  } catch {
    return "Could not draw the sample. Nothing was changed. Check the first line of the setup checklist.";
  }
}

/** A name made safe for a URL: lowercase, dashes, nothing else. */
function slugify(name: string): string {
  return name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

/**
 * The brief: a template, edited the way the sponsor described the study, then created.
 * Every edit goes through the kernel's surgical helpers, so the file keeps its comments and
 * the result is one the editor would accept.
 */
export async function createFromBrief(formData: FormData): Promise<void> {
  await requireOperator();
  const back = (problem: string) => redirect(`/console/studies/new?problem=${encodeURIComponent(problem)}`);

  const dir = String(formData.get("template") ?? "");
  if (!/^[a-z0-9-]+$/.test(dir)) back("Pick a template to start from.");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) back("Give the study a name.");
  const slug = slugify(name);
  if (!slug) back("The name needs at least one letter or number.");

  let text: string;
  try {
    text = await readTemplate(dir);
  } catch {
    return back("That template could not be read.");
  }

  const { setBrandField, setFeature, setFrameRoles, setTopLevel } = await import("@/core/study-edit");
  const steps: Array<() => ReturnType<typeof setTopLevel>> = [
    () => setTopLevel(text, "name", name),
    () => setTopLevel(text, "slug", slug),
    () => setTopLevel(text, "question", String(formData.get("question") ?? "")),
    () => setBrandField(text, "sponsor_line", String(formData.get("sponsor_line") ?? "")),
    () => setFrameRoles(text, formData.getAll("roles").map(String)),
    () => setFeature(text, "ai_followup", formData.get("ai_followup") === "on"),
    () => setFeature(text, "panel", formData.get("panel") === "on"),
  ];
  // The interview can be turned off; turning it on needs the template's guide to exist.
  const wantInterview = formData.get("ai_interview") === "on";
  const parsedTemplate = parseStudy(text);
  if (parsedTemplate.ok && parsedTemplate.study.features.ai_interview !== wantInterview) {
    steps.push(() => setFeature(text, "ai_interview", wantInterview));
  }
  for (const step of steps) {
    const result = step();
    if (!result.ok) return back(result.problem);
    text = result.text;
  }

  const created = await createStudy(text);
  if ("problem" in created) return back(created.problem);
  await record("study_created", { slug: created.slug, from: dir, brief: true });
  revalidatePath("/console/studies");
  redirect(`/console/studies/${created.slug}/brief`);
}

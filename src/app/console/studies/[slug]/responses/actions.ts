"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isSignedIn } from "@/lib/auth";
import { record } from "@/lib/activity";
import { setReview } from "@/db/queries/analysis";

/**
 * Include or exclude one response. An exclusion needs a reason in the operator's own words,
 * because that reason is printed in the methods note and read by whoever checks the work.
 */
export async function reviewResponse(_prev: string | null, form: FormData): Promise<string | null> {
  if (!(await isSignedIn())) redirect("/console/login");

  const slug = String(form.get("slug") ?? "");
  const responseId = String(form.get("response_id") ?? "");
  const decision = String(form.get("decision") ?? "");
  const reason = String(form.get("reason") ?? "").trim();

  if (decision === "excluded" && reason.length < 3) {
    return "Say why, in a few words. This reason appears in the methods note.";
  }
  if (!["included", "excluded", "pending"].includes(decision)) return "Unknown decision.";

  try {
    await setReview(responseId, decision as "included" | "excluded" | "pending", reason || null);
  } catch {
    return "Could not save that. The database did not answer.";
  }

  await record("response_reviewed", { slug, responseId, decision, reason: reason || null });
  revalidatePath(`/console/studies/${slug}/responses`);
  revalidatePath(`/console/studies/${slug}/results`);

  return decision === "excluded"
    ? "Excluded, and the reason will appear in the methods note."
    : decision === "included"
      ? "Kept in the analysis."
      : "Put back on the pile.";
}

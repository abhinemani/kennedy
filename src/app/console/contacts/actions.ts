"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isSignedIn } from "@/lib/auth";
import { record } from "@/lib/activity";
import { applyMapping, missingColumns, parseCsv, type Mapping } from "@/core/csv";
import {
  commitBatch, discardBatch, loadRegistry, matchReviewRow, saveProfile, skipReviewRow, stageImport,
} from "@/db/queries/contacts";

async function requireOperator() {
  if (!(await isSignedIn())) redirect("/console/login");
}

const MAX_BYTES = 25 * 1024 * 1024;

async function readUpload(form: FormData, field = "file"): Promise<{ text: string } | { problem: string }> {
  const file = form.get(field);
  if (!(file instanceof File) || file.size === 0) {
    return { problem: "Choose a CSV file to upload." };
  }
  if (file.size > MAX_BYTES) {
    return { problem: "That file is larger than 25 MB. Split it and upload the parts one at a time." };
  }
  return { text: await file.text() };
}

// ---------------------------------------------------------------- registry

export async function uploadRegistry(_prev: string | null, form: FormData): Promise<string | null> {
  await requireOperator();

  const read = await readUpload(form);
  if ("problem" in read) return read.problem;

  const { headers, rows, malformed } = parseCsv(read.text);
  if (rows.length === 0) {
    return "That file has a header but no rows we could read.";
  }
  if (!headers.includes("name") || !headers.includes("state") || !headers.includes("type")) {
    return `The registry file needs columns called name, state and type. This one has: ${headers.join(", ")}.`;
  }

  try {
    const result = await loadRegistry(rows);
    await record("registry_uploaded", { added: result.added, updated: result.updated });
    revalidatePath("/console/contacts/registry");
    revalidatePath("/console");

    const parts = [
      `${result.added.toLocaleString("en-US")} governments added`,
      `${result.updated.toLocaleString("en-US")} updated`,
    ];
    if (malformed.length) parts.push(`${malformed.length} rows had the wrong number of columns and were left out`);
    if (result.skipped.length) {
      const first = result.skipped[0]!;
      parts.push(`${result.skipped.length} rows were skipped, the first on line ${first.line}: ${first.reason}`);
    }
    return `${parts.join(". ")}.`;
  } catch {
    return "Could not save the registry. The database did not answer. Check the first line of the setup checklist.";
  }
}

// ---------------------------------------------------------------- contact import

export async function stageContacts(_prev: string | null, form: FormData): Promise<string | null> {
  await requireOperator();

  const read = await readUpload(form);
  if ("problem" in read) return read.problem;

  const { headers, rows, malformed } = parseCsv(read.text);
  if (rows.length === 0) return "That file has a header but no rows we could read.";

  const mapping: Mapping = {};
  for (const [key, value] of form.entries()) {
    if (key.startsWith("map_") && typeof value === "string" && value) {
      mapping[key.slice(4)] = value;
    }
  }

  if (!mapping.email) {
    return `Say which column holds the email address. This file has: ${headers.join(", ")}.`;
  }
  const missing = missingColumns(headers, mapping);
  if (missing.length) {
    return `This file has no column called ${missing.join(" or ")}. Pick again from: ${headers.join(", ")}.`;
  }

  const profileName = String(form.get("profile_name") ?? "").trim();
  if (profileName) await saveProfile(profileName, mapping);

  const batch = randomUUID();
  await stageImport(batch, rows.map((r) => applyMapping(r, mapping)));
  await record("import_staged", { batch, rows: rows.length, malformed: malformed.length });
  redirect(`/console/contacts/import/${batch}`);
}

export async function confirmImport(_prev: string | null, form: FormData): Promise<string | null> {
  await requireOperator();
  const batch = String(form.get("batch") ?? "");
  const listName = String(form.get("list_name") ?? "").trim();
  const source = String(form.get("source") ?? "").trim() || "upload";
  const licenseScope = String(form.get("license_scope") ?? "owner_only");

  if (!listName) return "Give this list a name, so the audience screen can say where these people came from.";

  try {
    const result = await commitBatch(batch, listName, source, licenseScope);
    await record("import_committed", { batch, ...result });
    revalidatePath("/console/contacts");
    revalidatePath("/console");
    redirect(`/console/contacts/lists?imported=${result.imported}&duplicates=${result.duplicates}&review=${result.needsReview}`);
  } catch (err) {
    if (err instanceof Error && err.message.includes("NEXT_REDIRECT")) throw err;
    return "Could not finish the import. Nothing was changed. Try again, and if it keeps failing, check Settings, Health.";
  }
}

export async function cancelImport(form: FormData): Promise<void> {
  await requireOperator();
  const batch = String(form.get("batch") ?? "");
  const { removed } = await discardBatch(batch);
  await record("import_discarded", { batch, removed });
  redirect(`/console/contacts/import?discarded=${removed}`);
}

// ---------------------------------------------------------------- the review queue

export async function matchRow(_prev: string | null, form: FormData): Promise<string | null> {
  await requireOperator();
  const rowId = String(form.get("row_id") ?? "");
  const entityId = String(form.get("entity_id") ?? "");
  if (!entityId) return "Pick a government from the list first.";

  const ok = await matchReviewRow(rowId, entityId, "needs_review", String(form.get("license_scope") ?? "owner_only"));
  await record("import_row_matched", { rowId, entityId, added: ok });
  revalidatePath("/console/contacts/review");
  return ok ? "Matched, and the contact was added." : "Matched, but that email was already on file, so nothing was added.";
}

export async function skipRow(form: FormData): Promise<void> {
  await requireOperator();
  const rowId = String(form.get("row_id") ?? "");
  await skipReviewRow(rowId);
  await record("import_row_skipped", { rowId });
  revalidatePath("/console/contacts/review");
  redirect("/console/contacts/review");
}

"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isSignedIn } from "@/lib/auth";
import { record } from "@/lib/activity";
import { applyMapping, missingColumns, parseCsv, type Mapping } from "@/core/csv";
import { decodeUpload, describeEncoding, type Decoded } from "@/core/encoding";
import { describeCensusParse, looksLikeCensusFile, parseCensusUnits } from "@/core/census";
import {
  commitBatch, discardBatch, loadRegistry, matchReviewRow, saveProfile, skipReviewRow, stageImport,
} from "@/db/queries/contacts";

async function requireOperator() {
  if (!(await isSignedIn())) redirect("/console/login");
}

const MAX_BYTES = 25 * 1024 * 1024;

async function readUpload(
  form: FormData,
  field = "file",
): Promise<{ text: string; encoding: Decoded["encoding"] } | { problem: string }> {
  const file = form.get(field);
  if (!(file instanceof File) || file.size === 0) {
    return { problem: "Choose a file to upload." };
  }
  if (file.size > MAX_BYTES) {
    return { problem: "That file is larger than 25 MB. Split it and upload the parts one at a time." };
  }
  // Not every supplier export is UTF-8, and reading one as if it were turns "Ureña" into
  // something that will never match the registry again.
  return decodeUpload(new Uint8Array(await file.arrayBuffer()));
}

// ---------------------------------------------------------------- registry

export async function uploadRegistry(_prev: string | null, form: FormData): Promise<string | null> {
  await requireOperator();

  const read = await readUpload(form);
  if ("problem" in read) return read.problem;

  // The Census publishes the government units list as a fixed-width text file, not a CSV.
  // Making the operator convert it first is exactly the command-line work rule 10 forbids.
  if (looksLikeCensusFile(read.text)) {
    const parse = parseCensusUnits(read.text);
    if (parse.governments.length === 0) {
      return "That looks like a Census unit file, but no government records could be read from it.";
    }
    try {
      const result = await loadRegistry(
        parse.governments.map((g) => ({
          geoid: g.geoid,
          name: g.name,
          state: g.state,
          type: g.type,
          population: g.population === null ? "" : String(g.population),
          annual_budget: "",
          county: g.county ?? "",
          email_domain: "",
        })),
      );
      await record("registry_uploaded", { source: "census", added: result.added, updated: result.updated });
      revalidatePath("/console/contacts/registry");
      revalidatePath("/console");

      const notes = [
        `${result.added.toLocaleString("en-US")} governments added, ${result.updated.toLocaleString("en-US")} updated.`,
        describeCensusParse(parse),
        parse.skipped.length
          ? `${parse.skipped.length} records were set aside; the first, on line ${parse.skipped[0]!.line}: ${parse.skipped[0]!.reason}`
          : null,
        describeEncoding(read.encoding),
      ].filter(Boolean);
      return notes.join(" ");
    } catch {
      return "Could not save the registry. The database did not answer. Check the first line of the setup checklist.";
    }
  }

  const { headers, rows, malformed } = parseCsv(read.text);
  if (rows.length === 0) {
    return "That file has a header but no rows we could read.";
  }
  if (!headers.includes("name") || !headers.includes("state") || !headers.includes("type")) {
    return `The registry file needs columns called name, state and type, or it can be the Census unit file as published. This one has: ${headers.join(", ")}.`;
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
    const encodingNote = describeEncoding(read.encoding);
    return `${parts.join(". ")}.${encodingNote ? ` ${encodingNote}` : ""}`;
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

  // One role for the whole file, when the supplier ships one list per role. It beats mapping
  // a column whose values are theirs, not ours.
  const fileRole = String(form.get("file_role") ?? "").trim();

  const batch = randomUUID();
  await stageImport(
    batch,
    rows.map((r) => {
      const mapped = applyMapping(r, mapping);
      // Suppliers usually give a first and last name, not one full name.
      if (!mapped.full_name) {
        const both = [mapped.first_name, mapped.last_name].filter(Boolean).join(" ").trim();
        if (both) mapped.full_name = both;
      }
      if (fileRole) mapped.role = fileRole;
      return mapped;
    }),
  );
  await record("import_staged", { batch, rows: rows.length, malformed: malformed.length, fileRole: fileRole || null });
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

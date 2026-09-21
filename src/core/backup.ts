// The full backup: every table as a CSV the operator can open anywhere, zipped.
//
// It exists because Railway's Postgres has no point-in-time restore. The rows are written as
// they are, identity and all, because a backup that leaves things out is not one; the
// anonymised files are the study exports, and this is not that.

import { makeZip, type ZipEntry } from "./zip";

type Row = Record<string, unknown>;

function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text =
    value instanceof Date
      ? value.toISOString()
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** One table as CSV. The header is the union of every column seen, in first-seen order. */
export function tableToCsv(rows: Row[]): string {
  const columns: string[] = [];
  const seen = new Set<string>();
  for (const row of rows)
    for (const key of Object.keys(row))
      if (!seen.has(key)) {
        seen.add(key);
        columns.push(key);
      }
  const lines = [columns.join(",")];
  for (const row of rows) lines.push(columns.map((c) => cell(row[c])).join(","));
  return lines.join("\r\n") + "\r\n";
}

export type BackupTable = { name: string; rows: Row[] };

/** The zip: one CSV per table, plus a note saying when it was taken and what is in it. */
export function backupZip(tables: BackupTable[], at = new Date()): Uint8Array {
  const entries: ZipEntry[] = tables.map((t) => ({ name: `${t.name}.csv`, body: tableToCsv(t.rows) }));
  const manifest = [
    `Kennedy full backup, taken ${at.toISOString()}.`,
    "",
    "One CSV per table. Every row is included, identifying fields and all, so keep this file",
    "where the contact list itself would be kept.",
    "",
    ...tables.map((t) => `${t.name}.csv: ${t.rows.length.toLocaleString("en-US")} rows`),
    "",
  ].join("\n");
  return makeZip([{ name: "README.txt", body: manifest }, ...entries], at);
}

export function backupFilename(at = new Date()): string {
  return `kennedy-backup-${at.toISOString().slice(0, 19).replace(/[:T]/g, "-")}.zip`;
}

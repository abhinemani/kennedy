import { isSignedIn } from "@/lib/auth";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { backupFilename, backupZip, type BackupTable } from "@/core/backup";
import { record } from "@/lib/activity";

// The full backup, as a download. Every table, every row, one CSV each, zipped without
// compression by src/core/zip.ts. Railway's Postgres has no point-in-time restore, so this
// is the copy that lives somewhere else.

export const dynamic = "force-dynamic";

const TABLES = [
  "entities", "contacts", "contactLists", "contactListMembers", "importRows", "mappingProfiles",
  "suppressions", "studies", "studyVersions", "studyContacts", "messages", "linkEvents",
  "responses", "answers", "freeText", "followups", "interviews", "interviewTurns",
  "panelMembers", "handRaises", "codebookThemes", "textCodes", "benchmarkSeeds", "settings",
  "activityLog",
] as const;

const snake = (s: string) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

export async function GET() {
  if (!(await isSignedIn())) return new Response("Sign in first.", { status: 401 });

  const tables: BackupTable[] = [];
  for (const name of TABLES) {
    const table = (schema as Record<string, unknown>)[name];
    if (!table) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (await db().select().from(table as any)) as Record<string, unknown>[];
    tables.push({ name: snake(name), rows });
  }

  const at = new Date();
  const zip = backupZip(tables, at);
  await record("backup_downloaded", { tables: tables.length, rows: tables.reduce((n, t) => n + t.rows.length, 0) });

  return new Response(new Uint8Array(zip), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${backupFilename(at)}"`,
      "cache-control": "no-store",
    },
  });
}

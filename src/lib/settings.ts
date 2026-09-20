import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { settings } from "@/db/schema";
import { DEFAULT_BREAKER } from "@/core/breaker";

// Settings the operator edits in the console. Never secrets: those are environment
// variables set in the Railway dashboard.

export type Settings = {
  linkDomain: string | null;
  postalAddress: string | null;
  replyTo: string | null;
  sendProvider: string;
  perInboxDailyLimit: number;
  contactHistoryWindowDays: number;
  bounceRate: number;
  complaintRate: number;
};

export const DEFAULT_SETTINGS: Settings = {
  linkDomain: null,
  postalAddress: null,
  replyTo: null,
  sendProvider: "dryrun",
  perInboxDailyLimit: 200,
  contactHistoryWindowDays: 90,
  bounceRate: DEFAULT_BREAKER.bounceRate,
  complaintRate: DEFAULT_BREAKER.complaintRate,
};

const KEY = "console";

export async function readSettings(): Promise<Settings> {
  try {
    const rows = await db().select().from(settings).where(eq(settings.key, KEY)).limit(1);
    const stored = rows[0]?.value;
    if (!stored || typeof stored !== "object") return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...(stored as Partial<Settings>) };
  } catch {
    // The checklist reports an unreachable database on its own line; every other screen
    // falls back to defaults rather than showing a stack trace.
    return DEFAULT_SETTINGS;
  }
}

export async function writeSettings(next: Settings): Promise<void> {
  await db()
    .insert(settings)
    .values({ key: KEY, value: next })
    .onConflictDoUpdate({ target: settings.key, set: { value: next, updatedAt: new Date() } });
}

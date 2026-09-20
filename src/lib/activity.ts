import { desc } from "drizzle-orm";
import { db } from "@/db/client";
import { activityLog } from "@/db/schema";

// One place writes the log, so Settings, Activity can be trusted to be complete.
export async function record(action: string, detail?: Record<string, unknown>): Promise<void> {
  try {
    await db().insert(activityLog).values({ action, detail: detail ?? null });
  } catch {
    // Never fail the operator's action because the log could not be written.
  }
}

export async function recentActivity(limit = 100) {
  try {
    return await db().select().from(activityLog).orderBy(desc(activityLog.createdAt)).limit(limit);
  } catch {
    return [];
  }
}

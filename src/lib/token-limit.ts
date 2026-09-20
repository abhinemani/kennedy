import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { linkEvents } from "@/db/schema";

// Rate limiting for token routes, kept in the database so it holds across instances.
// It counts recent link events for this link, which is what an abuser would be generating.
export async function tooManyRecently(studyContactId: string, max: number, windowMinutes: number): Promise<boolean> {
  const since = new Date(Date.now() - windowMinutes * 60 * 1000);
  const rows = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(linkEvents)
    .where(and(eq(linkEvents.studyContactId, studyContactId), gte(linkEvents.createdAt, since)));
  return (rows[0]?.n ?? 0) >= max;
}

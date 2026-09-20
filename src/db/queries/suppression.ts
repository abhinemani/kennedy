import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { suppressions } from "@/db/schema";

export type Reason = "unsubscribed" | "bounced" | "complaint" | "manual";

/** A global suppression holds across every study. Suppressing twice is not an error. */
export async function suppressEmail(email: string, reason: Reason): Promise<void> {
  const address = email.trim().toLowerCase();
  const existing = await db()
    .select()
    .from(suppressions)
    .where(and(eq(suppressions.email, address), isNull(suppressions.studyId)))
    .limit(1);
  if (existing[0]) return;
  await db().insert(suppressions).values({ email: address, scope: "global", reason });
}

export async function isSuppressed(email: string): Promise<boolean> {
  const rows = await db()
    .select({ id: suppressions.id })
    .from(suppressions)
    .where(eq(suppressions.email, email.trim().toLowerCase()))
    .limit(1);
  return rows.length > 0;
}

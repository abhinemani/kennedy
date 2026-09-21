import { sql } from "drizzle-orm";
import { db, checkDatabase } from "@/db/client";
import { entities } from "@/db/schema";
import { buildChecklist, EXAMPLE_PASSPHRASE, type Check } from "@/core/health";
import { env } from "./env";
import { readSettings } from "./settings";

async function countEntities(): Promise<number> {
  try {
    const rows = await db().select({ n: sql<number>`count(*)::int` }).from(entities);
    return rows[0]?.n ?? 0;
  } catch {
    return 0;
  }
}

export async function checklist(): Promise<Check[]> {
  const [database, current, registryEntities] = await Promise.all([
    checkDatabase(),
    readSettings(),
    countEntities(),
  ]);
  const passphrase = env.operatorPassphrase();
  return buildChecklist({
    databaseReachable: database.reachable,
    databaseError: database.reachable ? null : database.message,
    passphraseSet: passphrase !== null && passphrase.length > 0,
    passphraseIsExample: passphrase === EXAMPLE_PASSPHRASE,
    linkDomain: current.linkDomain,
    postalAddress: current.postalAddress,
    replyTo: current.replyTo,
    registryEntities,
    sendProvider: current.sendProvider,
    instantlyKeySet: env.instantlyKey() !== null,
    instantlyWebhookSet: current.instantlyWebhookId !== null,
    anthropicKeySet: env.anthropicKey() !== null,
    anthropicModel: env.anthropicModel(),
  });
}

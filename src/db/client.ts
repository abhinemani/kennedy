import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// One connection per process. Neon's pooled URL is what the Vercel integration sets.
let client: ReturnType<typeof postgres> | null = null;

function connection() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  if (!client) client = postgres(url, { max: 1, idle_timeout: 20, onnotice: () => {} });
  return client;
}

export function db() {
  return drizzle(connection(), { schema });
}

export type DatabaseHealth = { reachable: true } | { reachable: false; message: string };

export async function checkDatabase(): Promise<DatabaseHealth> {
  if (!process.env.DATABASE_URL) {
    return { reachable: false, message: "DATABASE_URL is not set." };
  }
  try {
    await connection()`select 1`;
    return { reachable: true };
  } catch (err) {
    return { reachable: false, message: err instanceof Error ? `${err.message}.` : "The database did not answer." };
  }
}

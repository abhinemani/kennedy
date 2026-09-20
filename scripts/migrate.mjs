// Runs pending migrations during the Vercel build, before the app starts.
// Forward-only and safe to run twice: Drizzle records each applied migration in its
// journal table and skips the ones already there.
//
// If this exits non-zero the build fails and Vercel keeps serving the previous
// deployment, so a bad migration never takes the site down.
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;

if (!url) {
  console.error(
    [
      "",
      "Cannot run migrations: DATABASE_URL is not set.",
      "",
      "In the Vercel dashboard, open this project, then Storage, and add the Neon",
      "Postgres integration. It sets DATABASE_URL for you. Then redeploy.",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

const sql = postgres(url, { max: 1, onnotice: () => {} });

try {
  await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
  console.log("Migrations are current.");
} catch (err) {
  console.error("\nA migration failed. The previous deployment keeps serving.\n");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  await sql.end({ timeout: 5 });
}

import type { Config } from "drizzle-kit";

// Migrations are generated here by Claude Code and committed to the repo.
// They are applied by Railway's pre-deploy step; the operator never runs a command.
export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  strict: true,
} satisfies Config;

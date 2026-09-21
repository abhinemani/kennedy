// Secrets live only in environment variables (spec section 13). Nothing here is ever
// rendered to a page; the console reports whether a value is present, never what it is.
export const env = {
  databaseUrl: () => process.env.DATABASE_URL ?? null,
  operatorPassphrase: () => process.env.OPERATOR_PASSPHRASE ?? null,
  sessionSecret: () => process.env.SESSION_SECRET ?? null,
  ipHashSalt: () => process.env.IP_HASH_SALT ?? null,
  anthropicKey: () => process.env.ANTHROPIC_API_KEY ?? null,
  anthropicModel: () => process.env.ANTHROPIC_MODEL ?? null,
  sendWebhookSecret: () => process.env.SEND_WEBHOOK_SECRET ?? null,
  instantlyKey: () => process.env.INSTANTLY_API_KEY ?? null,
};

export const PRODUCT_NAME = "Kennedy";

/**
 * Which build is running. Railway sets these during the build, and without them "is my fix
 * deployed?" is only answerable by guessing.
 */
export function buildInfo(): { commit: string | null; deployedAt: string | null } {
  const commit = process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.GIT_COMMIT_SHA ?? null;
  return {
    commit: commit ? commit.slice(0, 7) : null,
    deployedAt: process.env.RAILWAY_DEPLOYMENT_CREATED_AT ?? null,
  };
}

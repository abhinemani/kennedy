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
};

export const PRODUCT_NAME = "Kennedy";

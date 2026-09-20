// The setup checklist. Every line says what is missing and where to fix it, because the
// operator never opens a terminal (rule 10). Pure: the console gathers the facts, this
// decides what they mean.

export type CheckState = "ok" | "todo";

export type Check = {
  id: string;
  label: string;
  state: CheckState;
  detail: string;
  fix: { label: string; href: string } | null;
};

export type HealthFacts = {
  databaseReachable: boolean;
  databaseError: string | null;
  passphraseSet: boolean;
  passphraseIsExample: boolean;
  linkDomain: string | null;
  postalAddress: string | null;
  replyTo: string | null;
  registryEntities: number;
  sendProvider: string | null;
  anthropicKeySet: boolean;
  anthropicModel: string | null;
};

const VERCEL_ENV_HREF = "https://vercel.com/dashboard";

export function buildChecklist(f: HealthFacts): Check[] {
  const checks: Check[] = [];

  checks.push(
    f.databaseReachable
      ? {
          id: "database",
          label: "Database reachable and migrations current",
          state: "ok",
          detail: "Connected, and every migration in this deployment has been applied.",
          fix: null,
        }
      : {
          id: "database",
          label: "Database reachable and migrations current",
          state: "todo",
          detail:
            (f.databaseError ?? "The database did not answer.") +
            " Add the Neon Postgres integration in the Vercel dashboard under Storage, then redeploy.",
          fix: { label: "Open the Vercel dashboard", href: VERCEL_ENV_HREF },
        },
  );

  checks.push(
    !f.passphraseSet
      ? {
          id: "passphrase",
          label: "Operator passphrase set",
          state: "todo",
          detail:
            "OPERATOR_PASSPHRASE is not set, so no one can sign in. Set it in the Vercel dashboard under Settings, Environment Variables, then redeploy.",
          fix: { label: "Open the Vercel dashboard", href: VERCEL_ENV_HREF },
        }
      : f.passphraseIsExample
        ? {
            id: "passphrase",
            label: "Operator passphrase set",
            state: "todo",
            detail:
              "The passphrase is still the example value from the documentation. Change it in the Vercel dashboard under Settings, Environment Variables, then redeploy.",
            fix: { label: "Open the Vercel dashboard", href: VERCEL_ENV_HREF },
          }
        : {
            id: "passphrase",
            label: "Operator passphrase set",
            state: "ok",
            detail: "Set, and not the example value.",
            fix: null,
          },
  );

  checks.push(
    f.linkDomain
      ? {
          id: "link_domain",
          label: "Survey link domain confirmed",
          state: "ok",
          detail: `Survey links will read ${f.linkDomain}/s/… and unsubscribe links ${f.linkDomain}/u/…`,
          fix: null,
        }
      : {
          id: "link_domain",
          label: "Survey link domain confirmed",
          state: "todo",
          detail:
            "No domain saved yet, so links in email would point nowhere. Enter the address people will see in their email.",
          fix: { label: "Settings", href: "/console/settings" },
        },
  );

  const addressMissing = [
    f.postalAddress ? null : "a postal address",
    f.replyTo ? null : "a reply-to address",
  ].filter(Boolean);

  checks.push(
    addressMissing.length === 0
      ? {
          id: "addresses",
          label: "Postal address and reply-to address entered",
          state: "ok",
          detail: "Both are set, so every email can carry them.",
          fix: null,
        }
      : {
          id: "addresses",
          label: "Postal address and reply-to address entered",
          state: "todo",
          detail: `Still need ${addressMissing.join(" and ")}. Every email must carry a postal address, and sending is blocked without one.`,
          fix: { label: "Settings", href: "/console/settings" },
        },
  );

  checks.push(
    f.registryEntities > 0
      ? {
          id: "registry",
          label: "Registry loaded",
          state: "ok",
          detail: `${f.registryEntities.toLocaleString("en-US")} governments in the registry.`,
          fix: null,
        }
      : {
          id: "registry",
          label: "Registry loaded",
          state: "todo",
          detail:
            "No governments yet. Upload the government units file so imported contacts have something to match against.",
          fix: { label: "Contacts, Registry", href: "/console/contacts/registry" },
        },
  );

  checks.push(
    f.sendProvider
      ? {
          id: "provider",
          label: "Send provider chosen",
          state: "ok",
          detail:
            f.sendProvider === "dryrun"
              ? "Dry run: messages are logged and nothing leaves the system."
              : `Sending through ${f.sendProvider}.`,
          fix: null,
        }
      : {
          id: "provider",
          label: "Send provider chosen",
          state: "todo",
          detail: "Not chosen yet. Dry run is the safe default and sends nothing.",
          fix: { label: "Settings", href: "/console/settings" },
        },
  );

  checks.push(
    f.anthropicKeySet && f.anthropicModel
      ? {
          id: "ai",
          label: "AI follow-up key present",
          state: "ok",
          detail: `A key is set and the model is ${f.anthropicModel}. The AI follow-up stays off until a study switches it on.`,
          fix: null,
        }
      : {
          id: "ai",
          label: "AI follow-up key present",
          state: "todo",
          detail: !f.anthropicKeySet
            ? "ANTHROPIC_API_KEY is not set. The survey works without it; only the AI follow-up needs it. Set it in the Vercel dashboard under Settings, Environment Variables."
            : "ANTHROPIC_MODEL is not set, so there is no model to ask. Set it in the Vercel dashboard under Settings, Environment Variables.",
          fix: { label: "Open the Vercel dashboard", href: VERCEL_ENV_HREF },
        },
  );

  return checks;
}

export function checklistReady(checks: Check[]): boolean {
  return checks.every((c) => c.state === "ok");
}

// The passphrase the documentation uses as an example. Refusing it is a check, not a rule
// about strength: a real one is the operator's business.
export const EXAMPLE_PASSPHRASE = "change-me";

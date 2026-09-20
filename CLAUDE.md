# Kennedy

Kennedy is a purpose-built tool for surveying local governments. One operator
(Abhi) runs research studies against a shared registry of government entities and contacts.
It is built only for the public sector and grows into a standing panel of officials. The first
study is a public records workload survey for Brandeis; later studies cover other
government technology topics with no new code, only a new study created in the console.

Read these before writing code, in this order:

0. `docs/PRODUCT.md` for why this exists, how people can respond, and the trust rules
1. `docs/SPEC.md` for what the product is and the rules it must obey
2. `docs/NO_TERMINAL.md` for how the operator runs everything from the browser
3. `docs/BUILD_PLAN.md` for milestones, acceptance criteria, and the pilot gate
4. `docs/KERNEL.md` for the code that already exists in `src/core` and `src/db`
5. `templates/brandeis-records-2026/study.yaml` for the worked example every feature must support
6. `docs/prototype.html` for the look, the respondent flow, and the console layout
7. `docs/HANDOFF.md` for where the build actually stands right now, and what to pick up next

## What already exists

`src/core` is the kernel: pure TypeScript with no framework in it, covered by
`tests/kernel.test.ts`, `tests/modalities.test.ts`, and `tests/health.test.ts`. It holds the
rules of the product (study validation, branching, plausibility, benchmark, weighting,
audience lists, touch audiences, the circuit breaker, the AI follow-up, coding and AI
interview contracts, the spine and stages, email rendering, tokens, the setup checklist, CSV
reading, entity resolution, the stratified draw, weighted analysis, the methods note, and
surgical edits to a study file).
`src/db/schema.ts` is the Drizzle schema. Build the app around the kernel. Do not reimplement
its logic in routes or components; call it. If a rule must change, change the kernel and its
test first.

The Next.js app around it is built through Milestones 0 to 9 (5, 10 and 11 remain). `docs/HANDOFF.md` is the current state
of play: what works, what is deferred, and what Milestone 1 still needs from the operator.

Layout:

- `src/core`, `src/db/schema.ts` — the kernel and the schema. Framework-free.
- `src/db/queries/*` — SQL per screen. No rules live here.
- `src/lib/*` — auth, settings, the activity log, request safety, benchmark peers.
- `src/app/console/*` — the operator console, behind one passphrase.
- `src/app/s/[token]/*`, `src/app/u/[token]/*` — the respondent pages. Server-rendered.
- `e2e/*` — Playwright, at 390px, on WebKit.

## Stack

- Next.js (App Router) with TypeScript in strict mode, deployed on Railway from GitHub
- Postgres (Railway's own Postgres service) with Drizzle ORM and checked-in migrations
- Zod for every request body; the study schema is already in the kernel
- Vitest for unit tests, Playwright for the respondent flow at a 390px viewport
- Anthropic SDK for the AI follow-up. Read the model name from `ANTHROPIC_MODEL`; check the
  current Anthropic docs for a small, fast model and do not hardcode one.

Keep dependencies few. No UI kit. Port the CSS tokens and components from the prototype,
including its light and dark themes.

## Rules that are easy to break and must not be

1. Loading a link never changes state. Government email gateways fetch every URL in a message.
   A GET may record a `loaded` event and nothing else. "Opened" means a person pressed Start,
   which is a POST. Unsubscribe needs a confirming POST.
2. Tokens are 128 bits of randomness, base64url. Never sequential, never derived from an ID.
   One completed response per token.
3. Respondent text is data. The AI follow-up has no tools, capped input, validated output,
   a timeout, and a scripted fallback. Nothing a respondent types is ever treated as an instruction.
4. Quality flags never delete or exclude anything on their own. The operator reviews; exclusions
   carry a reason and appear in the methods note.
5. Free text lives apart from identifying fields. Default exports are anonymized.
6. The AI follow-up and the AI interview are only valid on the native engine. The kernel
   enforces it; the console explains it when unavailable.
7. No email leaves the system unless the contact passes suppression, contact history, and the
   circuit breaker. The default send provider is `dryrun`.
8. Make no security or compliance claims anywhere in the product or its pages that are not
   literally true today. No SOC 2, HIPAA, or similar language.
9. Every response stores the study version it answered. Published versions are immutable.
10. The operator never needs a terminal. Anything the operator does day to day, and anything
    needed to set up or recover the app, happens in the browser: the Kennedy console, the
    Railway dashboard, or GitHub's website. If a feature would require a command, it is not done.

11. Every way of responding opens with the study's spine of closed questions. No spine, no
    comparable numbers.
12. The trust wall holds. Contact details are never shared, lists never mix across license
    scopes, a sponsor reaches an official only through that official's hand-raise, and only an
    official's own choice adds them to the panel.

## Working agreement

- Work one milestone at a time. At the end of each, run the tests, list what was built against
  the acceptance criteria, list what was deferred, and stop for review.
- When something in the spec is ambiguous or listed under "Open items," ask before assuming.
- Prefer boring, legible code. Server-render the respondent pages and keep client JavaScript light.
- Seed data must be obviously fake. Never commit real contacts, real emails, or list exports.
- Error messages in the console are written for the operator: what happened, and what to click next.

## Interface copy

Sentence case. No all-caps labels. Buttons say what happens ("Record my response", and the
confirmation says "Response recorded"). Respondent-facing text reads at about an eighth-grade
level, never sells, and never uses internal terms like token, stratum, or engine. Errors say
what happened and what to do next.

## Developer commands (for Claude Code and CI only, never the operator)

`npm run dev`, `npm test`, `npm run typecheck`, `npm run e2e`. Migrations run automatically
in Railway's pre-deploy step, so there is no migrate command for a person to run.

The database-backed tests need a local Postgres: `docker compose up -d postgres`, then
`npm run migrate`. They skip themselves when `DATABASE_URL` is not set, so never let a green
run fool you: check that the console and survey projects actually ran. Schema changes are
generated with `npm run db:generate` and the result is committed.

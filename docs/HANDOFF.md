# Where the build stands

Last updated after Milestone 3. Read this after `CLAUDE.md` and before picking anything up.
`docs/BUILD_PLAN.md` is still the plan; this says which parts of it are real.

## Done

**Milestone 0.** Next.js around the kernel, without moving it. Railway deploy from GitHub with
migrations in the pre-deploy step, the operator login, the setup checklist, Settings, the
activity log, the prototype's design tokens in both themes, CI, and the Playwright harness.

**Milestone 2.** "New study" from a template, the study editor with live problems from
`parseStudy`, publish to an immutable version, the preview that records nothing, and the whole
respondent flow: intro, one question per screen, branching, plausibility prompts, autosave,
"that is not me", completion, and unsubscribe.

**Milestone 3.** The benchmark page, the strip plot, the end screen driven by `afterSurvey`,
hand-raise capture with domain matching, and the panel invitation.

61 unit tests and 24 end-to-end tests pass. Typecheck and build are clean.

## Not done, and where it bites

**Milestone 1 is skipped.** There is no registry, no contact import, no needs-review queue, no
audience screen, and no stratified draw. Nothing can be sent to a real person until it exists,
because there are no real contacts to send to. It is the next thing to build.

In its place, the study screen has **"Create a rehearsal link"**, which makes a token pointed at
an obviously fake government named `Test City (not a real government)`. That is how the survey
gets walked today. It is not a substitute for the draw.

**Two open items still block Milestone 1**, both from section 14 of the spec:

1. A real Power Almanac export header, so the `power-almanac` column-mapping profile can be
   built rather than guessed.
2. The registry seed file — Census government units joined to population. Population is not
   optional: the strata are population bands, so a government without one cannot be sampled.

**Also not built:** the AI follow-up (Milestone 5, and the "Test it" button on the checklist
with it), sending and suppression beyond the unsubscribe path (Milestone 4), the console's
analytics, review queue and exports (Milestone 6), open-text coding (7), the AI interview
stage (8), the form-based editor (9), the SurveyMonkey adapter (10), and the API send provider
(11). "Download full backup" does not exist yet, and matters more than its milestone number
suggests: Railway's Postgres has no point-in-time restore.

## Things worth knowing before you change something

**The plausibility prompt is a screen of its own.** Answering keeps the number and records the
confirmation under an internal `__confirmed_<id>` key; "Let me change it" returns to the
question and records nothing. Internal keys are stripped by `respondentAnswers` before anything
reaches the kernel, an export, or an analysis.

**Choice options keep their own type.** `hours` options are numbers in the study file. Forms
only carry strings, so `readAnswer` maps a submitted string back to the option's real value. If
that breaks, `volume * hours` silently produces nothing and the benchmark goes blank.

**Every respondent POST checks the origin**, except the RFC 8058 one-click unsubscribe, which is
cross-origin by design and lives on its own route with a comment saying so.

**The console writes to one settings row and one study**, so the Playwright projects run
serially with one worker. Do not re-enable `fullyParallel` without giving each spec its own
data.

**The database-backed specs skip themselves** when `DATABASE_URL` is unset. A green run that
skipped them proves nothing; check that the `console` and `survey` projects actually ran.

## Running it locally

```
docker compose up -d postgres
npm run migrate
npm run dev
```

`.env.local` needs `DATABASE_URL`, `OPERATOR_PASSPHRASE`, `SESSION_SECRET`, and `IP_HASH_SALT`.
`.env.example` lists them. For the end-to-end suite, the same variables must be exported in the
shell that runs `npm run e2e`.

## What is not yet proven

The app has never run on Railway. Migrations, the pre-deploy step, and the health check are all
verified against a local Postgres and in CI, but the first real deploy is still the first real
deploy. `docs/DEPLOY.md` is the six-step path.

`surveys.ethoslabs.us` has never sent mail. That needs SPF, DKIM, DMARC and two to three weeks
of warming, and no amount of code shortens it.

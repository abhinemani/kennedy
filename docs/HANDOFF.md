# Where the build stands

Last updated after Milestone 4. Read this after `CLAUDE.md` and before picking anything up.
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

**Milestone 1.** Registry upload, contact import with click-to-match column profiles and a
preview, saved mapping profiles, the needs-review queue, the Lists screen, the Panel screen,
and the reproducible stratified draw with token minting.

**Milestone 4.** The Follow-ups screen: who is due each touch and every reason the rest are
not, the email preview, the dry-run and merge-file providers, the daily throttle, the pause
switch, the circuit breaker, and the provider webhook that feeds suppression.

108 unit tests and 48 end-to-end tests pass. Typecheck and build are clean.

## What Milestone 1 still needs from the operator

The screens are built and tested against obviously fake fixtures. Two things from section 14 of
the spec are still needed before a real import:

1. **A real Power Almanac export header.** The mapping is click-to-match, so nothing is
   guessed, but the `power-almanac` profile ships empty until a real header is seen. Paste the
   first line of an export and it becomes a saved profile.
2. **The registry file.** Census government units joined to population. Population is not
   optional: the strata are population bands, so a government without one cannot be sampled.
   The expected columns are listed on the Registry screen itself.

The study screen also still has **"Create a rehearsal link"**, which makes a token pointed at an
obviously fake government named `Test City (not a real government)`. It is how the survey gets
walked on a phone without drawing anyone real.

**Not built:** the AI follow-up (Milestone 5, and the "Test it" button on the checklist
with it), the console's analytics, review queue and exports (Milestone 6), open-text coding (7), the AI interview
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
skipped them proves nothing; check that the `console`, `survey` and `contacts` projects
actually ran.

**Staged imports hold real names and emails.** A previewed import lives in `import_rows` until
it is committed or discarded. Discarding removes it at once, and anything still pending after a
day is swept when the Import screen is opened, because closing the tab is the common case and
no button can catch it.

**The draw sorts its stratum keys** so the same seed always produces the same sample. Screens
that show strata re-sort them into the study file's band order, because alphabetical keys put
"Under 10,000" last.

**Hints are not inside labels.** A hint nested in a `<label>` becomes part of the field's
accessible name, so a screen reader announces "Full name Optional." and two fields whose hints
share a word become indistinguishable. Hints are siblings, tied on with `aria-describedby`.

**The sign-in throttle counts failures, not attempts.** Counting every attempt locks out an
operator who signs in from a second tab.

**The circuit breaker is a latch, not a gate.** It trips when a provider reports a bounce or a
complaint, writes its reason onto the study, and stays tripped until the operator resumes.
Re-judging it on every page load, which is how it was first written, meant Resume did nothing:
the same history blocked again immediately. The recent rates are shown beside the switch, so
resuming past a hot one is an informed choice, and what was overridden goes in the activity log.

**A delivery report finds its message by the provider's id**, and two messages must never share
one. The dry-run provider used to number from zero on every batch, so one bounce could mark
unrelated emails as bounced. Ids now carry a per-batch prefix and a unique index enforces it.
The webhook also accepts a report keyed by `studyContactId` and `touch`, because an operator
sending a merge file has no provider id to quote back — that is what the file carries.

**`SEND_WEBHOOK_SECRET` guards the webhook.** It is the one route a third party posts to.
Unset, it refuses everything, which is the right default.

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

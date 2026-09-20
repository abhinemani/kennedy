# Where the build stands

Read this after `CLAUDE.md` and before picking anything up. `docs/BUILD_PLAN.md` is still the
plan; this says which parts of it are real, what is decided, and what is waiting on the
operator.

## In one paragraph

Kennedy is built through Milestone 9 of 11, tested end to end, and deployed to Railway at
`https://kennedy-production-ad97.up.railway.app` with its database attached and its secrets
set. The registry and contact import both work against the operator's real Census and Power
Almanac files. Nothing has been emailed to anyone, and no real contact has ever been loaded
into a deployed database.

## The state of the deployment

Set up on 2026-09-20 from the Railway dashboard: a Postgres service, `DATABASE_URL` on the
Kennedy service as the reference `${{Postgres.DATABASE_URL}}`, `OPERATOR_PASSPHRASE`,
`SESSION_SECRET`, `IP_HASH_SALT`, `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL`. The setup
checklist shows the database reachable and migrations current. Still to do there, all from the
console: the survey link domain, the postal and reply-to addresses, and the registry upload
(`Fin_PID_2022.txt` from inside the Census zip; the picker takes the text file, not the zip).
`SEND_WEBHOOK_SECRET` is unset and only Milestone 4's delivery reports need it.

One thing to watch: the first deploy served even though the migrate script exits non-zero
without a database, which suggests Railway did not run the pre-deploy command from
`railway.json`. Check the deploy log for "Migrations are current." after any schema change; if
it is missing, set the pre-deploy command by hand in the service's Settings.

`docs/DEPLOY.md` has the numbered steps, plus what to check when a page fails.

## Done

**Milestone 0.** Next.js around the kernel. Railway deploy from GitHub with migrations in the
pre-deploy step, operator login, the setup checklist, Settings, the activity log, the
prototype's design tokens in both themes, CI, Playwright.

**Milestone 1.** Registry upload, contact import with click-to-match column profiles and a
preview, saved mapping profiles, the needs-review queue, the Lists and Panel screens, and the
reproducible stratified draw with token minting.

**Milestone 2.** "New study" from a template, the study editor with live problems from
`parseStudy`, publish to an immutable version, a preview that records nothing, and the whole
respondent flow: intro, one question per screen, branching, plausibility prompts, autosave,
"that is not me", completion, unsubscribe.

**Milestone 3.** The benchmark page, the strip plot, the end screen driven by `afterSurvey`,
hand-raise capture with domain matching, the panel invitation.

**Milestone 4.** Follow-ups: who is due each touch and every reason the rest are not, the email
preview, the dry-run and merge-file providers, the daily throttle, the pause switch, the
circuit breaker, and the provider webhook that feeds suppression.

**Milestone 5.** The AI follow-up: the route, the disclosure, the logging, and the checklist's
"Test it" button. It ships switched off and needs no key to stay out of the way.

**Milestone 6.** Funnel, coverage and weights, weighted estimates with n, effective n and a
margin of error, the review queue, every export as a download, and the generated methods note.

**Milestone 7.** Codebook editing, AI-suggested themes accepted or changed by clicking, the
double-coded sample, and the agreement figure. Coding by hand needs no API key.

**Milestone 8.** The AI interview: scripted opening, validated model turns with a scripted
fallback, stop conditions the model does not control, transcripts stored apart from identity,
the console's Interviews screen.

**Milestone 9.** The form view of the study editor, writing the same file as the Advanced view.

Outside the milestone list: the Census government units file is read as published, a
dependency-free zip writer for the full backup, error pages that fail kindly, and **sample
data**: Settings, Sample data, "Load sample data" fills every table with obviously fake,
marked records (`src/core/sample-data.ts` generates them from the study file, deterministically;
`src/db/queries/sample-data.ts` writes and removes them), and "Remove sample data" deletes
exactly those. It exists so every screen can be seen full before a real list is loaded.

269 unit tests and 87 end-to-end tests pass, in CI as well as locally. Typecheck and build are clean.

## Not done

- **Milestone 10, the SurveyMonkey adapter.** Blocked on a decision: whether the fallback is
  wanted at all, and whether the operator's plan has custom variables, a redirect end page, and
  API access to responses.
- **Milestone 11, the API send provider.** Blocked on which platform is chosen.
- **"Download full backup."** The zip writer and its tests exist in `src/core/zip.ts`; what is
  left is gathering the CSVs and wiring the button on Settings, Health. This matters more than
  its milestone number suggests: Railway's Postgres has no point-in-time restore.

## What the operator still has to decide or supply

1. **The clerk list from Power Almanac.** The June 2024 delivery has Finance, IT, Purchasing,
   Top Appointed and Deputy Appointed. The Brandeis frame is clerk, records officer, manager,
   attorney, IT — so that export covers IT and manager and nothing else. The study's own email
   copy addresses clerks and records officers. Either that list arrives, or the frame changes to
   the roles on hand.
2. **The postal address and reply-to address.** Sending is blocked without a postal address.
3. **Which sending platform.** Milestone 11, and the send itself.
4. **Benchmark seed values by population band.** Until they exist, early respondents are told
   they are among the first rather than shown a comparison, which is the whole incentive.
5. **Whether the pilot date holds.** `surveys.ethoslabs.us` has never sent mail: SPF, DKIM,
   DMARC and two to three weeks of warming is the floor. This is the longest pole by far.
6. **Brandeis copy.** The template's sponsor line, intro and email bodies are marked DRAFT and
   are the operator's to write.

Settled already: the product is **Kennedy**, respondent links live on **surveys.ethoslabs.us**,
and the host is **Railway**.

## Things worth knowing before changing something

**The plausibility prompt is a screen of its own.** Answering keeps the number and records the
confirmation under an internal `__confirmed_<id>` key; "Let me change it" returns to the
question and records nothing. Internal keys are stripped by `respondentAnswers` before anything
reaches the kernel, an export, or an analysis.

**Choice options keep their own type.** `hours` options are numbers in the study file. Forms
only carry strings, so `readAnswer` maps a submitted string back to the option's real value. If
that breaks, `volume * hours` silently produces nothing.

**Every respondent POST checks the origin**, except the RFC 8058 one-click unsubscribe, which is
cross-origin by design and lives on its own route.

**A margin of error carries its units.** `Estimate.moeKind` is `absolute` for a mean and
`percentage_points` for a share. Rendering one as the other produced "give or take 1,789
percent" on a request volume, which is why the distinction is typed rather than remembered.

**A band's `target` in the study file is contacts to draw, not completes.** Comparing responses
against it flagged every band as under-responding forever. Coverage now flags a band when its
weight shows it under-represented among respondents.

**Every model call has a deadline it cannot overrun.** `withDeadline` races the work as well as
aborting the signal, because a client that ignores its abort would otherwise hold a page a
respondent is waiting on.

**The circuit breaker is a latch, not a gate.** It trips on a provider report, writes its reason
onto the study, and stays until the operator resumes. Re-judging it on every page load meant
Resume did nothing at all.

**A delivery report finds its message by the provider's id**, and two messages must never share
one. The webhook also accepts a report keyed by `studyContactId` and `touch`, because an
operator sending a merge file has no provider id to quote back.

**The form editor never re-serialises the study file.** Parsing and writing it back changes 325
of 373 lines. Edits splice only the lines they were asked to change, and the form refuses to
work on a file that does not already parse.

**Supplier files are not reliably UTF-8**, and their role labels are their own, comma-separated,
several per person. Both are handled in `src/core/encoding.ts` and `src/core/supplier-roles.ts`.
Without the role mapping every imported contact lands in "other".

**Over a thousand township names repeat inside one state.** Entities carry their county, and the
designator in a name ("City of Waukesha" against "Waukesha Village") breaks the remaining ties.

**Hints are not inside labels.** A hint nested in a `<label>` becomes part of the field's
accessible name, so a screen reader says "Full name Optional."

**The e2e specs share one study.** Anything that rewrites it borrows it at the start and gives it
back at the end, the way `e2e/edit.spec.ts` does.

**The database-backed specs skip themselves** when `DATABASE_URL` is unset. A green run that
skipped them proves nothing; check that the `console`, `survey`, `contacts`, `sending`,
`results`, `themes`, `interviews` and `edit` projects actually ran.

## Running it locally

```
docker compose up -d postgres
npm run migrate
npm run dev
```

`.env.local` needs `DATABASE_URL`, `OPERATOR_PASSPHRASE`, `SESSION_SECRET` and `IP_HASH_SALT`;
`.env.example` lists them all. The end-to-end suite needs the same variables exported in the
shell that runs `npm run e2e`.

`e2e/real-files.spec.ts` runs against the operator's own Census and Power Almanac files when
`KENNEDY_CENSUS_FILE` and `KENNEDY_POWER_ALMANAC_FILE` point at them, and skips itself
otherwise. Nothing from those files is ever committed, and nothing from them belongs in a
transcript.

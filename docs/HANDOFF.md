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

**The console redesign** (after Milestone 9). The operator console is a workspace rather than a
phone column: a rail on the left (Home, Studies, Contacts, Settings, Activity, with a count on
Contacts when rows need review), a wide content column, flatter surfaces, real tables, status
pills, and stat tiles set in Newsreader. Every study screen sits under one header (name, status,
version, counts) with tabs: Overview, Edit, Sample, Follow-ups, Results, Responses, Themes,
Interviews, Exports. The study's first screen is now an **overview**: one line saying what to do
next with a button, four tiles, the funnel, coverage by band, versions and status. The whole-file
editor with publishing and the rehearsal link moved to `/console/studies/[slug]/file`; Edit
carries a Form / Whole file / Preview switch. Responses is a review queue: the list on the left,
the response being judged on the right, "Next flagged" to move on. Home shows what is waiting
across every fielding study (people due an email, flagged responses, hand-raises, rows to match)
and falls back to the setup checklist until there is a study. The styles are scoped under
`.console` in `globals.css`; the respondent pages are untouched. Two packages came in for this:
`lucide-react` for the rail's icons and Next's own `next/font` to self-host the two typefaces.
At phone width the rail becomes a top bar and every two-column layout stacks.

**The design pass** (2026-09-20, branch `design-overhaul`). `src/app/globals.css` is now one
system rather than a port: tokens for type, space, radius, elevation and motion; a focus ring
that is the same everywhere; hover, press and entrance motion that switches off under
`prefers-reduced-motion`; `color-scheme` so native controls follow the theme; and the
interview's chat styles, which had never been ported. Respondent pages are the page on a
phone (no card, no margins) and a letter on the ground from 560px up, with a "3 of 16" line
under the progress bar, a check mark on the chosen answer, and the intro's Start button on
its own line. The console has a three-way theme switch in the rail (system, light, dark;
stored in the browser and applied before first paint from `src/app/layout.tsx`), a favicon,
a styled file picker, and "New study" as the top bar's one action. Loading skeletons were
tried and taken out: the e2e specs count what is on screen the instant a page loads, and a
skeleton in that instant made the exclusion test skip itself.

**The second design pass** (2026-09-20, branch `design-b2b`), measured against the best
B2B interfaces rather than against the prototype. The console now uses one typeface, the
grotesk, with tabular figures; Newsreader is reserved for the respondent pages. Cards and
tiles lost their borders and shadows: `.card`, `.panel` and `.stat` are bare, structure comes
from spacing and hairlines, and only objects you open (a study card, the review queue, a
list) keep an edge. Colour means something: the accent sits on the primary action, the
selection and links; amber marks only the words that need the operator. Status pills are a
dot and a word. The study header carries each fact once, the overview no longer repeats it,
and the page eyebrows are gone. A study's screens sit behind a Results / Run switch
(`tabs.tsx`), and "New study" leaves the top bar inside a study. On the respondent side the
question screens settle rather than fade in from nothing, the label under the bar says how
long is left instead of a count that shifts with branching, a number field shows its unit,
the slider records nothing until it is moved (an untouched thumb used to become 30 percent)
and offers "Not sure" through `allow_unknown`, and the benchmark is the biggest thing on its
screen: the respondent's figure at 58px, the headline, then a taller strip with the middle
half of peers shaded. **The end of the survey changed order.** The last question leads to a
short record screen ("That is every question", the quote permission, Record my response);
recording marks the response complete and shows the benchmark; the report, pilot and panel
boxes then have their own "Save my choices" press (`saveChoices`), remembered under the
internal `__choices_saved` key so they are asked once. A benchmark metric may carry a `unit`
the end screen prints beside the number.

**The third design pass** (2026-09-20, branch `design-solid`), measured against Qualtrics and
SurveyMonkey for how solid the product feels. Tabular figures are now used only where numbers
sit in columns, because in this typeface they gave the comma a digit's width and "1,771" read
as "1 , 771". Label-and-count lists (`.rows`) are bounded to 640px so a count stays near its
label. The contacts Lists screen is a table, one row per list, empty ones muted; the rows keep
the `.list` class the contacts spec selects on. Browser tab titles read "Findings · Public
records workload · Kennedy" (`metadata` on every console page, `generateMetadata` in the study
layout). A 2px bar along the top of the console (`nav-progress.tsx`) acknowledges a press until
the next screen arrives; it listens for clicks on console links and clears on the route change,
or after eight seconds. The report keeps a sheet around it and its bars print with their
colour. The respondent intro shows the study's display name as a masthead, and a line with the
question count, the minutes, and "No account needed".

**The sponsor's view** (after the console redesign). The console is now organised around the
questions a sponsor asks, with the mechanics one group of tabs over. New study is a **brief**:
the question, who is asking, which lists to ask, how deep to go, and what that should yield
(reach, expected completes, margin), all written into the study file through the kernel's
surgical edits (`setTopLevel`, `setBrandField`, `setFeature`, `setFrameRoles` in
`src/core/study-edit.ts`; the planning rules of thumb live in `src/core/plan.ts`). A study file
may carry a top-level `question:`; the worked example has one. Each study has five sponsor
screens: **Overview** (how it is going, what is next), **Brief** (the question, who is asking,
who is asked, how deep, and every survey question with its evidence line), **Findings**
(headline numbers with margins, what people chose, themes with anonymous quotes, each with what
it proves), **Leads** (hand-raises by type with verification, panel joins), and **Report** (a
print-ready document with the methods note). The "Running it" group keeps Sample, Follow-ups,
Responses, Themes, Interviews, Edit and Downloads. Home and Studies show each study as a card:
its question, progress toward the expected answers, and its counts. `quotesFor` and
`panelJoinsFor` are the two new queries. The visual system is heavier than the first pass:
a top bar with breadcrumbs, cards with headers and elevation, stat tiles with eyebrow labels,
drawn bar charts, definition lists, pull quotes, and a print stylesheet for the report.

270 unit tests and 87 end-to-end tests pass, in CI as well as locally. Typecheck and build are clean.

## Not done

- **Milestone 10, the SurveyMonkey adapter.** Blocked on a decision: whether the fallback is
  wanted at all, and whether the operator's plan has custom variables, a redirect end page, and
  API access to responses.

**Milestone 11 is built for Instantly** (2026-09-20, branch `pilot-plumbing`). The operator
chose a cold-outreach platform because the list is purchased with third-party consent, which
every transactional sender's terms still refuse. `src/core/instantly.ts` is the pure part: a
message is named `instantly:<campaign>:<email>` so a delivery report finds it without a lookup;
each touch maps to one single-step Instantly campaign whose template is `{{subject}}` and
`{{body}}`, named by `campaign:` on the touch in the study file; the webhook translation turns
`email_sent` and `email_bounced` into statuses and `lead_unsubscribed` into a suppression
rather than a complaint. `src/lib/providers/instantly.ts` does the HTTP: one lead per message
with the rendered email as variables and `skip_if_in_campaign`, and `registerWebhook`, which
Settings calls from "Connect delivery reports" with the shared secret as a header. The
checklist's provider line knows the three states (no key, key but not connected, connected),
and Follow-ups refuses with the touch named when a campaign id is missing. The Instantly
request and webhook shapes were taken from its v2 documentation index and webhook guide; the
lead-creation page itself could not be fetched, so the first real send should be watched.

**"Download full backup" is wired** (same branch). `src/core/backup.ts` turns every table into
a CSV and `src/core/zip.ts` zips them with a README; the route is
`/console/settings/backup` and the button sits under Settings, Backup. It includes identity, on
purpose: it is the copy that lives somewhere other than Railway.

## What the operator still has to decide or supply

1. **The clerk list from Power Almanac.** The June 2024 delivery has Finance, IT, Purchasing,
   Top Appointed and Deputy Appointed. The Brandeis frame is clerk, records officer, manager,
   attorney, IT — so that export covers IT and manager and nothing else. The study's own email
   copy addresses clerks and records officers. Either that list arrives, or the frame changes to
   the roles on hand.
2. **The postal address and reply-to address.** Sending is blocked without a postal address.
3. **Instantly.** Sign up, order pre-warmed inboxes, make three campaigns, turn tracking off, paste the key into Railway, press Connect on Settings, and put each campaign id on its touch in the study file. Then the send itself.
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

**The session cookie is Secure only over https.** It is decided from the request, not from
`NODE_ENV`: a production build also serves CI and a local `npm run start` over plain http, and
WebKit on Linux drops a Secure cookie set over http, which signed the operator out on the very
next request. That was why the console and survey specs failed on every CI run while passing on
a Mac. When a CI run fails now, the `playwright-results` artifact on the run holds the page
text, screenshot and trace Playwright kept.

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

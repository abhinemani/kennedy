# Build plan

The order is set by one fact: the Brandeis study must start its 50-contact pilot in about ten
days and its full field a few days later. Milestones 0 through 5 get the pilot out. Everything
after that can trail, because answers are safely stored from the first response.

The kernel in `src/core` already exists and is tested (see `KERNEL.md`). Each milestone wires
part of it into the app. Every milestone also has to satisfy rule 10: if the operator would
need a terminal to use what was built, it is not done.

Finish each milestone by running tests, reporting against its acceptance criteria, listing
anything deferred, and stopping for review.

## Milestone 0: foundation and first deploy

Add Next.js around the kernel without moving it. Database connection, migrations generated
from `src/db/schema.ts` and run automatically in the Vercel build, the operator login, the
setup checklist, Settings, the activity log, and the prototype's design tokens in both themes.

Done when: a push to GitHub deploys to Vercel and creates the tables with no manual step; the
first visit shows the setup checklist with accurate states; kernel tests still pass in CI; a
failed migration fails the build and leaves the previous deployment serving.

## Milestone 1: registry, import, sample, tokens

Registry upload, contact import with click-to-match column profiles and a preview (each
import becomes a named list with its source and license scope), the needs-review queue, the
Lists screen and the audience screen built on `lists.ts`, the reproducible stratified draw, and
token minting. Add entity resolution and the draw to the kernel with tests.

Done when: the audience screen shows Power Almanac's thirteen lists and any others with
accurate counts, and the running total matches the draw; all of it is done from the console; importing the same file twice creates no
duplicates; a draw with the same seed returns the same sample; the Sample screen shows counts
per band and every skip reason before the operator confirms.

## Milestone 2: study editor and the native survey

"New study" (audience, then "How can they answer?", then a template), the text editor with live problems from `parseStudy`, survey
preview, publish with a change summary, and the respondent flow with autosave, branching,
plausibility prompts, the correction form, and quality flags.

Done when: the operator can create the Brandeis study from its template, fix a deliberately
broken line using only the on-screen message, preview, and publish; a Playwright test completes
the survey at 390px in both themes; closing the tab keeps the partial response; a GET to a
survey link changes nothing but a `loaded` event; a second completion on a token is refused.

## Milestone 3: benchmark and hand-raise

The benchmark page from `benchmark.ts`, the strip plot, seed values editable in the console,
the end screen driven by `afterSurvey`, hand-raise capture, the panel invitation, domain
matching, and the verification message through the provider interface.

Done when: the page matches the prototype's layout and wording pattern; peers switch from seeds
to real responses at the configured count; returning to a completed link shows the benchmark.

## Milestone 4: sending and suppression

The Follow-ups screen driven by `audience.ts`, email preview, the dry-run provider, "Download
CSV" for mail-merge, unsubscribe with confirmation and one-click POST, throttles, the pause
switch, and the circuit breaker.

Done when: before any touch the console shows who will receive it and how many were left out
for each reason; a completer never appears in a later touch; an unsubscribe GET alone changes
nothing; simulated bounces above the threshold pause sending with a readable reason; sending
is blocked while the study still contains CHANGE_ME placeholders.

## Milestone 5: AI follow-up

The follow-up route over `followup.ts`, the disclosure copy, logging, and the "Test it" button
on the health checklist.

Done when: tests cover a normal answer, an answer containing instructions aimed at the model,
an overlong answer, a timeout, and a disabled flag. It can ship switched off without blocking
the pilot.

## Pilot gate

Do not send the pilot until every line holds.

- [ ] The Brandeis study completes cleanly on an iPhone and an Android phone, light and dark
- [ ] Partial responses survive a closed tab
- [ ] A link-scanner simulation (GET every URL in the email) changes no state
- [ ] Unsubscribe works and holds globally
- [ ] Every email has one link, a postal address, and an unsubscribe link, in plain text
- [ ] Audience counts and exclusion reasons look right to the operator
- [ ] The privacy page is live and accurate
- [ ] The setup checklist is all green, and "Download full backup" works
- [ ] The operator has run the whole pilot rehearsal without opening a terminal
- [ ] The same questions exist as a draft in SurveyMonkey as a fallback

## Milestone 6: console analytics and exports

Funnel, coverage and weights, the review queue, weighted estimates with n, effective n, and
margin of error, download buttons for every export, and the generated methods note.

Done when: entity-level metrics count each government once; excluded responses leave the
estimates and appear in the methods note; the anonymized export has no names, emails, or
entity names.

## Milestone 7: open-text coding

Codebook editing, AI-suggested themes with confidence, accept or change by clicking, the
double-coded sample, and the agreement figure.

## Milestone 8: the AI interview stage

The interview screen over `interview.ts`: invitation by the stage's condition and cap, the
scripted opening, model turns with validation and scripted fallback, stop conditions, the
disclosure, transcripts stored apart from identity, the Interviews screen, and coding against
the study's codebook. Bring in prompts and lessons from the operator's Cronkite project where
he provides them.

Done when: tests cover a normal conversation, instructions aimed at the model, invalid model
output (the next scripted topic is asked), the turn cap, the clock, and "stop"; an interview
can be switched off per study without touching the survey; nothing about it works on the
SurveyMonkey engine, and the console says why.

This can move ahead of Milestones 6 and 7 if the operator wants interviews during the first
study. The survey must be through its pilot first.

## Milestone 9: form-based study editor

Editing question text and options, reordering, show-if from dropdowns, the email sequence, and
sample targets, all reading and writing the same study text as the Advanced view.

## Milestone 10: SurveyMonkey engine

The adapter described in the spec, connected from Settings, with plan checks that explain what
is missing and a checklist of any logic to set by hand in SurveyMonkey.

## Milestone 11: API send provider

An adapter for the cold-outreach platform the operator chooses, connected from Settings, with
webhooks feeding suppression and the circuit breaker.

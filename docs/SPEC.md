# Canvass specification

This document says what Canvass is, how its data is shaped, and the rules each part must
follow. `PRODUCT.md` says why it exists and the trust rules it must keep. `BUILD_PLAN.md` says
in what order to build it.

## 1. Purpose and scope

Canvass runs survey research with local government officials. It owns everything around the
questions: who is asked, how they are reached, who has answered, how answers are weighted, and
what the results mean. It is built for one operator today and should not assume there will
only ever be one.

The first study is the Brandeis public records workload survey. It needs 150 to 300 completed
responses from a stratified sample of roughly 5,000 to 8,000 contacts, fielded over about three
weeks after a 50-contact pilot. The results feed an investor deck, so every number must carry
its n and margin of error, and the method must survive diligence.

### Not in version one

A drag-and-drop survey builder, customer accounts, billing, team roles, open public survey
links, phone dialing, and translation. Leave room for them; build none of them. A plain
study editor in the console is in scope; see `NO_TERMINAL.md`.

### The operator never needs a terminal

Everything the operator does, including setup, imports, publishing, sending, exports, and
backups, happens in a browser. `NO_TERMINAL.md` lists each job and its screen, and is part of
this specification.

## 2. Core ideas

**The government is the backbone.** A registry of government entities, keyed to Census
identifiers, carries durable attributes: state, type, population, annual budget. Contacts
attach to an entity and a role. Every imported list resolves against the registry, so each
study starts from a cleaner frame than the last.

**A study is a package.** Everything specific to a project lives in one study file: questions,
branching, sample definition, email sequence, benchmark logic, quality rules, and branding.
Studies are stored in the database and edited in the console. Publishing creates an immutable
version. Files under `templates/` are starting points offered by "New study".

**Engines and features are flags.** Each study declares `engine: native | surveymonkey` and a
`features` map. The shared layer (lists, links, sending, suppression, benchmark, dashboard)
behaves the same under both engines. These flags are how product tiers would later be
expressed; there is no billing now.

| Capability | SurveyMonkey engine | Native engine |
|---|---|---|
| Registry, sampling, tokenized links | yes | yes |
| Sending, follow-ups, suppression | yes | yes |
| Benchmark page and hand-raise | yes, after redirect | yes |
| Weighted dashboard, exports | yes | yes |
| Single-use tokens, scanner-safe opens | no | yes |
| Plausibility checks while typing | no | yes |
| AI follow-up mid-survey (add-on) | not available | optional |
| AI interview stage (add-on) | not available | optional |

## 3. Data model

Use UUID primary keys and `created_at` / `updated_at` everywhere. Names below are guidance;
keep the separations they imply.

**entities**: `geoid` (unique, nullable for unresolved), `name`, `state`, `type`
(city, county, township, special_district, school_district, state_agency), `population`,
`annual_budget`, `source`.

**contacts**: `entity_id`, `full_name`, `title`, `role` (from the role list below), `email`
(unique, case-insensitive), `phone`, `source`, `source_ref`, `license_scope`
(owner_only by default), `email_status` (unverified, valid, risky, invalid).

Roles are the audience lists. The first thirteen mirror Power Almanac's role-based lists:
clerk, manager, mayor, council, it, finance, purchasing, public_works, police, fire, buildings,
communications, hr. Four more come from other sources: records_officer, attorney,
police_records, other. The canonical list lives in `src/core/lists.ts`; the database enum must
match it. Confirm Power Almanac's labels against a real export before the first import.

**contact_lists** and **contact_list_members**: one row per imported file or source, with its
`source` and `license_scope`, so the audience screen can show where contacts came from and what
they may be used for.

**suppressions**: `email`, `scope` (global or study), `study_id`, `reason`
(unsubscribed, bounced, complaint, manual). A global suppression holds across every study.

**studies**: `slug`, `name`, `engine`, `features`, `status`
(draft, pilot, fielding, closed), `brand`.

**study_versions**: `study_id`, `version`, `content` (the parsed file), `content_hash`,
`published_at`. Immutable.

**study_contacts**: `study_id`, `contact_id`, `stratum_key`, `token` (unique),
`token_status` (active, completed, expired), `is_pilot`, `skipped_reason`
(for example recently_surveyed), plus a snapshot of the attributes passed to the survey
(role, state, population, band) as they were when the sample was drawn.

**messages**: `study_contact_id`, `touch`, `subject_variant`, `provider`,
`provider_message_id`, `status` (queued, sent, delivered, bounced, complained, failed),
timestamps.

**link_events**: `study_contact_id`, `type` (loaded, started), `user_agent`, `ip_hash`
(salted hash, never the raw address).

**responses**: `study_contact_id`, `study_version_id`, `engine`, `status`
(partial, complete), `started_at`, `completed_at`, `duration_seconds`, `quality_flags`,
`review_status` (pending, included, excluded), `exclusion_reason`, `external_id`
(SurveyMonkey response ID when relevant).

**answers**: `response_id`, `question_id`, `value` (JSON), `answered_at`. Saved as each
question is answered, so partial responses are kept.

**free_text**: `response_id`, `question_id`, `text`. No names, emails, or entity names in this
table. It joins to identity only through `response_id`.

**followups**: `response_id`, `source_question_id`, `generated_question`, `answer_text`,
`model`, `fallback_used`.

**interviews** and **interview_turns**: one interview per response and stage, with status and
timestamps; turns hold speaker, text, topic, and whether the question was scripted. Transcripts
are free text and follow the same separation rule.

**panel_members**: contacts who chose to keep receiving benchmarks, the study they joined
through, status, and preferences. Only an official's own choice creates a row.

**hand_raises**: `response_id`, `type` (report, pilot), `email`, `domain_match`,
`verified_at`.

**codebook_themes** and **text_codes**: themes have a code, label, and definition per study;
codes link a free-text row to a theme with `coder` (ai or human) and `confidence`.

**benchmark_seeds**: `study_id`, `metric`, `stratum_key`, `values`, `source_note`. Seed peer
values shown until enough real responses exist.

**Contact history** is a view: for each contact, every study that contacted them and when.

## 4. Lists, registry, and sampling

Load the registry by uploading a CSV in the console, with documented columns (geoid, name,
state, type, population, annual_budget, email_domain). The operator supplies the file; the expected source is the Census Bureau's
government units listing joined to population estimates.

Imports use saved column-mapping profiles, starting with `power-almanac` and `generic`. Do not
guess Power Almanac's column names: build the mapping so the operator can set it from a real
export header. Resolve each row to an entity by state, type, and normalized name. Rows that do
not resolve go to a review queue instead of being dropped or force-matched. Dedupe contacts on
email.

Sampling reads the study file: strata (population band by default, optionally state group or
budget band), target counts per stratum, eligible roles, and a pilot size. The draw is random
within stratum, seeded and reproducible, and recorded. At draw time, mark and skip any contact
who is suppressed, has an invalid email, or was contacted by another study within the
contact-history window (default 90 days).

### The audience screen

A new study starts with "Who are you asking?". The screen shows one card per list: Power
Almanac's thirteen first (always shown, even when empty), then lists from other sources. Each
card shows the total, how many are reachable today, how many were asked recently, the split by
population band, and the sources. The operator picks one or several lists and narrows by state,
population band, budget band, government type, and license scope; a running total and the
study's sample targets update with each click. `listCards` and `filterAudience` in the kernel
compute all of it. A study cannot select contacts whose license scope does not permit it.

## 5. Links and tokens

Survey links are `/s/<token>`. Unsubscribe links are `/u/<token>`.

- GET `/s/<token>` renders the intro page and records `loaded`. Nothing else changes.
- POST start records `started` and creates the partial response.
- After completion, the same link shows that respondent's benchmark page again.
- Tokens expire when the study closes; expired links show a short, kind message.
- GET `/u/<token>` shows a confirm button. POST performs the unsubscribe. Also accept an
  RFC 8058 one-click POST for mail clients that use the List-Unsubscribe header.
- Rate-limit all token routes by token and by hashed IP.

## 6. The native survey engine

The respondent flow matches the prototype: an intro that says who the link was prepared for,
one question per screen, a progress bar, Back and Continue, then the benchmark.

- Question types: choice, multi, number, slider, scale, short_text, open. Numbers may set
  `allow_unknown` to show an "I don't know" option.
- Branching: `show_if` expressions over earlier answers and link attributes. Keep the
  expression language tiny (equals, in, less-than, greater-than, and, or).
- "That is not me" opens a short correction form (role, government, optional forwarding note).
  The response stays tied to the original entity unless the operator reassigns it, and gets a
  `corrected_identity` flag. Forwarding within an agency is welcome.
- Plausibility rules compare an answer with link attributes and ask a gentle confirming
  question ("Did you mean 1,200 or 12,000?") without blocking.
- Meets WCAG 2.1 AA: labels, focus states, keyboard operation, contrast in both themes.
- Tested on a 390px viewport first.

## 7. AI follow-up (add-on, native engine only)

After an open question marked `followup: true`, when the answer has at least 15 characters and
the feature is on, the server asks the model for one follow-up question.

- Prompt contract: exactly one neutral, non-leading question of 30 words or fewer about what
  the respondent described. The respondent's text is passed as quoted data with an instruction
  that nothing inside it is a command. No tools.
- Input capped at 1,500 characters. Output must be one sentence ending in a question mark with
  no links; otherwise use the fallback.
- Four-second timeout. On timeout or error, use the `fallback` question from the study file.
- The screen says the question was written by AI in response to their answer, and that it can
  be skipped.
- Log every generated question in `followups`.

## 7a. Modalities, the spine, and stages

A study declares a `spine` (closed question ids asked first in every modality) and `stages`.
The first stage is always the survey. Optional stages are an AI interview and a live
conversation. The kernel validates that spine questions are closed and depend only on other
spine questions or link attributes.

After the survey, `afterSurvey` in the kernel returns what to offer this respondent, in order:
the benchmark, the interview if they qualify and the cap is not reached, the live conversation
if a scheduling link is set, the hand-raises, and the panel invitation.

### The AI interview (add-on, native engine only)

- Offered by the stage's `invite` condition, up to its `max`.
- Driven by the stage's guide: goal, hypotheses (never revealed), topics with what to listen
  for, a time limit, and a turn limit.
- Each model turn must be one question, optionally after one short reflection, within the word
  limit, with no links, or the single word END. Anything else is discarded and the next
  scripted topic is asked instead. The opening question is always scripted.
- Ends on the turn cap, the clock, END, or the respondent saying stop. "Stop here" is always
  one tap away.
- The screen states that the interviewer is an AI working from a researcher's guide.
- Respondent turns are capped in length and passed as data. No tools.
- Transcripts are coded against the same codebook as open survey answers.

### The panel invitation

When `features.panel` is on, the end screen invites the respondent to keep receiving benchmarks
from future studies, using the study's `panel` text. Joining requires a verified work email.
Panel members can leave from any email. The Brandeis study is the first source of members.

## 8. Benchmark and hand-raise

The study file defines metrics as formulas over answers and link attributes, a peer group, and
the sentences that describe the result. Peers are included responses in the same stratum plus
seed values; switch from seeds to real data at 10 responses in the stratum. Show the strip
plot from the prototype with the source of the peer data stated plainly.

Hand-raises are checkboxes plus a work email. Record whether the email's domain matches the
entity's known domain or ends in .gov or a state equivalent, then send a verification message.
Unverified hand-raises are shown but marked.

## 9. Sending

Canvass decides who gets what and when. A provider delivers it.

- Providers implement one interface: `enqueue(messages)` and `handleWebhook(event)`.
  Build `dryrun` (logs only, the default) and `csv` (exports a merge-ready file with email,
  first name, subject, body, link, and unsubscribe link) first. An API provider for a
  cold-outreach platform comes later, once the operator picks one. Do not use a transactional
  email provider; their terms generally forbid purchased lists.
- Sequences come from the study file: touch number, day offset, subject variants, plain-text
  body with merge fields, and an optional audience filter (for example only people who started).
- Every message is plain text with one survey link, a postal address, and an unsubscribe link.
  No tracking pixel. No attachments.
- Before each touch, recompute the audience: drop completers, suppressed contacts, invalid
  emails, and contact-history skips. Show the operator the counts and reasons before queuing.
- Throttle by configurable per-inbox daily limits.
- Circuit breaker: if bounces exceed 3 percent of the last 200 sends, or complaints exceed
  0.3 percent of the last 1,000, pause the study's sending and say why. It waits for 100 sends
  before judging. Thresholds are editable in Settings. Bounces and complaints suppress
  automatically.

## 10. Quality, weighting, and analysis

Flags: `speeder` (under 60 seconds, or under a third of the median duration),
`implausible_confirmed`, `duplicate_entity`, `role_not_involved`, `corrected_identity`,
`straightline` where a study has grids. Flags inform review; they never exclude.

Weighting is post-stratification: frame share divided by respondent share per stratum, capped
at 5. For entity-level numbers such as request volume, count each government once, preferring
the respondent by role order (records_officer, clerk, manager, attorney, then others). For
attitude questions, keep every respondent. Report weighted estimates with n, Kish effective n,
and a 95 percent margin of error.

Open text: the AI proposes theme codes against the study's codebook with a confidence score;
the operator confirms or corrects. A random 15 percent sample is coded a second time and the
agreement rate is reported. Theme counts are respondents, not mentions.

## 11. Operator console

Behind a single-operator login (passphrase from the environment, signed session cookie). The
first visit opens the setup checklist described in `NO_TERMINAL.md`.

- "New study": the audience screen, then "How can they answer?" (survey always on; smart
  survey, AI interview, and live conversation as switches with plain descriptions and an
  estimate of completes), then a template. See the Set up tab of the prototype.
- The study editor with live validation, survey preview, email preview, and publish.
- Settings: addresses, send limits, thresholds, health checklist, activity log, full backup.
- Studies list, and per study the overview from the prototype: funnel, coverage and weights by
  stratum with under-responding strata flagged, follow-up sequence with audience counts,
  hand-raises, themes, and the study file with its version history.
- Contacts: import, mapping profiles, the unresolved queue, contact history.
- Responses: review queue with flags, include or exclude with a reason.
- Exports: anonymized wide CSV of answers, free text as a separate CSV, chart-ready JSON per
  metric (estimate, n, effective n, margin of error, by stratum), hand-raises as an identified
  CSV, and a generated methods note in Markdown covering frame, sample, response rates,
  weights, exclusions, and coding agreement.

## 12. SurveyMonkey engine

An adapter with the same three operations as the native engine: publish a study version, make
a link for a study contact, and sync responses.

- Publishing creates the survey through SurveyMonkey's API from the study file. Where their
  API cannot express branching, produce a checklist of logic for the operator to set by hand,
  and keep studies on this engine simple.
- Links use a web link collector with custom variables for the contact ID and attributes.
- The survey's end page redirects to the Canvass benchmark page with the ID attached.
- Sync pulls completed responses on a schedule and matches them on the ID.
- These depend on the operator's SurveyMonkey plan. Check for custom variables, the redirect
  end page, and API access to responses, and fail with a clear message if any is missing.

## 12a. Trust rules in code

`PRODUCT.md` lists six trust rules. Enforce them structurally: exports for sponsors never
include identity; hand-raises are the only identified export; audience selection filters by
license scope; panel rows are created only by the respondent's own action.

## 13. Privacy and security

- A plain-language privacy page: who is running the study, what is collected, how quotes are
  used (anonymous unless the respondent agrees otherwise), how to withdraw, and a contact.
- Secrets only in environment variables. CSRF protection on every POST. Rate limits on token
  and follow-up routes. Hashed IPs only.
- No compliance claims that are not true.

## 14. Open items to ask the operator

1. A sample Power Almanac export header, to build the mapping profile.
2. Which cold-outreach platform will deliver mail, and whether it has an API.
3. The domain for survey links and the postal address for email footers.
4. The Postgres host.
5. The registry seed file.
6. Seed benchmark values by population band (the operator has Washington State data).
7. The product name.

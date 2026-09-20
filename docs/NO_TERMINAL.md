# Running Canvass without a command line

The operator is not a developer on this project and should never need a terminal. This
document lists every job that would normally involve one and says where it happens instead.
Treat each line as a requirement.

## Setting up, once

| Job | Where it happens |
|---|---|
| Put the code on GitHub | Upload the folder on github.com, or let Claude Code push it |
| Deploy | Create a project from the GitHub repo in the Railway dashboard |
| Create the database | Add a Postgres database to the project in the Railway dashboard; it sets `DATABASE_URL` |
| Set secrets | Railway dashboard, Variables: `OPERATOR_PASSPHRASE`, `SESSION_SECRET`, `IP_HASH_SALT`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` |
| Create tables | Automatic. The pre-deploy step runs pending migrations before the new deployment takes traffic |
| Update the app | Merge on GitHub; Railway redeploys |
| Roll back a bad deploy | Railway dashboard, Deployments, "Redeploy" an earlier one |

Migrations must be forward-only and safe to run twice. If a migration fails, the deployment
fails and the previous one keeps serving, so a bad change never takes the site down.

## First run

The first visit to the console opens a setup checklist, not an empty dashboard. Each line shows
a green or amber state, says what is missing, and links to where to fix it.

1. Database reachable and migrations current
2. Operator passphrase set (and not the example value)
3. Survey link domain confirmed
4. Postal address and reply-to address entered (stored in Settings)
5. Registry loaded (upload the government units file)
6. Send provider chosen (dry run by default)
7. AI follow-up key present, with a "Test it" button that asks one sample follow-up

The same checklist lives permanently at Settings, Health.

## Day to day, all in the console

| Job | Screen |
|---|---|
| Load the registry of governments | Contacts, Registry, "Upload file". Shows a preview, column matching, and a count before saving |
| Import a contact list | Contacts, Import. Pick or create a column-matching profile by clicking, preview 20 rows, see how many are new, duplicate, or unresolved |
| Fix unresolved rows | Contacts, Needs review. Search the registry and click to match, or skip |
| See your lists | Contacts, Lists. One card per Power Almanac list, then other sources, with counts and where each came from |
| Create a study | Studies, "New study": pick lists, pick how people can answer, then a template or a copy of an existing study |
| Turn the AI interview on or off | The "How can they answer?" switches, or the study editor |
| Read interviews | Study, Interviews. Transcripts without names, with themes beside them |
| See the panel | Contacts, Panel. Who joined, through which study, and when |
| Edit a study | The study editor, below |
| Draw the sample | Study, Sample. Shows counts per band and who is skipped and why, then "Draw sample" |
| Send a touch | Study, Follow-ups. Shows the audience and every exclusion reason, then "Queue" or "Download CSV" |
| Pause or resume sending | One button on the study; the circuit breaker uses the same switch and says why it flipped |
| Review flagged responses | Study, Responses. Include or exclude with a reason |
| Code open answers | Study, Themes. Accept or change the suggested theme |
| Export anything | Study, Exports. Every export is a download button |
| Change settings | Settings. Addresses, send limits, contact-history window, breaker thresholds |
| See what happened | Settings, Activity. A plain log of operator actions and system events |
| Back up | Settings, Health, "Download full backup" (a zip of CSVs), in addition to the database host's own backups |
| See the product full before any real list exists | Settings, Sample data, "Load sample data". Fake governments, people, a fielding study, responses, interviews and coded answers, all marked, all removed again by "Remove sample data" |

## The study editor

Studies live in the database, not in the repo. The files under `templates/` are starting
points that appear under "New study".

Version one of the editor is a text editor in the browser with guard rails:

- The study file on the left, a live list of problems on the right, written in plain words
  by the kernel's `parseStudy` (for example "Each email must contain {unsubscribe}").
- "Preview survey" opens the respondent flow with sample link attributes the operator can
  change, without recording anything.
- "Preview emails" renders each touch for a sample contact.
- "Publish version" is disabled while problems exist. Publishing shows what changed since the
  last version and warns if a study is already fielding.
- Warnings (such as CHANGE_ME placeholders) allow publishing but block sending.

Version two, after the pilot, adds form-based editing on top of the same file: edit question
text and options, reorder questions, pick show-if conditions from dropdowns, edit the email
sequence and sample targets. The text view stays available as "Advanced". Both views read and
write the same study text, so nothing is lost moving between them.

## Things that must never require a command

Seeding, migrating, publishing, importing, exporting, sending, pausing, backing up, rotating
the passphrase (change the environment variable and redeploy from the dashboard), and
switching send providers.

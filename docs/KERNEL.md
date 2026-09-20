# The kernel

`src/core` is framework-free TypeScript that encodes the product's rules. It is tested by
`tests/kernel.test.ts`, `tests/modalities.test.ts`, `tests/health.test.ts`, and
`tests/survey.test.ts`, `tests/import.test.ts`, `tests/draw.test.ts` and `tests/rate-limit.test.ts`
(106 tests, all passing, type-check clean). Build routes, pages, and jobs
as thin layers over it.

| File | What it does | Used by |
|---|---|---|
| `study-schema.ts` | Zod schema for study files; `parseStudy(text)` returns the study or plain-language problems and warnings; enforces the native-engine rule, email requirements, and reference checks | Study editor, publish, templates |
| `expr.ts` | Safe formula evaluator and show-if conditions. No eval | Flow, benchmark, plausibility, schema checks |
| `lists.ts` | The audience lists (Power Almanac's thirteen plus other sources), list cards with reachable counts, audience filtering by list, state, size, and license | Lists screen, audience screen, sampling |
| `flow.ts` | Visible questions, next and previous, required checks, plausibility prompts, when the AI follow-up runs, the spine, and what to offer after the survey | Respondent pages, preview |
| `interview.ts` | Interviewer prompt from a guide, turn validation, stop conditions, scripted fallback, who gets invited | The interview stage |
| `followup.ts` | Prompt contract, input capping, output validation, timeout, fallback | The follow-up route |
| `benchmark.ts` | Metric values, headline choice, sentences, seeds versus real peers | Benchmark page |
| `weights.ts` | Post-stratification weights with a cap, Kish effective n, margin of error, one response per government | Dashboard, exports, methods note |
| `audience.ts` | Who receives a touch and the count for every exclusion reason | Follow-ups screen, send jobs |
| `breaker.ts` | Pauses sending on hot bounce or complaint rates, with a readable reason | Send jobs, webhooks |
| `send.ts` | Provider interface, merge rendering, sendability checks, subject variants, CSV export, dry-run provider | Sending |
| `engines.ts` | Engine interface, native engine, feature availability and its explanation | Links, publish, console |
| `quality.ts` | Response flags | Completion handler, review queue |
| `tokens.ts` | Token minting and IP hashing | Sampling, link routes |
| `health.ts` | The setup checklist: what each line means and where to fix it | Console setup screen, Settings, Health |
| `csv.ts` | Strict CSV reading and writing, column mapping profiles | Registry upload, contact import, exports |
| `resolve.ts` | Normalising names, states and government types; matching a row to a government | Import, the needs-review queue |
| `draw.ts` | The reproducible stratified draw, primary-role share, the pilot, and every skip reason | Sample screen, token minting |

`src/db/schema.ts` is the Drizzle schema for every table in the spec, plus `settings`,
`activity_log`, `mapping_profiles`, and `import_rows` for the no-terminal requirements, and
`contact_lists`, `interviews`, `interview_turns`, and `panel_members` for lists, stages, and the panel. Note
`studies.draft_text` (the editable file) and `study_versions.source_text` (the frozen one).

## Not in the kernel yet

Theme-coding prompts, the SurveyMonkey adapter, the API send provider, and the methods-note
generator. Add each to `src/core` with tests when its milestone comes up, in the same style:
pure functions in, plain data out.

## A bug the kernel already caught

The first draft of the Brandeis study had an unquoted comma in a codebook label, which YAML
read as a second key. `parseStudy` refused it with a message naming the spot. That is the
experience the study editor should give the operator for every mistake.

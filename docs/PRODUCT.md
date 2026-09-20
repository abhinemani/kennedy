# What Canvass is for

Read this first. It explains why the product exists and what must stay true as it grows. The
spec says how; this says why.

## The idea

Nobody has good, current evidence on how local governments actually operate. The Census covers
finances, slowly. Association surveys are infrequent and thin. Vendors guess at needs,
foundations fund on hunches, and governments cannot see their peers.

Canvass is a research tool built only for the public sector. Over time it becomes a standing
panel of local government officials who answer because they get something back: a comparison
with places their size. The survey and the AI interviewer are instruments. The panel, the
registry of governments, and the trust of the officials in it are the asset.

The goal is to build something that matters, is unique, and is hard to copy. Software can be
copied. Years of officials who trust you with candid answers cannot.

## What "purpose-built for the public sector" means

1. **The government is the unit.** Officials retire and lose elections; the clerk's office
   persists. A registry keyed to Census identifiers lets data outlive people. Contacts are
   organized by role, because titles vary wildly.
2. **The universe is known.** There are roughly 90,000 local governments, and the list is
   public. Results can be weighted against the whole and carry a real margin of error.
3. **Incentives are different.** Many officials cannot accept gifts or payments. A benchmark
   is an incentive that works and is often the only one that is allowed. Reciprocity is what
   turns respondents into a panel.
4. **The channel is hostile and the stakes are different.** Filters scan every link. What an
   official writes may be a public record. So: no tracking pixels, state changes only on a
   human click, anonymity by default, free text stored apart from identity.
5. **Context is known before the first question.** Population, budget, form of government, and
   state law make questions smarter, enable "did you mean?" checks, and define true peers.

## How people can respond: a ladder of depth

Each rung reaches fewer people and learns more from each. An official chooses how far to climb
within one study.

| Rung | What it is | What it yields |
|---|---|---|
| Survey | Five minutes of closed questions, identical for everyone | Numbers with an n |
| Smart survey | The survey plus one AI follow-up on written answers (add-on) | Numbers, plus a sharper "why" |
| AI interview | A ten to fifteen minute adaptive conversation from a researcher's guide (add-on) | Themes tied to quotes |
| Live conversation | Time booked with a human researcher | Depth, and often a pilot |

Later rungs: a one-question pulse for panel members, and a voice interview.

**The spine rule.** Every rung opens with the same short set of closed questions, defined per
study. Without it, interviews produce stories that cannot be weighted. With it, everything
feeds one dataset and one codebook, and stages can be chained: survey thousands, interview the
most interesting forty.

## Who uses it

- **The official.** Invitation, survey, instant benchmark, then their choice: leave, join the
  panel, talk it through, or raise a hand. No account, only their link. They control who may
  contact them.
- **The researcher.** Picks the lists to ask, chooses the rungs, builds from a template, pilots,
  fields, reviews, and ends with weighted numbers, coded themes, and a methods note. All in a
  browser.
- **The sponsor.** A vendor, investor, foundation, or association that brings a question and
  receives evidence: estimates with their n, anonymized quotes, and introductions only to
  officials who asked for one.
- **The public.** Every study publishes an open summary.

## The trust rules

These protect the only asset that matters. They are product requirements, not policy.

1. Contact details are never sold or shared.
2. A sponsor reaches an official only when that official raises a hand.
3. Lists never mix across license scopes. Power Almanac contacts are licensed to the operator
   and are never used for a client's study or shown to a sponsor.
4. The panel is opt-in. A purchased list is never a panel.
5. Quotes are anonymous unless the person agrees otherwise.
6. Every study publishes a summary and its method.

## Tiers, expressed as flags

There is no billing yet. Tiers exist as an engine choice and feature flags per study.

- **Base.** The shared platform with SurveyMonkey as the survey engine.
- **Full stack.** The native engine: single-use links, checks while typing, scanner-safe counts.
- **Add-ons on the full stack.** The AI follow-up, and the AI interview.

## Where the AI interviewer comes from

The operator has already built an AI interviewer for government research (a separate project
called Cronkite). Canvass brings that capability in as the interview stage instead of merging
codebases. `src/core/interview.ts` holds the contract; reuse ideas and prompts from Cronkite
where the operator provides them.

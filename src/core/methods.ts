// The methods note.
//
// It is generated rather than written, because the numbers in it have to match the numbers in
// the report exactly, and because a note that has to be rewritten by hand each wave is a note
// that eventually stops being true. It says what was asked, of whom, how many answered, how
// they were weighted, and what was left out and why. Diligence reads this.

import type { Study } from "./study-schema";
import type { AnalysisResponse, Coverage, MetricEstimate } from "./analysis";
import type { MoeKind } from "./weights";
import { excluded, included, UNDER_REPRESENTED_WEIGHT } from "./analysis";

export type MethodsInput = {
  study: Study;
  version: number;
  publishedAt: Date | null;
  rows: AnalysisResponse[];
  coverage: Coverage[];
  estimates: MetricEstimate[];
  frameTotal: number;
  drawn: number;
  emailed: number;
  fieldedFrom: Date | null;
  fieldedTo: Date | null;
  /** Agreement on the double-coded sample, when open text has been coded. */
  codingAgreement: { sampled: number; agreed: number } | null;
  generatedAt: Date;
};

const date = (d: Date | null) =>
  d ? d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "not yet";

const n = (x: number) => x.toLocaleString("en-US");

const round = (x: number | null, places = 1) =>
  x === null ? "—" : x.toLocaleString("en-US", { maximumFractionDigits: places });

/** The units come from the estimate, never from the renderer's memory of them. */
export function formatMoe(moe: number | null, kind: MoeKind): string {
  if (moe === null) return "—";
  return kind === "percentage_points" ? `±${round(moe)} points` : `±${round(moe)}`;
}

export function methodsNote(input: MethodsInput): string {
  const { study, rows } = input;
  const keep = included(rows);
  const dropped = excluded(rows);

  const lines: string[] = [];
  const say = (s = "") => lines.push(s);

  say(`# ${study.name}: how this was done`);
  say();
  say(
    `Prepared ${date(input.generatedAt)} from version ${input.version} of the study file` +
      `${input.publishedAt ? `, published ${date(input.publishedAt)}` : ""}.`,
  );
  say();

  say("## What was asked");
  say();
  say(
    `${study.questions.length} questions, of which ${study.spine.length} form the spine asked ` +
      `in every way of responding. The published version of the file is kept unchanged, and every ` +
      `response records which version it answered.`,
  );
  say();

  say("## Who was asked");
  say();
  say(
    `The frame was ${n(input.frameTotal)} governments in the registry of types ` +
      `${study.sample.frame.entity_types.join(", ")}` +
      `${study.sample.frame.min_population ? ` with a population of at least ${n(study.sample.frame.min_population)}` : ""}, ` +
      `holding contacts in these roles: ${study.sample.frame.roles.join(", ")}.`,
  );
  say();
  say(
    `A stratified sample of ${n(input.drawn)} contacts was drawn at random within ` +
      `${study.sample.strata.bands.length} population bands, using seed ${study.sample.seed}. ` +
      `The draw is reproducible: the same seed over the same frame returns the same sample.`,
  );
  if (study.sample.primary_roles?.length) {
    say();
    say(
      `At least 70 percent of each band was drawn from the roles closest to the work ` +
        `(${study.sample.primary_roles.join(", ")}), so the numbers describe the people who handle it.`,
    );
  }
  say();
  say(
    `Contacts were passed over if they had unsubscribed, were known undeliverable, or had been ` +
      `contacted by another study within ${study.sample.contact_history_window_days} days.`,
  );
  say();

  say("## How they were reached");
  say();
  say(
    `${n(input.emailed)} were emailed, in a sequence of ${study.sequence.length} touches ` +
      `on days ${study.sequence.map((t) => t.day).join(", ")}. Every email was plain text with one ` +
      `survey link, a postal address, and an unsubscribe link. No tracking pixels were used, and ` +
      `loading a link was never counted as a response: a response begins when a person presses Start.`,
  );
  say();
  say(
    `Fielding ran from ${date(input.fieldedFrom)} to ${date(input.fieldedTo)}. ` +
      `Each link was single use, and one completed response was accepted per link.`,
  );
  say();

  say("## How many answered");
  say();
  const rate = input.emailed === 0 ? null : (keep.length / input.emailed) * 100;
  say(
    `${n(keep.length)} responses are included${rate === null ? "" : `, a response rate of ${round(rate)} percent of those emailed`}.`,
  );
  say();
  say("| Population band | Governments in frame | Contacts drawn | Responses | Response rate | Weight |");
  say("|---|---|---|---|---|---|");
  for (const c of input.coverage) {
    const rate = c.responseRate === null ? "—" : `${round(c.responseRate * 100)}%`;
    say(`| ${c.label} | ${n(c.frame)} | ${n(c.drawn)} | ${n(c.responses)} | ${rate} | ${round(c.weight, 2)} |`);
  }
  const under = input.coverage.filter((c) => c.under);
  if (under.length) {
    say();
    say(
      `Under-represented among respondents: ${under.map((c) => c.label).join(", ")}. ` +
        `Weighting corrects for this, at the cost of a larger margin of error. A band is named ` +
        `here when its weight reaches ${UNDER_REPRESENTED_WEIGHT}, meaning each of its responses ` +
        `is standing in for half again as many governments as an average one.`,
    );
  }
  say();

  say("## How the numbers were weighted");
  say();
  say(
    `Estimates are post-stratified: each band's weight is its share of the frame divided by its ` +
      `share of the respondents, capped at ${study.quality.weight_cap}. The cap limits how far one ` +
      `response in a thin band can move a total.`,
  );
  say();
  say(
    `For questions that describe a government rather than a person, each government counts once. ` +
      `Where more than one person from the same government answered, the one closest to the work ` +
      `is kept, in this order: ${study.quality.entity_role_order.join(", ")}. For questions about a ` +
      `person's own view, every respondent counts.`,
  );
  say();
  say(
    `Each estimate is reported with its n, its Kish effective n, and a 95 percent margin of error. ` +
      `The effective n is lower than the n because weighting costs precision; the margin of error is ` +
      `computed from the effective n, not the n.`,
  );
  say();

  if (input.estimates.length) {
    say("| Estimate | Basis | n | Effective n | Value | Margin of error |");
    say("|---|---|---|---|---|---|");
    for (const e of input.estimates) {
      say(
        `| ${e.label} | ${e.basis === "entity" ? "one per government" : "per respondent"} | ` +
          `${n(e.n)} | ${round(e.effectiveN)} | ${round(e.estimate)} | ${formatMoe(e.moe, e.moeKind)} |`,
      );
    }
    say();
  }

  say("## What was left out");
  say();
  if (dropped.length === 0) {
    say("No responses were excluded.");
  } else {
    say(
      `${n(dropped.length)} of ${n(rows.length)} responses were excluded by review. ` +
        `Quality flags never exclude a response on their own; each exclusion below was a decision, ` +
        `with a reason recorded at the time.`,
    );
    say();
    const byReason = new Map<string, number>();
    for (const r of dropped) {
      const reason = r.exclusionReason?.trim() || "no reason recorded";
      byReason.set(reason, (byReason.get(reason) ?? 0) + 1);
    }
    say("| Reason | Responses |");
    say("|---|---|");
    for (const [reason, count] of [...byReason].sort((a, b) => b[1] - a[1])) {
      say(`| ${reason} | ${n(count)} |`);
    }
  }
  say();

  if (input.codingAgreement) {
    say("## How open answers were coded");
    say();
    const { sampled, agreed } = input.codingAgreement;
    const pct = sampled === 0 ? null : (agreed / sampled) * 100;
    say(
      `Written answers were coded against a codebook of ${study.codebook?.length ?? 0} themes. ` +
        `A random ${n(sampled)} were coded a second time; the two passes agreed on ` +
        `${pct === null ? "—" : `${round(pct)} percent`} of them. Theme counts are respondents, not mentions.`,
    );
    say();
  }

  say("## What this cannot tell you");
  say();
  say(
    `This is a sample of officials who chose to answer, not a census. Weighting corrects the shape ` +
      `of the sample against the frame; it cannot correct for the difference between people who ` +
      `answer surveys and people who do not. Figures for a band with few responses carry a wide ` +
      `margin of error and should be read as an indication rather than a measurement.`,
  );

  return lines.join("\n") + "\n";
}

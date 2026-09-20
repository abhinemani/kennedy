import { redirect } from "next/navigation";
import Link from "next/link";
import { afterSurvey } from "@/core/flow";
import { computeBenchmark } from "@/core/benchmark";
import { answersFor, linkFor, responseFor } from "@/db/queries/respondent";
import { peersFor } from "@/lib/benchmark-data";
import { backFromEnd, completeSurvey } from "../actions";
import { Progress } from "../render";
import { StripPlot } from "../strip";
import { linkScope, respondentAnswers } from "../survey";

export const dynamic = "force-dynamic";

export default async function Done({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ recorded?: string; problem?: string; ticked?: string; panel?: string; quote?: string }>;
}) {
  const { token } = await params;
  const { recorded, problem, ticked, panel: panelBack, quote } = await searchParams;
  // When the last screen sent them back for an email, their ticks come back with them.
  const keptTicks = ticked ? ticked.split(",") : null;

  const link = await linkFor(token);
  if (!link) redirect(`/s/${token}`);

  const response = await responseFor(link.studyContactId);
  if (!response) redirect(`/s/${token}`);

  const stored = await answersFor(response.id);
  const given = respondentAnswers(stored);
  const scope = { ...linkScope(link.attributes), ...given };
  const study = link.study;
  const done = response.status === "complete";

  const stratum = String(link.attributes.population_band ?? link.attributes.stratum_key ?? "all");
  const peers = study.features.benchmark && study.benchmark ? await peersFor(link.studyId, stratum, study) : null;
  const results = peers ? computeBenchmark(study, scope, peers.byMetric) : [];
  const headline = results.find((r) => r.headline)?.headline;
  const anyPeers = Object.values(peers?.byMetric ?? {}).some((v) => v.length > 0);

  const steps = afterSurvey(study, given, linkScope(link.attributes), 0);
  const handRaises = steps.filter((s) => s.kind === "hand_raise");
  const panel = steps.find((s) => s.kind === "panel");
  const live = steps.find((s) => s.kind === "live");

  const chartMetric = study.benchmark?.metrics.find((m) => m.chart === "strip");
  const chartResult = chartMetric ? results.find((r) => r.id === chartMetric.id) : undefined;
  const chartPeers = chartMetric ? (peers?.byMetric[chartMetric.id] ?? []) : [];
  const peerSource = chartMetric ? peers?.source[chartMetric.id] : undefined;

  return (
    <div className="wrap">
      <div className="letter">
        <Progress done={1} total={1} />

        {done ? (
          <>
            <p className="q">Response recorded. Thank you.</p>
            <p className="hint">
              Your answers are in. This page is yours to come back to from the same link.
            </p>
          </>
        ) : (
          <p className="q">{headline ?? (anyPeers ? "Here is how your answers compare." : "Thank you. Here is what you told us.")}</p>
        )}

        {chartResult?.value != null ? (
          <>
            {done && headline ? <p className="q" style={{ fontSize: 20 }}>{headline}</p> : null}
            <StripPlot
              value={chartResult.value}
              peers={chartPeers}
              unitLabel="per 1,000 residents"
              caption={
                chartPeers.length === 0
                  ? "You are among the first in your size band to answer, so there is nothing to compare against yet. We will send you the comparison when the study closes."
                  : peerSource === "seeds"
                    ? `Each dot is a published figure for a government in your size band. ${study.benchmark?.seeds_note ?? ""}`.trim()
                    : `Each dot is another government in your size band that answered this survey, ${chartPeers.length} so far.`
              }
            />
          </>
        ) : null}

        {results
          .filter((r) => r.sentence)
          .map((r) => (
            <p className="hint" key={r.id} style={{ marginTop: 12 }}>
              {r.sentence}
            </p>
          ))}

        {done ? (
          <>
            {live ? (
              <div className="panel" style={{ marginTop: 20, background: "var(--tint)", border: 0 }}>
                <b style={{ fontWeight: 500 }}>{live.label}</b>
                <p className="note" style={{ margin: "4px 0 12px" }}>
                  If you would rather talk it through with a person, pick a time that suits you.
                </p>
                <a className="btn ghost" href={live.url} target="_blank" rel="noreferrer noopener">
                  Book a time
                </a>
              </div>
            ) : null}
            <p className="flag">
              {study.brand.sponsor_line} <Link href="/privacy">How we handle your answers</Link>
            </p>
          </>
        ) : (
          <form action={completeSurvey}>
            <input type="hidden" name="token" value={token} />

            {handRaises.length > 0 || panel ? (
              <h2 style={{ marginTop: 28, fontSize: 17 }}>Before you go</h2>
            ) : null}

            {handRaises.map((h) =>
              h.kind === "hand_raise" ? (
                <label className="check" key={h.id}>
                  <input
                    type="checkbox"
                    name={`raise_${h.id}`}
                    defaultChecked={keptTicks ? keptTicks.includes(h.id) : h.default}
                  />
                  <span>{h.label}</span>
                </label>
              ) : null,
            )}

            {panel && panel.kind === "panel" ? (
              <label className="check">
                <input type="checkbox" name="join_panel" defaultChecked={panelBack === "1"} />
                <span>
                  {panel.label}. <span className="state">{panel.promise}</span>
                </span>
              </label>
            ) : null}

            {study.quote_permission ? (
              <label className="check">
                <input
                  type="checkbox"
                  name="quote_permission"
                  defaultChecked={quote ? quote === "1" : study.quote_permission.default}
                />
                <span>{study.quote_permission.label}</span>
              </label>
            ) : null}

            {handRaises.length > 0 || panel ? (
              <>
                <label className="field" htmlFor="email">
                  Work email
                  <span className="hint">Only needed if you ticked one of the boxes above.</span>
                </label>
                <input id="email" type="email" name="email" autoComplete="email" placeholder="you@yourcity.gov" />
              </>
            ) : null}

            {problem === "email" ? (
              <p className="problem" role="alert">
                Those boxes need a work email so we know where to send it. Add one, or untick them.
              </p>
            ) : null}

            <div className="nav">
              <button className="btn ghost" type="submit" formAction={backFromEnd}>
                Back
              </button>
              <button className="btn" type="submit">
                Record my response
              </button>
            </div>
          </form>
        )}

        {recorded ? (
          <p className="note" role="status">
            Recorded just now.
          </p>
        ) : null}
      </div>
    </div>
  );
}

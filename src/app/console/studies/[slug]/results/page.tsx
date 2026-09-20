import Link from "next/link";
import { redirect } from "next/navigation";
import { isSignedIn } from "@/lib/auth";
import { parseStudy } from "@/core/study-schema";
import { formatMoe } from "@/core/methods";
import { studyAndVersion, studyOf } from "@/db/queries/studies";
import { analyse } from "@/lib/study-analysis";
import { Nav } from "../../../nav";

export const dynamic = "force-dynamic";

const n = (x: number) => x.toLocaleString("en-US");
const round = (x: number | null, places = 1) =>
  x === null ? "—" : x.toLocaleString("en-US", { maximumFractionDigits: places });

export default async function Results({ params }: { params: Promise<{ slug: string }> }) {
  if (!(await isSignedIn())) redirect("/console/login");
  const { slug } = await params;

  const found = await studyAndVersion(slug);
  if (!found) redirect("/console/studies");
  const { study, version } = found;

  const parsed = parseStudy(study.draftText);
  const spec = parsed.ok ? parsed.study : version ? studyOf(version) : null;
  if (!spec) {
    return (
      <>
        <Nav current="/console/studies" />
        <h1>Results</h1>
        <p className="problem">
          The study file has problems, so its metrics cannot be read.{" "}
          <Link href={`/console/studies/${slug}`}>Fix them on the study screen</Link>.
        </p>
      </>
    );
  }

  const a = await analyse(spec, study.id);
  const f = a.funnel;
  const widest = Math.max(f.drawn, 1);
  const bar = (x: number) => `${Math.max(2, Math.round((x / widest) * 100))}%`;

  const steps: [string, number][] = [
    ["Drawn", f.drawn],
    ["Emailed", f.emailed],
    ["Link loaded", f.loaded],
    ["Pressed Start", f.started],
    ["Completed", f.completed],
    ["In the analysis", f.included],
  ];

  return (
    <>
      <Nav current="/console/studies" />
      <h1>Results</h1>
      <p className="sub">
        {study.name}. {n(a.included.length)} responses in the analysis
        {a.rows.length !== a.included.length
          ? `, ${n(a.rows.length - a.included.length)} excluded by review`
          : ""}
        .
      </p>

      <h2>Where the sample stands</h2>
      <div className="panel">
        <ul className="funnel">
          {steps.map(([label, value]) => (
            <li key={label}>
              <span>{label}</span>
              <span className="bar" style={{ width: bar(value) }} />
              <span className="n">{n(value)}</span>
            </li>
          ))}
        </ul>
        <p className="note">
          A loaded link is not an opened one. Government mail gateways fetch every URL in a
          message, so only pressing Start counts as a person.
        </p>
      </div>

      <h2>Coverage and weights</h2>
      <div className="panel scroll">
        <table>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Population band</th>
              <th>In frame</th>
              <th>Drawn</th>
              <th>Responses</th>
              <th>Rate</th>
              <th>Weight</th>
            </tr>
          </thead>
          <tbody>
            {a.coverage.map((c) => (
              <tr key={c.key}>
                <td style={{ textAlign: "left" }}>
                  {c.label}
                  {c.under ? <span className="low"> — under-represented</span> : null}
                </td>
                <td>{n(c.frame)}</td>
                <td>{n(c.drawn)}</td>
                <td>{n(c.responses)}</td>
                <td>{c.responseRate === null ? "—" : `${round(c.responseRate * 100)}%`}</td>
                <td className={c.under ? "low" : undefined}>{round(c.weight, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="note">
          A weight above one means that band is under-represented among the people who answered,
          so each of its responses counts for more. The cap is {spec.quality.weight_cap}. Drawn is
          how many contacts went into the study for that band, which is what the rate is measured
          against.
        </p>
      </div>

      <h2>Estimates</h2>
      <div className="panel scroll">
        <table>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Metric</th>
              <th style={{ textAlign: "left" }}>Basis</th>
              <th>Estimate</th>
              <th>Margin</th>
              <th>n</th>
              <th>Effective n</th>
            </tr>
          </thead>
          <tbody>
            {a.estimates.map((e) => (
              <tr key={e.id}>
                <td style={{ textAlign: "left" }}>{e.label}</td>
                <td style={{ textAlign: "left" }}>
                  {e.basis === "entity" ? "one per government" : "per respondent"}
                </td>
                <td>{round(e.estimate)}</td>
                <td>{formatMoe(e.moe, e.moeKind)}</td>
                <td>{n(e.n)}</td>
                <td>{round(e.effectiveN)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="note">
          The margin of error comes from the effective n, which weighting lowers. Where a metric
          describes the office rather than the person, each government counts once.
        </p>
      </div>

      <h2>What people chose</h2>
      {a.shares.map((share) => (
        <div className="panel" key={share.questionId} style={{ marginTop: 12 }}>
          <b style={{ fontWeight: 500, fontSize: 14.5 }}>{share.text}</b>
          {share.options.map((o) => (
            <div className="theme" key={o.value}>
              <span>{o.label}</span>
              <span className="n">{round(o.estimate, 0)}%</span>
              <div className="track">
                <div className="fill" style={{ width: `${Math.max(0, Math.min(100, o.estimate ?? 0))}%` }} />
              </div>
            </div>
          ))}
          <p className="note">
            n {n(share.options[0]?.n ?? 0)}, margin {formatMoe(share.options[0]?.moe ?? null, "percentage_points")}
          </p>
        </div>
      ))}

      <p className="flag">
        <Link href={`/console/studies/${slug}/responses`}>Review responses</Link> ·{" "}
        <Link href={`/console/studies/${slug}/exports`}>Exports and the methods note</Link> ·{" "}
        <Link href={`/console/studies/${slug}`}>Back to the study</Link>
      </p>
    </>
  );
}

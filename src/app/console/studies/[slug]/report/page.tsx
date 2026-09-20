import Link from "next/link";
import { redirect } from "next/navigation";
import { isSignedIn } from "@/lib/auth";
import { parseStudy } from "@/core/study-schema";
import { formatMoe } from "@/core/methods";
import { themeCounts } from "@/core/coding";
import { marginAt } from "@/core/plan";
import { ROLES } from "@/core/lists";
import { studyAndVersion, studyOf } from "@/db/queries/studies";
import { handRaiseRows, quotesFor, type QuoteRow } from "@/db/queries/analysis";
import { codesForCounting, themeList } from "@/db/queries/coding";
import { analyse, noteFor } from "@/lib/study-analysis";
import { PrintButton } from "./print";

export const dynamic = "force-dynamic";

const n = (x: number) => x.toLocaleString("en-US");
const round = (x: number | null, places = 1) =>
  x === null ? "—" : x.toLocaleString("en-US", { maximumFractionDigits: places });
const roleLabel = (key: string) => ROLES.find((r) => r.key === key)?.label.replace(/s$/, "") ?? key.replace(/_/g, " ");
const dateOf = (d: Date | null) => (d ? d.toLocaleDateString("en-US", { dateStyle: "long" }) : null);

function attribution(q: QuoteRow, bandLabel: string): string {
  const who = roleLabel(q.role);
  return q.quotePermission ? `${who}, ${q.state}, ${bandLabel.toLowerCase()}` : `${who}, ${bandLabel.toLowerCase()} people`;
}

// The document a sponsor takes into a meeting: the question, the answer in numbers, what
// people chose and said, how many raised a hand, and the method that makes it defensible.
export default async function Report({ params }: { params: Promise<{ slug: string }> }) {
  if (!(await isSignedIn())) redirect("/console/login");
  const { slug } = await params;

  const found = await studyAndVersion(slug);
  if (!found) redirect("/console/studies");
  const { study, version } = found;
  const parsed = parseStudy(study.draftText);
  const spec = parsed.ok ? parsed.study : version ? studyOf(version) : null;
  const base = `/console/studies/${slug}`;

  if (!spec) {
    return (
      <>
        <h1>Report</h1>
        <p className="problem">
          The study file has problems, so nothing can be reported. <Link href={`${base}/file`}>Fix them in the study file</Link>.
        </p>
      </>
    );
  }

  const [a, themes, codes, quotes, raises] = await Promise.all([
    analyse(spec, study.id),
    themeList(study.id).catch(() => []),
    codesForCounting(study.id).catch(() => []),
    quotesFor(study.id).catch(() => []),
    handRaiseRows(study.id).catch(() => []),
  ]);
  const note = noteFor(spec, version?.version ?? 0, version?.publishedAt ?? null, a);
  const tally = themeCounts(themes, codes).filter((t) => t.respondents > 0).sort((x, y) => y.respondents - x.respondents);
  const included = a.included.length;
  const bandLabel = (key: string) => spec.sample.strata.bands.find((b) => b.key === key)?.label ?? key;
  const evidence = spec.evidence_map ?? {};
  const raiseTypes = (spec.hand_raises ?? []).map((t) => ({ ...t, count: raises.filter((r) => r.type === t.id).length }));
  const from = dateOf(a.fieldedFrom);
  const to = dateOf(a.fieldedTo);
  const governments = new Set(a.included.map((r) => r.entityId)).size;

  return (
    <>
      <div className="page-head no-print">
        <div>
          <span className="eyebrow">Report</span>
          <h1>The report, as it stands</h1>
          <p className="lede">
            Generated from the numbers right now, so it always matches the downloads and the methods
            note. Print it, or save it as a PDF, whenever the study is far enough along.
          </p>
        </div>
        <div className="actions">
          <PrintButton />
          <Link className="btn ghost" href={`${base}/exports`}>
            Downloads
          </Link>
        </div>
      </div>

      <article className="card" style={{ padding: "36px 40px", maxWidth: 860 }}>
        <span className="eyebrow">{spec.brand.display_name}</span>
        <h2 style={{ fontFamily: "var(--read)", fontSize: 32, fontWeight: 500, lineHeight: 1.15, letterSpacing: "-.015em", margin: "0 0 10px" }}>
          {spec.question ?? study.name}
        </h2>
        <p className="note" style={{ margin: "0 0 4px", fontSize: 14.5 }}>
          {study.name}
          {version ? `, version ${version.version}` : ""}
          {from ? ` · fielded ${from}${to && to !== from ? ` to ${to}` : ""}` : " · not yet fielded"}
        </p>
        <p className="note" style={{ margin: "0 0 26px", fontSize: 14 }}>{spec.brand.sponsor_line}</p>

        <div className="stats">
          <div className="stat">
            <span className="k">Responses</span>
            <span className="n">{n(included)}</span>
            <span className="l">in the analysis, from {n(governments)} governments</span>
          </div>
          <div className="stat">
            <span className="k">Reached</span>
            <span className="n">{n(a.funnel.emailed)}</span>
            <span className="l">people emailed, of {n(a.funnel.drawn)} drawn</span>
          </div>
          <div className="stat">
            <span className="k">Margin</span>
            <span className="n">{marginAt(included) === null ? "—" : `±${marginAt(included)}`}</span>
            <span className="l">points on a share, at 95 percent, before weighting</span>
          </div>
          <div className="stat">
            <span className="k">Raised a hand</span>
            <span className="n">{n(raises.length)}</span>
            <span className="l">asked to hear more, by their own tick</span>
          </div>
        </div>

        {a.estimates.length > 0 ? (
          <section className="section">
            <div className="section-head">
              <div>
                <h2>The numbers</h2>
                <p>Weighted to the whole frame of {n(a.frameTotal)} governments. Margins are 95 percent.</p>
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>Measure</th>
                  <th>Estimate</th>
                  <th>Margin</th>
                  <th>n</th>
                  <th style={{ textAlign: "left" }}>Why it matters</th>
                </tr>
              </thead>
              <tbody>
                {a.estimates.map((e) => (
                  <tr key={e.id}>
                    <td style={{ textAlign: "left" }}>{e.label}</td>
                    <td style={{ fontWeight: 600 }}>{round(e.estimate)}</td>
                    <td>{formatMoe(e.moe, e.moeKind)}</td>
                    <td>{n(e.n)}</td>
                    <td style={{ textAlign: "left", color: "var(--muted)", fontSize: 13 }}>
                      {Object.entries(evidence).find(([k]) => e.id.includes(k))?.[1] ?? ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}

        {a.shares.length > 0 ? (
          <section className="section">
            <div className="section-head">
              <div>
                <h2>What people chose</h2>
                <p>The weighted share picking each answer.</p>
              </div>
            </div>
            <div className="two">
              {a.shares.map((share) => (
                <div key={share.questionId}>
                  <span className="label" style={{ color: "var(--ink)", fontSize: 13.5 }}>{share.text}</span>
                  <div className="bars">
                    {share.options.map((o) => (
                      <div className="row" key={o.value}>
                        <span className="lab" title={o.label}>{o.label}</span>
                        <span className="track">
                          <span className="fill" style={{ width: `${Math.max(0, Math.min(100, o.estimate ?? 0))}%` }} />
                        </span>
                        <span className="val">
                          {round(o.estimate, 0)}<small>%</small>
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="note" style={{ margin: "6px 0 0" }}>
                    n {n(share.options[0]?.n ?? 0)}, margin {formatMoe(share.options[0]?.moe ?? null, "percentage_points")}
                    {evidence[share.questionId] ? ` · ${evidence[share.questionId]}` : ""}
                  </p>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {tally.length > 0 ? (
          <section className="section">
            <div className="section-head">
              <div>
                <h2>What people said</h2>
                <p>Themes from written answers, counted by respondent. Quotes are anonymous unless the writer allowed their title and state.</p>
              </div>
            </div>
            <div className="bars">
              {tally.map((t) => (
                <div className="row" key={t.code}>
                  <span className="lab" title={t.label}>{t.label}</span>
                  <span className="track">
                    <span className="fill" style={{ width: `${(t.respondents / Math.max(1, tally[0]?.respondents ?? 1)) * 100}%` }} />
                  </span>
                  <span className="val">{n(t.respondents)}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16 }}>
              {tally.slice(0, 3).map((t) => {
                const q = quotes.find((x) => x.themeCode === t.code);
                if (!q) return null;
                return (
                  <blockquote className="quote" key={t.code}>
                    <p>&ldquo;{q.text.length > 300 ? `${q.text.slice(0, 297).trimEnd()}…` : q.text}&rdquo;</p>
                    <footer>{attribution(q, bandLabel(q.stratumKey))}</footer>
                  </blockquote>
                );
              })}
            </div>
          </section>
        ) : null}

        {raiseTypes.length > 0 ? (
          <section className="section">
            <div className="section-head">
              <div>
                <h2>Who wants to hear more</h2>
                <p>Counts only. Names and addresses stay behind the console, under Leads.</p>
              </div>
            </div>
            <dl className="kv">
              {raiseTypes.map((t) => (
                <span key={t.id} style={{ display: "contents" }}>
                  <dt>{t.label}</dt>
                  <dd>{n(t.count)}</dd>
                </span>
              ))}
            </dl>
          </section>
        ) : null}

        <section className="section">
          <div className="section-head">
            <div>
              <h2>How this was done</h2>
              <p>The methods note, generated from the same numbers: frame, sample, response rates, weights, exclusions and coding agreement.</p>
            </div>
          </div>
          <pre style={{ whiteSpace: "pre-wrap", fontFamily: "var(--ui)", fontSize: 13.5, lineHeight: 1.55, color: "var(--muted)" }}>{note}</pre>
        </section>
      </article>
    </>
  );
}

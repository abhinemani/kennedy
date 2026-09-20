import Link from "next/link";
import { redirect } from "next/navigation";
import { isSignedIn } from "@/lib/auth";
import { parseStudy } from "@/core/study-schema";
import { formatMoe } from "@/core/methods";
import { themeCounts } from "@/core/coding";
import { ROLES } from "@/core/lists";
import { studyAndVersion, studyOf } from "@/db/queries/studies";
import { quotesFor, type QuoteRow } from "@/db/queries/analysis";
import { codesForCounting, themeList } from "@/db/queries/coding";
import { analyse } from "@/lib/study-analysis";

export const dynamic = "force-dynamic";

const n = (x: number) => x.toLocaleString("en-US");
const round = (x: number | null, places = 1) =>
  x === null ? "—" : x.toLocaleString("en-US", { maximumFractionDigits: places });
const roleLabel = (key: string) => ROLES.find((r) => r.key === key)?.label.replace(/s$/, "") ?? key.replace(/_/g, " ");

/** The evidence line for a metric: whichever question in its formula has one. */
function evidenceFor(map: Record<string, string>, ids: string[]): string | null {
  for (const id of ids) if (map[id]) return map[id]!;
  return null;
}

/** A quote attributed the way the study promised: role and size always, the state only when allowed. */
function attribution(q: QuoteRow, bandLabel: string): string {
  const who = roleLabel(q.role);
  return q.quotePermission ? `${who}, ${q.state}, ${bandLabel.toLowerCase()}` : `${who}, ${bandLabel.toLowerCase()} people`;
}

// What the study learned, as a sponsor reads it: headline numbers with their margins, what
// people chose, and what they said, each with what it proves.
export default async function Findings({ params }: { params: Promise<{ slug: string }> }) {
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
        <h1>Findings</h1>
        <p className="problem">
          The study file has problems, so its numbers cannot be read. <Link href={`${base}/file`}>Fix them in the study file</Link>.
        </p>
      </>
    );
  }

  const [a, themes, codes, quotes] = await Promise.all([
    analyse(spec, study.id),
    themeList(study.id).catch(() => []),
    codesForCounting(study.id).catch(() => []),
    quotesFor(study.id).catch(() => []),
  ]);
  const tally = themeCounts(themes, codes).filter((t) => t.respondents > 0).sort((x, y) => y.respondents - x.respondents);
  const topTheme = Math.max(1, ...tally.map((t) => t.respondents));
  const evidence = spec.evidence_map ?? {};
  const bandLabel = (key: string) => spec.sample.strata.bands.find((b) => b.key === key)?.label ?? key;
  const questionText = (id: string) => spec.questions.find((q) => q.id === id)?.text ?? id;
  const included = a.included.length;
  const uncoded = quotes.filter((q) => !q.themeCode).length;

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">Findings</span>
          <h1 className="ask">{spec.question ?? "What the study found"}</h1>
          <p className="lede">
            {n(included)} responses in the analysis
            {a.rows.length !== included ? `, ${n(a.rows.length - included)} set aside by review` : ""}.
            Every number carries its n and a 95 percent margin. Weights correct for who answered,
            so small towns are not drowned out.
          </p>
        </div>
        <div className="actions">
          <Link className="btn" href={`${base}/report`}>
            The report
          </Link>
          <Link className="btn ghost" href={`${base}/results`}>
            The full tables
          </Link>
        </div>
      </div>

      {included === 0 ? (
        <div className="card">
          <p className="note" style={{ margin: 0 }}>
            Nothing to report yet. Findings appear as completed responses come in.
          </p>
        </div>
      ) : null}

      {a.estimates.length > 0 ? (
        <div className="section" style={{ marginTop: included === 0 ? 24 : 0 }}>
          <div className="section-head">
            <div>
              <h2>Headline numbers</h2>
              <p>Weighted to the whole frame. Where a number describes the office rather than the person, each government counts once.</p>
            </div>
          </div>
          <div className="three">
            {a.estimates.map((e) => {
              const why = evidenceFor(evidence, e.id.split(/[^a-z_]+/i));
              return (
                <div className="card figure" key={e.id}>
                  <span className="k" style={{ fontSize: 13, fontWeight: 600, color: "var(--muted)" }}>{e.label}</span>
                  <span className="n">
                    {round(e.estimate)}
                  </span>
                  <span className="moe">
                    {formatMoe(e.moe, e.moeKind)} · n {n(e.n)}, effective {round(e.effectiveN, 0)} · {e.basis === "entity" ? "one per government" : "per respondent"}
                  </span>
                  {why ? (
                    <span className="why">
                      <b>Proves</b> {why}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {a.shares.length > 0 ? (
        <div className="section">
          <div className="section-head">
            <div>
              <h2>What people chose</h2>
              <p>The weighted share picking each answer, with the margin for the whole question.</p>
            </div>
          </div>
          <div className="two">
            {a.shares.map((share) => {
              const why = evidence[share.questionId];
              const top = Math.max(1, ...share.options.map((o) => o.estimate ?? 0));
              return (
                <div className="card" key={share.questionId}>
                  <div className="card-head">
                    <div>
                      <h3>{share.text}</h3>
                      <p>
                        n {n(share.options[0]?.n ?? 0)} · margin {formatMoe(share.options[0]?.moe ?? null, "percentage_points")}
                      </p>
                    </div>
                  </div>
                  <div className="bars">
                    {share.options.map((o) => (
                      <div className="row" key={o.value}>
                        <span className="lab" title={o.label}>{o.label}</span>
                        <span className="track">
                          <span className={o.estimate === top ? "fill" : "fill peer"} style={{ width: `${Math.max(0, Math.min(100, o.estimate ?? 0))}%` }} />
                        </span>
                        <span className="val">
                          {round(o.estimate, 0)}<small>%</small>
                        </span>
                      </div>
                    ))}
                  </div>
                  {why ? <p className="card-foot"><b style={{ color: "var(--ink)", fontWeight: 600 }}>Proves</b> {why}</p> : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="section">
        <div className="section-head">
          <div>
            <h2>What people said</h2>
            <p>Written answers coded against the study&rsquo;s codebook. Counts are respondents, not mentions. Quotes are anonymous unless the writer allowed their title and state.</p>
          </div>
          <Link className="btn ghost small" href={`${base}/themes`}>
            Code the answers
          </Link>
        </div>
        {tally.length === 0 ? (
          <div className="card">
            <p className="note" style={{ margin: 0 }}>
              {quotes.length === 0
                ? "No written answers yet."
                : `${n(quotes.length)} written answers are in, none coded yet. Themes appear here once you accept or choose codes on the Themes screen.`}
            </p>
          </div>
        ) : (
          <div className="cols">
            <div className="card">
              <div className="card-head">
                <div>
                  <h3>Themes</h3>
                  <p>{n(quotes.length - uncoded)} of {n(quotes.length)} written answers carry a theme.</p>
                </div>
              </div>
              <div className="bars">
                {tally.map((t) => (
                  <div className="row" key={t.code}>
                    <span className="lab" title={t.label}>{t.label}</span>
                    <span className="track">
                      <span className="fill" style={{ width: `${(t.respondents / topTheme) * 100}%` }} />
                    </span>
                    <span className="val">{n(t.respondents)}</span>
                  </div>
                ))}
              </div>
              {evidence.story ? <p className="card-foot"><b style={{ color: "var(--ink)", fontWeight: 600 }}>Proves</b> {evidence.story}</p> : null}
            </div>
            <div className="card">
              <div className="card-head">
                <div>
                  <h3>In their words</h3>
                  <p>The most recent answer under each of the top themes.</p>
                </div>
              </div>
              {tally.slice(0, 4).map((t) => {
                const q = quotes.find((x) => x.themeCode === t.code);
                if (!q) return null;
                return (
                  <blockquote className="quote" key={t.code}>
                    <p>&ldquo;{q.text.length > 260 ? `${q.text.slice(0, 257).trimEnd()}…` : q.text}&rdquo;</p>
                    <footer>
                      {attribution(q, bandLabel(q.stratumKey))} · on {t.label.toLowerCase()} · asked &ldquo;{questionText(q.questionId)}&rdquo;
                    </footer>
                  </blockquote>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <p className="flag">
        Review flagged responses under <Link href={`${base}/responses`}>Responses</Link>, and read
        conversations under <Link href={`${base}/interviews`}>Interviews</Link>. Every figure here is
        reproduced in the <Link href={`${base}/exports`}>downloads</Link> and the methods note.
      </p>
    </>
  );
}

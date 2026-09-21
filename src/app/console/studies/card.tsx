import Link from "next/link";
import { parseStudy } from "@/core/study-schema";
import { expectedCompletes, marginAt } from "@/core/plan";
import { studyOf, latestVersion, type StudyRow } from "@/db/queries/studies";
import { funnel, handRaiseRows, reviewQueue } from "@/db/queries/analysis";
import { STATUS_WORDS } from "./[slug]/words";

const n = (x: number) => x.toLocaleString("en-US");

/** Everything a card needs, gathered once so Home and Studies show the same numbers. */
export async function studyCardFacts(study: StudyRow) {
  const version = await latestVersion(study.id).catch(() => null);
  const parsed = parseStudy(study.draftText);
  const spec = parsed.ok ? parsed.study : version ? studyOf(version) : null;
  const [f, queue, raises] = await Promise.all([
    funnel(study.id).catch(() => ({ drawn: 0, emailed: 0, loaded: 0, started: 0, completed: 0, included: 0 })),
    reviewQueue(study.id).catch(() => []),
    handRaiseRows(study.id).catch(() => []),
  ]);
  return {
    study,
    version: version?.version ?? null,
    question: spec?.question ?? null,
    questions: spec?.questions.length ?? 0,
    roles: spec?.sample.frame.roles.length ?? 0,
    funnel: f,
    expected: expectedCompletes(f.drawn),
    flagged: queue.filter((r) => r.qualityFlags.length > 0 && r.reviewStatus === "pending").length,
    raises: raises.length,
    margin: marginAt(f.included),
  };
}

export type StudyCardFacts = Awaited<ReturnType<typeof studyCardFacts>>;

export function StudyCard({ facts }: { facts: StudyCardFacts }) {
  const { study, funnel: f } = facts;
  const base = `/console/studies/${study.slug}`;
  const target = Math.max(facts.expected, 1);
  const share = Math.min(100, Math.round((f.completed / target) * 100));
  const stage =
    study.status === "draft"
      ? facts.version ? "Published, not yet in the field" : "Draft, not yet published"
      : study.status === "closed"
        ? "Closed"
        : f.drawn === 0
          ? "No sample drawn yet"
          : `${n(f.completed)} of about ${n(facts.expected)} expected`;

  return (
    <div className="card study-card">
      <div>
        <div className="head">
          <Link className="primary" href={base}>
            {study.name}
          </Link>
          <span className={`pill ${study.status}`}>{STATUS_WORDS[study.status] ?? study.status}</span>
          {facts.version ? <span className="state">version {facts.version}</span> : null}
        </div>
        <p className={facts.question ? "q" : "q none"}>
          {facts.question ?? "No question written yet. Add one on the Brief screen."}
        </p>
        <div className="facts">
          <span>
            <b>{facts.questions}</b> questions
          </span>
          <span>
            <b>{facts.roles}</b> {facts.roles === 1 ? "list" : "lists"} asked
          </span>
          <span>
            <b>{n(f.included)}</b> in the analysis
          </span>
          {facts.margin !== null ? (
            <span>
              about <b>±{facts.margin}</b> points
            </span>
          ) : null}
          <span>
            <b>{n(facts.raises)}</b> raised a hand
          </span>
          {facts.flagged > 0 ? (
            <span>
              <b className="low">{n(facts.flagged)}</b> flagged to review
            </span>
          ) : null}
        </div>
      </div>
      <div className="side">
        <span className="line">
          <span>{stage}</span>
          {f.drawn > 0 ? <b>{share}%</b> : null}
        </span>
        <span className="meter" aria-hidden="true">
          <i className={facts.flagged > 0 ? "warn" : undefined} style={{ width: `${f.drawn > 0 ? share : 0}%` }} />
        </span>
        <div className="links">
          <Link className="btn ghost small" href={`${base}/findings`}>
            Findings
          </Link>
          <Link className="btn ghost small" href={`${base}/leads`}>
            Leads
          </Link>
          <Link className="btn ghost small" href={`${base}/report`}>
            Report
          </Link>
        </div>
      </div>
    </div>
  );
}

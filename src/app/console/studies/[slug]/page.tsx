import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, CheckCircle2, Flag, Send } from "lucide-react";
import { isSignedIn } from "@/lib/auth";
import { parseStudy, readyToSend } from "@/core/study-schema";
import { expectedCompletes, marginAt } from "@/core/plan";
import { responseCounts, studyAndVersion, studyOf, versionsOf } from "@/db/queries/studies";
import { reviewQueue, handRaiseRows } from "@/db/queries/analysis";
import { pausedReason, touchesSoFar } from "@/db/queries/sending";
import { readSettings } from "@/lib/settings";
import { planTouch, whyBlocked, type TouchPlan } from "@/lib/sending";
import { analyse } from "@/lib/study-analysis";
import { changeStatus } from "../actions";
import { STATUS_WORDS } from "./words";

export const dynamic = "force-dynamic";

const n = (x: number) => x.toLocaleString("en-US");
const pct = (num: number, den: number) => (den > 0 ? `${Math.round((num / den) * 100)}%` : "—");

// The first screen of a study answers one question: how is it going, and what is next.
export default async function StudyOverview({ params }: { params: Promise<{ slug: string }> }) {
  if (!(await isSignedIn())) redirect("/console/login");
  const { slug } = await params;

  const found = await studyAndVersion(slug);
  if (!found) {
    return (
      <>
        <h1>Not found</h1>
        <p className="sub">
          There is no study called {slug}. <Link href="/console/studies">Back to studies</Link>
        </p>
      </>
    );
  }

  const { study, version } = found;
  const parsed = parseStudy(study.draftText);
  const spec = parsed.ok ? parsed.study : version ? studyOf(version) : null;
  const sendable = readyToSend(study.draftText);
  const base = `/console/studies/${slug}`;

  const [versions, counts, settings, manual, raises] = await Promise.all([
    versionsOf(study.id),
    responseCounts(study.id).catch(() => ({ started: 0, complete: 0 })),
    readSettings(),
    pausedReason(study.id).catch(() => null),
    handRaiseRows(study.id).catch(() => []),
  ]);

  const a = spec ? await analyse(spec, study.id).catch(() => null) : null;
  const queue = await reviewQueue(study.id).catch(() => []);
  const flaggedPending = queue.filter((r) => r.qualityFlags.length > 0 && r.reviewStatus === "pending").length;

  const sent = await touchesSoFar(study.id).catch(() => []);
  const sentByTouch = new Map(sent.map((s) => [s.touch, s]));
  const nextTouchSpec = spec?.sequence.find((t) => !sentByTouch.has(t.touch)) ?? null;
  const nextPlan: TouchPlan | null =
    spec && nextTouchSpec ? await planTouch(spec, study.id, nextTouchSpec.touch, settings).catch(() => null) : null;
  const blocked = spec ? await whyBlocked(spec, study.draftText, settings, study.id, manual) : null;

  const f = a?.funnel ?? { drawn: 0, emailed: 0, loaded: 0, started: 0, completed: 0, included: 0 };
  const excluded = (a?.rows.length ?? 0) - (a?.included.length ?? 0);
  const expected = expectedCompletes(f.drawn);
  const days = a?.fieldedFrom ? Math.max(1, Math.round((Date.now() - a.fieldedFrom.getTime()) / 86_400_000)) : null;
  const margin = marginAt(f.included);

  const next = (() => {
    if (!parsed.ok) return { k: "Blocked", text: "The study file has problems. Nothing can run until they are fixed.", href: `${base}/file`, label: "Fix the file" };
    if (!version) return { k: "Next step", text: "Nothing is published yet. Publishing freezes the file as version 1, which every link and response then refers to.", href: `${base}/file`, label: "Publish version 1" };
    if (!sendable) return { k: "Next step", text: "The file still contains CHANGE_ME. Emails cannot go out until those are filled in.", href: `${base}/edit`, label: "Fill them in" };
    if (f.drawn === 0) return { k: "Next step", text: "Nobody has been drawn into this study. The sample screen shows every count before anything is drawn.", href: `${base}/sample`, label: "Draw the sample" };
    if (study.status === "closed") return { k: "Closed", text: "This study is closed. Its findings, leads and report are ready.", href: `${base}/report`, label: "The report" };
    if (flaggedPending > 0) return { k: "Waiting on you", text: `${n(flaggedPending)} flagged ${flaggedPending === 1 ? "response is" : "responses are"} waiting for a decision. A flag is a thing to look at, not a verdict.`, href: `${base}/responses`, label: "Review them" };
    if (nextTouchSpec && nextPlan) {
      if (blocked?.blocked) return { k: "Blocked", text: `Touch ${nextTouchSpec.touch} is due, but sending is blocked: ${blocked.reason}`, href: `${base}/follow-ups`, label: "Follow-ups" };
      return { k: "Next step", text: `Touch ${nextTouchSpec.touch}, day ${nextTouchSpec.day}, would go to ${n(nextPlan.result.send.length)} people. Nothing is sent until you press the button on that screen.`, href: `${base}/follow-ups`, label: "Follow-ups" };
    }
    return { k: "In the field", text: "Every touch has gone out. Watch the findings fill in, then close the study when fielding ends.", href: `${base}/findings`, label: "Findings" };
  })();

  return (
    <>
      <p className="sub" style={{ margin: "-6px 0 16px" }}>
        {STATUS_WORDS[study.status] ?? study.status}
        {version ? ` · published version ${version.version}` : " · never published"}
        {` · ${n(counts.complete)} complete of ${n(counts.started)} started`}
        {spec ? ` · ${spec.questions.length} questions on the ${spec.engine} engine` : ""}
      </p>

      <div className="next">
        <span>
          <span className="k">{next.k}</span>
          {next.text}
        </span>
        <Link className="btn" href={next.href}>
          {next.label}
        </Link>
      </div>

      <div className="stats">
        <div className="stat good">
          <span className="k">
            Completed <CheckCircle2 size={15} aria-hidden="true" />
          </span>
          <span className="n">
            {n(f.completed)}
            <small>of {n(f.drawn)} drawn</small>
          </span>
          <span className="l">
            {f.drawn > 0 ? <>About <b>{n(expected)}</b> expected from this sample · {pct(f.completed, f.drawn)} so far</> : "Nothing drawn yet"}
          </span>
        </div>
        <div className={flaggedPending > 0 ? "stat warn" : "stat"}>
          <span className="k">
            In the analysis <Flag size={15} aria-hidden="true" />
          </span>
          <span className="n">
            {n(f.included)}
            {excluded > 0 ? <small>{n(excluded)} excluded</small> : null}
          </span>
          <span className="l">
            {margin !== null ? <>About ±{margin} points on a share</> : "No margin yet"}
            {flaggedPending > 0 ? <>, <b>{n(flaggedPending)} flagged to review</b></> : ""}
          </span>
        </div>
        <div className={blocked?.blocked ? "stat warn" : "stat"}>
          <span className="k">
            Next email <Send size={15} aria-hidden="true" />
          </span>
          <span className="n">
            {nextTouchSpec ? `Touch ${nextTouchSpec.touch}` : sent.length > 0 ? "Sent" : "—"}
            {nextPlan ? <small>{n(nextPlan.result.send.length)} due</small> : null}
          </span>
          <span className="l">
            {!spec ? "No sequence to read" : blocked?.blocked ? <b>Sending is blocked</b> : nextTouchSpec ? `Day ${nextTouchSpec.day} of the sequence` : "Every touch has gone out"}
          </span>
        </div>
        <div className="stat">
          <span className="k">
            In the field <CalendarDays size={15} aria-hidden="true" />
          </span>
          <span className="n">
            {days !== null ? n(days) : "—"}
            {days !== null ? <small>{days === 1 ? "day" : "days"}</small> : null}
          </span>
          <span className="l">
            {raises.length > 0 ? <><b>{n(raises.length)}</b> raised a hand so far</> : "Nobody has raised a hand yet"}
          </span>
        </div>
      </div>

      {a ? (
        <div className="cols" style={{ marginTop: 16 }}>
          <div className="card">
            <div className="card-head">
              <div>
                <h3>Where the sample stands</h3>
                <p>From people drawn to answers in the analysis.</p>
              </div>
              <Link className="btn ghost small" href={`${base}/results`}>
                Full results
              </Link>
            </div>
            <Funnel f={f} />
            <p className="card-foot">
              A loaded link is not an opened one: mail gateways fetch every link. Only pressing Start counts as a person.
            </p>
          </div>

          <div className="card scroll">
            <div className="card-head">
              <div>
                <h3>Coverage by size</h3>
                <p>Who has answered, and how much each answer counts.</p>
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>Band</th>
                  <th>Answered</th>
                  <th>Rate</th>
                  <th>Weight</th>
                </tr>
              </thead>
              <tbody>
                {a.coverage.map((c) => (
                  <tr key={c.key}>
                    <td style={{ textAlign: "left" }}>{c.label}</td>
                    <td>{n(c.responses)}</td>
                    <td>{c.responseRate === null ? "—" : `${Math.round(c.responseRate * 100)}%`}</td>
                    <td className={c.under ? "low" : undefined}>
                      {c.weight === null ? "—" : c.weight.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="card-foot">
              A weight above one means that band answered less than its share, so each answer counts for more. The cap is {spec?.quality.weight_cap}.
            </p>
          </div>
        </div>
      ) : (
        <p className="problem" style={{ marginTop: 16 }}>
          {parsed.ok
            ? "The numbers could not be read. Check the first line of the setup checklist."
            : "The study file has problems, so its numbers cannot be read yet."}{" "}
          <Link href={`${base}/file`}>Open the file</Link>
        </p>
      )}

      <div className="two" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="card-head">
            <div>
              <h3>Versions</h3>
              <p>Publishing freezes the file. Every response records the version it answered.</p>
            </div>
            <Link className="btn ghost small" href={`${base}/file`}>
              The whole file
            </Link>
          </div>
          {versions.length === 0 ? (
            <p className="note" style={{ margin: 0 }}>
              Never published.
            </p>
          ) : (
            <ul className="rows">
              {versions.map((v) => (
                <li key={v.id}>
                  <span>
                    Version {v.version}
                    {v.version === version?.version ? <span className="pill fielding" style={{ marginLeft: 8 }}>live</span> : null}
                  </span>
                  <span className="when">
                    {v.publishedAt.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <h3>Status</h3>
              <p>Closing a study makes every link say so kindly rather than breaking. Nothing here sends anything.</p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <StatusButtons slug={slug} current={study.status} />
          </div>
        </div>
      </div>
    </>
  );
}

function Funnel({ f }: { f: { drawn: number; emailed: number; loaded: number; started: number; completed: number; included: number } }) {
  const widest = Math.max(f.drawn, 1);
  const steps: [string, number][] = [
    ["Drawn", f.drawn],
    ["Emailed", f.emailed],
    ["Link loaded", f.loaded],
    ["Pressed Start", f.started],
    ["Completed", f.completed],
    ["In the analysis", f.included],
  ];
  return (
    <div className="bars">
      {steps.map(([label, value]) => (
        <div className="row" key={label}>
          <span className="lab">{label}</span>
          <span className="track">
            <span className={label === "Link loaded" || label === "Emailed" || label === "Drawn" ? "fill peer" : "fill"} style={{ width: `${Math.max(1, Math.round((value / widest) * 100))}%` }} />
          </span>
          <span className="val">{n(value)}</span>
        </div>
      ))}
    </div>
  );
}

function StatusButtons({ slug, current }: { slug: string; current: string }) {
  const options = [
    { value: "draft", label: "Draft" },
    { value: "pilot", label: "In pilot" },
    { value: "fielding", label: "Fielding" },
    { value: "closed", label: "Closed" },
  ];
  return (
    <>
      {options.map((o) => (
        <form key={o.value} action={changeStatus}>
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="status" value={o.value} />
          <button className="btn ghost" type="submit" disabled={current === o.value} aria-current={current === o.value}>
            {STATUS_WORDS[o.value] ?? o.label}
          </button>
        </form>
      ))}
    </>
  );
}

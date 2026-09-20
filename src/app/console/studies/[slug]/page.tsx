import Link from "next/link";
import { redirect } from "next/navigation";
import { isSignedIn } from "@/lib/auth";
import { parseStudy, readyToSend } from "@/core/study-schema";
import { responseCounts, studyAndVersion, studyOf, versionsOf } from "@/db/queries/studies";
import { reviewQueue } from "@/db/queries/analysis";
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

  const [versions, counts, settings, manual] = await Promise.all([
    versionsOf(study.id),
    responseCounts(study.id).catch(() => ({ started: 0, complete: 0 })),
    readSettings(),
    pausedReason(study.id).catch(() => null),
  ]);

  const a = spec ? await analyse(spec, study.id).catch(() => null) : null;
  const queue = await reviewQueue(study.id).catch(() => []);
  const flaggedPending = queue.filter((r) => r.qualityFlags.length > 0 && r.reviewStatus === "pending").length;

  // Which touch is next, and whether anything stands in the way of sending it.
  const sent = await touchesSoFar(study.id).catch(() => []);
  const sentByTouch = new Map(sent.map((s) => [s.touch, s]));
  const nextTouchSpec = spec?.sequence.find((t) => !sentByTouch.has(t.touch)) ?? null;
  const nextPlan: TouchPlan | null =
    spec && nextTouchSpec ? await planTouch(spec, study.id, nextTouchSpec.touch, settings).catch(() => null) : null;
  const blocked = spec ? await whyBlocked(spec, study.draftText, settings, study.id, manual) : null;

  const f = a?.funnel ?? { drawn: 0, emailed: 0, loaded: 0, started: 0, completed: 0, included: 0 };
  const excluded = (a?.rows.length ?? 0) - (a?.included.length ?? 0);

  // One sentence and one button, chosen from where the study actually is.
  const next = (() => {
    if (!parsed.ok) return { text: "The study file has problems. Nothing can run until they are fixed.", href: `${base}/file`, label: "Fix the file" };
    if (!version) return { text: "Nothing is published yet. Publishing freezes the file as version 1, which every link and response then refers to.", href: `${base}/file`, label: "Publish version 1" };
    if (!sendable) return { text: "The file still contains CHANGE_ME. Emails cannot go out until those are filled in.", href: `${base}/edit`, label: "Fill them in" };
    if (f.drawn === 0) return { text: "Nobody has been drawn into this study. The sample screen shows every count before anything is drawn.", href: `${base}/sample`, label: "Draw the sample" };
    if (study.status === "closed") return { text: "This study is closed. Its numbers, the review queue and the methods note are ready to export.", href: `${base}/exports`, label: "Exports" };
    if (flaggedPending > 0) return { text: `${n(flaggedPending)} flagged ${flaggedPending === 1 ? "response is" : "responses are"} waiting for a decision. A flag is a thing to look at, not a verdict.`, href: `${base}/responses`, label: "Review them" };
    if (nextTouchSpec && nextPlan) {
      if (blocked?.blocked) return { text: `Touch ${nextTouchSpec.touch} is due, but sending is blocked: ${blocked.reason}`, href: `${base}/follow-ups`, label: "Follow-ups" };
      return { text: `Touch ${nextTouchSpec.touch}, day ${nextTouchSpec.day}, would go to ${n(nextPlan.result.send.length)} people. Nothing is sent until you press the button on that screen.`, href: `${base}/follow-ups`, label: "Follow-ups" };
    }
    return { text: "Every touch has gone out. Watch responses come in, then close the study when fielding ends.", href: `${base}/results`, label: "Results" };
  })();

  return (
    <>
      <p className="sub" style={{ marginTop: -6 }}>
        {STATUS_WORDS[study.status] ?? study.status}
        {version ? ` · published version ${version.version}` : " · never published"}
        {` · ${n(counts.complete)} complete of ${n(counts.started)} started`}
        {spec ? ` · ${spec.questions.length} questions on the ${spec.engine} engine` : ""}
      </p>

      <div className="next">
        <span>{next.text}</span>
        <Link className="btn" href={next.href}>
          {next.label}
        </Link>
      </div>

      <div className="stats">
        <div className="stat">
          <span className="n">
            {n(f.completed)}
            <small>of {n(f.drawn)} drawn</small>
          </span>
          <span className="l">Completed</span>
        </div>
        <div className="stat">
          <span className="n">{pct(f.completed, f.drawn)}</span>
          <span className="l">Response rate, against everyone drawn</span>
        </div>
        <div className={flaggedPending > 0 ? "stat warn" : "stat"}>
          <span className="n">
            {n(f.included)}
            {excluded > 0 ? <small>{n(excluded)} excluded</small> : null}
          </span>
          <span className="l">
            In the analysis{flaggedPending > 0 ? <>, <b>{n(flaggedPending)} flagged to review</b></> : ""}
          </span>
        </div>
        <div className={blocked?.blocked ? "stat warn" : "stat"}>
          <span className="n">
            {nextTouchSpec ? `Touch ${nextTouchSpec.touch}` : sent.length > 0 ? "Sent" : "—"}
            {nextPlan ? <small>{n(nextPlan.result.send.length)} due</small> : null}
          </span>
          <span className="l">
            {!spec
              ? "No sequence to read"
              : blocked?.blocked
                ? <b>Sending is blocked</b>
                : nextTouchSpec
                  ? `Next email, day ${nextTouchSpec.day}`
                  : "Every touch has gone out"}
          </span>
        </div>
      </div>

      {a ? (
        <div className="cols" style={{ marginTop: 18 }}>
          <div className="panel">
            <span className="label">Where the sample stands</span>
            <Funnel f={f} />
            <p className="note">
              A loaded link is not an opened one: mail gateways fetch every link. Only pressing
              Start counts as a person. <Link href={`${base}/results`}>Full results</Link>
            </p>
          </div>

          <div className="panel scroll">
            <span className="label">Coverage by population band</span>
            <table>
              <thead>
                <tr>
                  <th>Band</th>
                  <th>Answered</th>
                  <th>Rate</th>
                  <th>Weight</th>
                </tr>
              </thead>
              <tbody>
                {a.coverage.map((c) => (
                  <tr key={c.key}>
                    <td>{c.label}</td>
                    <td>{n(c.responses)}</td>
                    <td>{c.responseRate === null ? "—" : `${Math.round(c.responseRate * 100)}%`}</td>
                    <td className={c.under ? "low" : undefined}>
                      {c.weight === null ? "—" : c.weight.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="note">
              A weight above one means that band answered less than its share, so each answer
              counts for more. The cap is {spec?.quality.weight_cap}.
            </p>
          </div>
        </div>
      ) : (
        <p className="problem" style={{ marginTop: 18 }}>
          {parsed.ok
            ? "The numbers could not be read. Check the first line of the setup checklist."
            : "The study file has problems, so its numbers cannot be read yet."}{" "}
          <Link href={`${base}/file`}>Open the file</Link>
        </p>
      )}

      <div className="two" style={{ marginTop: 18 }}>
        <div className="panel">
          <span className="label">Versions</span>
          {versions.length === 0 ? (
            <p className="note" style={{ margin: 0 }}>
              Never published. Publishing freezes the file as a version, and every response
              records which version it answered. <Link href={`${base}/file`}>Publish</Link>
            </p>
          ) : (
            <ul className="rows">
              {versions.map((v) => (
                <li key={v.id}>
                  <span>
                    Version {v.version}
                    {v.version === version?.version ? <span className="state"> — live</span> : null}
                  </span>
                  <span className="when">
                    {v.publishedAt.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="panel">
          <span className="label">Status</span>
          <p className="note" style={{ margin: "0 0 12px" }}>
            Closing a study makes every link say so kindly rather than breaking. Nothing here
            sends anything.
          </p>
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
    <ul className="funnel">
      {steps.map(([label, value]) => (
        <li key={label}>
          <span>{label}</span>
          <span className="bar" style={{ width: bar(value) }} />
          <span className="n">{n(value)}</span>
        </li>
      ))}
    </ul>
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
            {o.label}
          </button>
        </form>
      ))}
    </>
  );
}

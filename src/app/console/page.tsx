import Link from "next/link";
import { redirect } from "next/navigation";
import { isSignedIn } from "@/lib/auth";
import { checklist } from "@/lib/health-facts";
import { checklistReady } from "@/core/health";
import { parseStudy } from "@/core/study-schema";
import { listStudies, responseCounts, studyOf, latestVersion } from "@/db/queries/studies";
import { reviewQueue, handRaiseRows } from "@/db/queries/analysis";
import { pausedReason, touchesSoFar } from "@/db/queries/sending";
import { needsReviewCount, panelMemberRows } from "@/db/queries/contacts";
import { recentActivity } from "@/lib/activity";
import { readSettings } from "@/lib/settings";
import { planTouch, whyBlocked } from "@/lib/sending";
import { STATUS_WORDS } from "./studies/[slug]/words";

export const dynamic = "force-dynamic";

const n = (x: number) => x.toLocaleString("en-US");

const ACTIVITY_WORDS: Record<string, string> = {
  sign_in: "Signed in",
  sign_in_failed: "A sign-in was refused",
  sign_out: "Signed out",
  settings_saved: "Settings saved",
};

// The first visit opens the checklist, not an empty dashboard (NO_TERMINAL.md). Once there is
// a study to run, this screen says what is waiting: touches due, responses to review, people
// who raised a hand.
export default async function Console() {
  if (!(await isSignedIn())) redirect("/console/login");

  const checks = await checklist();
  const ready = checklistReady(checks);
  const remaining = checks.filter((c) => c.state === "todo");

  let studies: Awaited<ReturnType<typeof listStudies>> = [];
  try {
    studies = await listStudies();
  } catch {
    studies = [];
  }

  if (studies.length === 0 && !ready) return <Checklist checks={checks} />;

  const settings = await readSettings();
  const running = studies.filter((s) => s.status === "fielding" || s.status === "pilot");

  const cards = await Promise.all(
    running.map(async (study) => {
      const version = await latestVersion(study.id).catch(() => null);
      const parsed = parseStudy(study.draftText);
      const spec = parsed.ok ? parsed.study : version ? studyOf(version) : null;
      const [counts, queue, raises, sent, manual] = await Promise.all([
        responseCounts(study.id).catch(() => ({ started: 0, complete: 0 })),
        reviewQueue(study.id).catch(() => []),
        handRaiseRows(study.id).catch(() => []),
        touchesSoFar(study.id).catch(() => []),
        pausedReason(study.id).catch(() => null),
      ]);
      const sentTouches = new Set(sent.map((s) => s.touch));
      const nextTouch = spec?.sequence.find((t) => !sentTouches.has(t.touch)) ?? null;
      const plan = spec && nextTouch ? await planTouch(spec, study.id, nextTouch.touch, settings).catch(() => null) : null;
      const blocked = spec ? await whyBlocked(spec, study.draftText, settings, study.id, manual) : null;
      return {
        study,
        counts,
        flagged: queue.filter((r) => r.qualityFlags.length > 0 && r.reviewStatus === "pending").length,
        raises: raises.length,
        nextTouch,
        due: plan?.result.send.length ?? 0,
        blocked: blocked?.blocked ? blocked.reason : null,
      };
    }),
  );

  const [review, panel, activity] = await Promise.all([
    needsReviewCount().catch(() => 0),
    panelMemberRows().catch(() => []),
    recentActivity(8),
  ]);

  const flaggedTotal = cards.reduce((a, c) => a + c.flagged, 0);
  const dueTotal = cards.reduce((a, c) => a + c.due, 0);
  const raisesTotal = cards.reduce((a, c) => a + c.raises, 0);

  return (
    <>
      <h1>Home</h1>
      <p className="sub">
        {running.length === 0
          ? `${n(studies.length)} ${studies.length === 1 ? "study" : "studies"}, none fielding right now.`
          : `${n(running.length)} ${running.length === 1 ? "study is" : "studies are"} in the field.`}
      </p>

      {!ready ? (
        <div className="next">
          <span>
            {remaining.length === 1
              ? `One setup item is still to do: ${remaining[0]?.label ?? ""}.`
              : `${remaining.length} setup items are still to do.`}{" "}
            Each says what is missing and where to fix it.
          </span>
          <Link className="btn ghost" href="/console/settings">
            Setup checklist
          </Link>
        </div>
      ) : null}

      <div className="stats">
        <div className={dueTotal > 0 ? "stat" : "stat"}>
          <span className="n">{n(dueTotal)}</span>
          <span className="l">People due an email, across every study</span>
        </div>
        <div className={flaggedTotal > 0 ? "stat warn" : "stat"}>
          <span className="n">{n(flaggedTotal)}</span>
          <span className="l">Flagged responses waiting for a decision</span>
        </div>
        <div className="stat">
          <span className="n">{n(raisesTotal)}</span>
          <span className="l">Hand-raises from people in the field</span>
        </div>
        <div className={review > 0 ? "stat warn" : "stat"}>
          <span className="n">{n(review)}</span>
          <span className="l">Contact rows that need matching</span>
        </div>
      </div>

      <h2>In the field</h2>
      {cards.length === 0 ? (
        <div className="panel">
          <p className="note" style={{ margin: 0 }}>
            Nothing is fielding.{" "}
            {studies.length === 0 ? (
              <Link href="/console/studies/new">Start a study from a template</Link>
            ) : (
              <Link href="/console/studies">Open a study</Link>
            )}
            .
          </p>
        </div>
      ) : (
        cards.map((c) => (
          <div className="panel" key={c.study.id}>
            <div className="index">
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <Link className="primary" href={`/console/studies/${c.study.slug}`} style={{ fontSize: 16 }}>
                  {c.study.name}
                </Link>
                <span className={`pill ${c.study.status}`}>{STATUS_WORDS[c.study.status]}</span>
              </div>
            </div>
            <ul className="rows" style={{ marginTop: 8 }}>
              <li>
                <span>Completed</span>
                <span className="when">
                  {n(c.counts.complete)} of {n(c.counts.started)} started
                </span>
              </li>
              <li>
                <span>
                  {c.blocked ? (
                    <>
                      Next email is blocked <span className="state">— {c.blocked}</span>
                    </>
                  ) : c.nextTouch ? (
                    <Link href={`/console/studies/${c.study.slug}/follow-ups`}>
                      Touch {c.nextTouch.touch}, day {c.nextTouch.day}, is next
                    </Link>
                  ) : (
                    "Every touch has gone out"
                  )}
                </span>
                <span className="when">{c.nextTouch ? `${n(c.due)} due` : ""}</span>
              </li>
              <li>
                <span>
                  {c.flagged > 0 ? (
                    <Link href={`/console/studies/${c.study.slug}/responses`}>Flagged responses to review</Link>
                  ) : (
                    "Flagged responses to review"
                  )}
                </span>
                <span className={c.flagged > 0 ? "when low" : "when"}>{n(c.flagged)}</span>
              </li>
              <li>
                <span>
                  {c.raises > 0 ? (
                    <Link href={`/console/studies/${c.study.slug}/exports`}>Hand-raises</Link>
                  ) : (
                    "Hand-raises"
                  )}
                </span>
                <span className="when">{n(c.raises)}</span>
              </li>
            </ul>
          </div>
        ))
      )}

      <div className="two" style={{ marginTop: 30 }}>
        <div>
          <h2>Recently</h2>
          <div className="panel">
            {activity.length === 0 ? (
              <p className="note" style={{ margin: 0 }}>
                Nothing logged yet.
              </p>
            ) : (
              <ul className="rows">
                {activity.map((row) => (
                  <li key={row.id}>
                    <span>{ACTIVITY_WORDS[row.action] ?? row.action.replace(/_/g, " ")}</span>
                    <span className="when">
                      {row.createdAt
                        ? row.createdAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
                        : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="note">
              <Link href="/console/activity">Everything that happened</Link>
            </p>
          </div>
        </div>
        <div>
          <h2>The panel</h2>
          <div className="panel">
            <span className="stat-inline">
              <b style={{ fontFamily: "var(--read)", fontSize: 32, fontWeight: 500, lineHeight: 1.05 }}>{n(panel.length)}</b>
            </span>
            <p className="note" style={{ margin: "6px 0 0" }}>
              officials who asked to keep hearing from us. Everyone here ticked a box at the end
              of a survey; nobody is added any other way.{" "}
              <Link href="/console/contacts/panel">The panel</Link>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

function Checklist({ checks }: { checks: Awaited<ReturnType<typeof checklist>> }) {
  const remaining = checks.filter((c) => c.state === "todo").length;
  return (
    <>
      <h1>Setting up</h1>
      <p className="sub">
        {remaining} of {checks.length} still to do. Each line says what is missing and where to fix it.
      </p>

      <div className="panel" style={{ marginTop: 16 }}>
        <ul className="checks">
          {checks.map((c) => (
            <li key={c.id}>
              <span className={`dot ${c.state}`} aria-hidden="true" />
              <div>
                <b>{c.label}</b>{" "}
                <span className="state">{c.state === "ok" ? "Done" : "Still to do"}</span>
                <p>{c.detail}</p>
                {c.fix ? (
                  c.fix.href.startsWith("http") ? (
                    <a className="fix" href={c.fix.href} target="_blank" rel="noreferrer noopener">
                      {c.fix.label}
                    </a>
                  ) : (
                    <Link className="fix" href={c.fix.href}>
                      {c.fix.label}
                    </Link>
                  )
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </div>

      <p className="flag">
        This checklist also lives at <Link href="/console/settings">Settings</Link>, and reflects
        this deployment right now. Changing a variable needs a redeploy from the Railway
        dashboard before it shows here.
      </p>
    </>
  );
}

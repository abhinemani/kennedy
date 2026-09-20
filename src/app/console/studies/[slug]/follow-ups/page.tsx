import Link from "next/link";
import { redirect } from "next/navigation";
import { isSignedIn } from "@/lib/auth";
import { parseStudy } from "@/core/study-schema";
import type { Reason } from "@/core/audience";
import { studyAndVersion, studyOf } from "@/db/queries/studies";
import { pausedReason, sentToday, touchesSoFar } from "@/db/queries/sending";
import { readSettings } from "@/lib/settings";
import { deliveryHealth, planTouch, previewMessage, whyBlocked, type TouchPlan } from "@/lib/sending";
import { Nav } from "../../../nav";
import { QueueForm, PauseForm } from "./forms";

export const dynamic = "force-dynamic";

const REASON_WORDS: Record<Reason, string> = {
  completed: "already answered",
  suppressed: "unsubscribed or suppressed",
  invalid_email: "email known to be undeliverable",
  recently_surveyed: "asked by another study recently",
  not_started: "has not started the survey",
  already_sent: "already had this one",
};

export default async function FollowUps({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  if (!(await isSignedIn())) redirect("/console/login");
  const { slug } = await params;
  const { preview } = await searchParams;

  const found = await studyAndVersion(slug);
  if (!found) redirect("/console/studies");
  const { study, version } = found;

  const parsed = parseStudy(study.draftText);
  const spec = parsed.ok ? parsed.study : version ? studyOf(version) : null;

  if (!spec) {
    return (
      <>
        <Nav current="/console/studies" />
        <h1>Follow-ups</h1>
        <p className="problem">
          The study file has problems, so its emails cannot be read.{" "}
          <Link href={`/console/studies/${slug}`}>Fix them on the study screen</Link>.
        </p>
      </>
    );
  }

  const settings = await readSettings();
  const manual = await pausedReason(study.id).catch(() => null);
  const blocked = await whyBlocked(spec, study.draftText, settings, study.id, manual);

  const plans = (
    await Promise.all(spec.sequence.map((t) => planTouch(spec, study.id, t.touch, settings).catch(() => null)))
  ).filter((p): p is TouchPlan => p !== null);

  const [already, today, health] = await Promise.all([
    touchesSoFar(study.id).catch(() => []),
    sentToday(study.id).catch(() => 0),
    deliveryHealth(study.id, settings).catch(() => null),
  ]);
  const sentByTouch = new Map(already.map((a) => [a.touch, a]));

  const previewTouch = preview ? Number(preview) : null;
  const rendered = previewTouch ? previewMessage(spec, previewTouch, settings) : null;

  return (
    <>
      <Nav current="/console/studies" />
      <h1>Follow-ups</h1>
      <p className="sub">
        {study.name}. Every email is plain text with one survey link, a postal address, and an
        unsubscribe link. The provider is {settings.sendProvider === "dryrun"
          ? "dry run, so nothing leaves the system"
          : settings.sendProvider === "csv"
            ? "a merge file you send yourself"
            : settings.sendProvider}.
      </p>

      {blocked.blocked ? (
        <p className="problem" role="alert">
          {blocked.reason}
        </p>
      ) : (
        <p className="ok-note">
          Nothing is blocking a send. {today.toLocaleString("en-US")} of today&rsquo;s{" "}
          {settings.perInboxDailyLimit.toLocaleString("en-US")} have been used.
        </p>
      )}

      {health ? (
        <div className="panel" style={{ marginTop: 16 }}>
          <p className="note" style={{ margin: 0 }}>
            Of the last {health.sends.toLocaleString("en-US")} emails a provider reported on,{" "}
            {(health.bounce * 100).toFixed(1)}% bounced and {(health.complaint * 100).toFixed(2)}%
            were marked as spam.
            {health.hot
              ? " That is above your thresholds. Resuming while it stays there risks the domain."
              : " Both are under your thresholds."}
          </p>
        </div>
      ) : null}

      <PauseForm slug={slug} paused={Boolean(manual)} hot={Boolean(health?.hot)} />

      {plans.map((plan) => {
        const sent = sentByTouch.get(plan.touch);
        return (
          <section key={plan.touch}>
            <h2>
              Touch {plan.touch} — day {plan.day}
              {plan.audience === "started_only" ? ", only people who started" : ""}
            </h2>

            <div className="panel">
              {sent ? (
                <p className="note" style={{ margin: "0 0 10px" }}>
                  {sent.n.toLocaleString("en-US")} already went out
                  {sent.at ? ` on ${sent.at.toLocaleDateString("en-US", { dateStyle: "medium" })}` : ""}.
                </p>
              ) : null}

              <ul className="rows">
                <li>
                  <span>
                    <b style={{ fontWeight: 500 }}>Would receive this touch</b>
                  </span>
                  <span className="when">{plan.result.send.length.toLocaleString("en-US")}</span>
                </li>
                {(Object.entries(plan.result.excluded) as [Reason, number][]).map(([reason, n]) => (
                  <li key={reason}>
                    <span>
                      Left out: {REASON_WORDS[reason]}
                    </span>
                    <span className="when">{n.toLocaleString("en-US")}</span>
                  </li>
                ))}
                {plan.heldByThrottle > 0 ? (
                  <li>
                    <span>Held back by today&rsquo;s limit</span>
                    <span className="when">{plan.heldByThrottle.toLocaleString("en-US")}</span>
                  </li>
                ) : null}
              </ul>

              <p className="note">
                {plan.subjects.length === 1
                  ? `Subject: ${plan.subjects[0]}`
                  : `${plan.subjects.length} subject lines, split evenly and stably per person.`}
              </p>

              <div className="nav">
                <Link className="btn ghost" href={`/console/studies/${slug}/follow-ups?preview=${plan.touch}`}>
                  Preview this email
                </Link>
                {sent && settings.sendProvider === "csv" ? (
                  <a className="btn ghost" href={`/console/studies/${slug}/follow-ups/${plan.touch}/download`}>
                    Download the merge file
                  </a>
                ) : null}
                <QueueForm
                  slug={slug}
                  touch={plan.touch}
                  willSend={plan.willSend}
                  blocked={blocked.blocked}
                  provider={settings.sendProvider}
                />
              </div>
            </div>
          </section>
        );
      })}

      {rendered ? (
        <>
          <h2>Touch {previewTouch}, as it would arrive</h2>
          <div className="panel">
            {rendered.problem ? (
              <p className="problem">{rendered.problem}</p>
            ) : (
              <p className="note" style={{ marginTop: 0 }}>
                This is a stand-in recipient. Real links carry each person&rsquo;s own token.
              </p>
            )}
            {rendered.subjects.map((s, i) => (
              <p key={i} className="note" style={{ margin: "0 0 4px" }}>
                <b style={{ fontWeight: 500 }}>Subject {rendered.subjects.length > 1 ? i + 1 : ""}:</b> {s}
              </p>
            ))}
            <pre style={{ whiteSpace: "pre-wrap" }}>{rendered.body}</pre>
          </div>
        </>
      ) : null}

      <p className="flag">
        Nobody is emailed twice for the same touch, and anyone who has answered drops out of every
        later one. <Link href={`/console/studies/${slug}`}>Back to the study</Link>
      </p>
    </>
  );
}

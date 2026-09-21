import { redirect } from "next/navigation";
import Link from "next/link";
import { linkFor, recordLoaded, responseFor } from "@/db/queries/respondent";
import { callerIpHash, userAgent } from "@/lib/request";
import { startSurvey } from "./actions";
import { fillCopy, linkScope } from "./survey";

export const dynamic = "force-dynamic";

// Rule 1: loading a link never changes state. Government email gateways fetch every URL in
// a message, so this GET records a "loaded" event and nothing else. Pressing Start is a POST.

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="wrap">
      <div className="letter">{children}</div>
    </div>
  );
}

export default async function Intro({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ problem?: string }>;
}) {
  const { token } = await params;
  const { problem } = await searchParams;
  const link = await linkFor(token);

  if (!link) {
    return (
      <Shell>
        <p className="q">This link has expired or was mistyped.</p>
        <p className="hint">
          If it came from an email we sent, open it again from that email. If it still does not
          work, reply to the message and we will send a new one.
        </p>
      </Shell>
    );
  }

  await recordLoaded(link.studyContactId, await userAgent(), await callerIpHash());

  if (link.tokenStatus === "completed") redirect(`/s/${token}/done`);

  if (link.status === "closed" || link.tokenStatus === "expired") {
    return (
      <Shell>
        <p className="q">This survey has closed. Thank you for the interest.</p>
        <p className="hint">
          Results are published as a public summary. {link.study.brand.contact_email.includes("CHANGE_ME")
            ? "Reply to the email that brought you here and we will send it to you."
            : `Write to ${link.study.brand.contact_email} and we will send it to you.`}
        </p>
      </Shell>
    );
  }

  const started = await responseFor(link.studyContactId);
  const scope = linkScope(link.attributes);

  return (
    <Shell>
      <p className="q">{fillCopy(link.study.intro.title, scope)}</p>
      <p className="hint">{fillCopy(link.study.intro.body, scope)}</p>

      {problem === "origin" ? (
        <p className="problem" role="alert">
          That did not come from this page, so nothing was saved. Press Start below to carry on.
        </p>
      ) : null}
      {problem === "busy" ? (
        <p className="problem" role="alert">
          This link has been opened a lot in the last hour. Wait a few minutes and try again.
        </p>
      ) : null}

      <form action={startSurvey}>
        <input type="hidden" name="token" value={token} />
        <div className="nav stack">
          <Link className="btn ghost" href={`/s/${token}/not-me`}>
            {link.study.intro.not_me_label}
          </Link>
          <button className="btn" type="submit">
            {started ? "Pick up where you left off" : "Start the survey"}
          </button>
        </div>
      </form>

      <p className="flag">
        {link.study.brand.sponsor_line} <Link href="/privacy">How we handle your answers</Link>
      </p>
    </Shell>
  );
}

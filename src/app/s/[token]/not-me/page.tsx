import Link from "next/link";
import { linkFor } from "@/db/queries/respondent";
import { recordCorrection } from "../actions";

export const dynamic = "force-dynamic";

// Forwarding within an agency is welcome, so this screen says so plainly rather than
// treating a misdirected link as a problem to be policed.
export default async function NotMe({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { token } = await params;
  const { saved } = await searchParams;
  const link = await linkFor(token);

  if (!link) {
    return (
      <div className="wrap">
        <div className="letter">
          <p className="q">This link has expired or was mistyped.</p>
        </div>
      </div>
    );
  }

  if (saved) {
    return (
      <div className="wrap">
        <div className="letter">
          <p className="q">Thank you. That is noted.</p>
          <p className="hint">
            We will not write to you about this study again. If you passed the link to the right
            person, they can answer from the same email.
          </p>
          <div className="nav">
            <span />
            <Link className="btn ghost" href={`/s/${token}`}>
              Back to the survey
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="wrap">
      <div className="letter">
        <p className="q">Sorry about that. Who should we have written to?</p>
        <p className="hint">
          Both fields are optional. You are also welcome to forward the original email to the right
          person and let them answer from it.
        </p>

        <form action={recordCorrection}>
          <input type="hidden" name="token" value={token} />

          <label className="field" htmlFor="who_else">
            Who handles this
          </label>
          <p className="hint field-hint" id="who_else-hint">
            A job title or an email address is plenty.
          </p>
          <input aria-describedby="who_else-hint" id="who_else" type="text" name="who_else" />

          <label className="field" htmlFor="note">
            Anything else we got wrong
          </label>
          <p className="hint field-hint" id="note-hint">
            We have you down at {link.entityName}. Tell us if that is not right.
          </p>
          <textarea aria-describedby="note-hint" id="note" name="note" style={{ minHeight: 90 }} />

          <div className="nav">
            <Link className="btn ghost" href={`/s/${token}`}>
              Back
            </Link>
            <button className="btn" type="submit">
              Send this
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

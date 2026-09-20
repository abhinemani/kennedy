import { linkFor } from "@/db/queries/respondent";
import { confirmUnsubscribe } from "./actions";

export const dynamic = "force-dynamic";

// Rule 1 again, and this is the one that bites hardest: a scanner that follows every link in
// an email must not be able to unsubscribe somebody. The GET shows a button. The POST acts.
export default async function Unsubscribe({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ done?: string }>;
}) {
  const { token } = await params;
  const { done } = await searchParams;
  const link = await linkFor(token);

  if (done) {
    return (
      <div className="wrap">
        <div className="letter">
          <p className="q">You are unsubscribed.</p>
          <p className="hint">
            We will not email you again about this study or any other. Nothing else about you
            changes, and any answers you already gave stay as they are.
          </p>
        </div>
      </div>
    );
  }

  if (!link) {
    return (
      <div className="wrap">
        <div className="letter">
          <p className="q">This link has expired or was mistyped.</p>
          <p className="hint">
            If you want to stop hearing from us, reply to the email with the word stop and we will
            take care of it.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="wrap">
      <div className="letter">
        <p className="q">Stop these emails?</p>
        <p className="hint">
          This unsubscribes {link.email} from this study and from any future study. You will not be
          asked again.
        </p>
        <form action={confirmUnsubscribe}>
          <input type="hidden" name="token" value={token} />
          <div className="nav">
            <span />
            <button className="btn" type="submit">
              Unsubscribe me
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

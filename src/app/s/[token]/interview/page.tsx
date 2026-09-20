import Link from "next/link";
import { redirect } from "next/navigation";
import { INTERVIEW_DISCLOSURE, MAX_TURN_CHARS, shouldInvite } from "@/core/interview";
import { whyUnavailable } from "@/core/engines";
import { answersFor, linkFor, responseFor } from "@/db/queries/respondent";
import { interviewFor, invitedCount, turnsFor } from "@/db/queries/interview";
import { linkScope, respondentAnswers } from "../survey";
import { beginInterview, replyToInterview, stopInterview } from "./actions";

export const dynamic = "force-dynamic";

// The interview stage. It says what it is on every screen: an AI working from a researcher's
// guide, skippable, stoppable, and anonymous unless the respondent says otherwise.
export default async function Interview({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const link = await linkFor(token);
  if (!link) redirect(`/s/${token}`);

  const stage = link.study.stages.find((s) => s.type === "interview");
  const unavailable = whyUnavailable(link.study.engine, "ai_interview");
  if (!stage || stage.type !== "interview" || unavailable || !link.study.features.ai_interview) {
    redirect(`/s/${token}/done`);
  }

  const response = await responseFor(link.studyContactId);
  if (!response) redirect(`/s/${token}`);

  const stored = await answersFor(response.id);
  const given = respondentAnswers(stored);
  const invited = await invitedCount(link.studyId, stage.id).catch(() => 0);
  const interview = await interviewFor(response.id, stage.id);

  // Nobody is offered an interview they do not qualify for, and the cap holds.
  const welcome = interview !== null || shouldInvite(stage.invite, { ...linkScope(link.attributes), ...given }, invited);
  if (!welcome) redirect(`/s/${token}/done`);

  const turns = interview ? await turnsFor(interview.id) : [];
  const done = interview?.status === "completed" || interview?.status === "abandoned";

  return (
    <div className="wrap">
      <div className="letter">
        {!interview ? (
          <>
            <p className="q">{stage.label}</p>
            <p className="hint">{INTERVIEW_DISCLOSURE}</p>
            <form action={beginInterview}>
              <input type="hidden" name="token" value={token} />
              <div className="nav">
                <Link className="btn ghost" href={`/s/${token}/done`}>
                  No thanks
                </Link>
                <button className="btn" type="submit">
                  Start the conversation
                </button>
              </div>
            </form>
          </>
        ) : (
          <>
            <p className="probe">{INTERVIEW_DISCLOSURE}</p>

            <div className="chat">
              {turns.map((turn) => (
                <div className={`msg ${turn.speaker === "interviewer" ? "ai" : "me"}`} key={turn.n}>
                  {turn.text}
                </div>
              ))}
            </div>

            {done ? (
              <>
                <p className="hint">
                  Thank you. That is everything we wanted to ask. Your words are kept without your
                  name against them.
                </p>
                <div className="nav">
                  <span />
                  <Link className="btn" href={`/s/${token}/done`}>
                    Back to my results
                  </Link>
                </div>
              </>
            ) : (
              <form action={replyToInterview}>
                <input type="hidden" name="token" value={token} />
                <label className="field" htmlFor="reply">
                  Your reply
                </label>
                <p className="hint field-hint" id="reply-hint">
                  Skip anything you would rather not answer. You can stop whenever you like.
                </p>
                <textarea
                  id="reply"
                  name="reply"
                  aria-describedby="reply-hint"
                  maxLength={MAX_TURN_CHARS}
                  style={{ minHeight: 90 }}
                />
                <div className="nav">
                  <button className="btn ghost" type="submit" formAction={stopInterview} formNoValidate>
                    Stop here
                  </button>
                  <button className="btn" type="submit">
                    Send reply
                  </button>
                </div>
              </form>
            )}
          </>
        )}

        <p className="flag">
          {link.study.brand.sponsor_line} <Link href="/privacy">How we handle your answers</Link>
        </p>
      </div>
    </div>
  );
}

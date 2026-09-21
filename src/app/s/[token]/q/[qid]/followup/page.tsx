import { redirect } from "next/navigation";
import { visibleQuestions } from "@/core/flow";
import { answersFor, linkFor, responseFor } from "@/db/queries/respondent";
import { followupFor } from "@/db/queries/followup";
import { answerFollowup, goBack } from "../../../actions";
import { Progress } from "../../../render";
import { linkScope, respondentAnswers } from "../../../survey";

export const dynamic = "force-dynamic";

// One follow-up, written in response to what they just wrote. The screen says that plainly,
// and says it can be skipped, because a question a person did not expect deserves both.
export default async function Followup({ params }: { params: Promise<{ token: string; qid: string }> }) {
  const { token, qid } = await params;

  const link = await linkFor(token);
  if (!link) redirect(`/s/${token}`);
  if (link.tokenStatus === "completed") redirect(`/s/${token}/done`);

  const response = await responseFor(link.studyContactId);
  if (!response) redirect(`/s/${token}`);
  if (response.status === "complete") redirect(`/s/${token}/done`);

  const followup = await followupFor(response.id, qid);
  if (!followup) redirect(`/s/${token}/q/${qid}`);

  const stored = await answersFor(response.id);
  const given = respondentAnswers(stored);
  const scope = linkScope(link.attributes);
  const visible = visibleQuestions(link.study, given, scope);
  const index = visible.findIndex((v) => v.id === qid);

  return (
    <div className="wrap">
      <div className="letter" key={`${qid}-followup`}>
        <Progress done={index + 1} total={visible.length + 1} label={`${index + 1} of ${visible.length}`} />

        <p className="probe">
          One follow-up, written by an AI in response to what you just told us. Skip it if you
          would rather not.
        </p>

        <form action={answerFollowup}>
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="qid" value={qid} />

          <p className="q">{followup.generatedQuestion}</p>
          <textarea name="value" aria-label={followup.generatedQuestion} defaultValue={followup.answerText ?? ""} />

          <div className="nav">
            <button className="btn ghost" type="submit" formAction={goBack} formNoValidate>
              Back
            </button>
            <button className="btn" type="submit">
              Continue
            </button>
          </div>
          <p className="note">Leaving it empty skips it, and nothing is recorded.</p>
        </form>
      </div>
    </div>
  );
}

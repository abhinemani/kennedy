import { redirect } from "next/navigation";
import { checkPlausible, canContinue, visibleQuestions } from "@/core/flow";
import { answersFor, linkFor, responseFor } from "@/db/queries/respondent";
import { answerQuestion, goBack } from "../../actions";
import { Progress, QuestionBody, selfSubmitting } from "../../render";
import { linkScope, questionById, respondentAnswers } from "../../survey";

export const dynamic = "force-dynamic";

export default async function QuestionScreen({
  params,
  searchParams,
}: {
  params: Promise<{ token: string; qid: string }>;
  searchParams: Promise<{ problem?: string; confirm?: string }>;
}) {
  const { token, qid } = await params;
  const { problem, confirm } = await searchParams;

  const link = await linkFor(token);
  if (!link) redirect(`/s/${token}`);
  if (link.tokenStatus === "completed") redirect(`/s/${token}/done`);

  const response = await responseFor(link.studyContactId);
  if (!response) redirect(`/s/${token}`);
  if (response.status === "complete") redirect(`/s/${token}/done`);

  const q = questionById(link.study, qid);
  if (!q) redirect(`/s/${token}`);

  const stored = await answersFor(response.id);
  const given = respondentAnswers(stored);
  const scope = linkScope(link.attributes);

  const visible = visibleQuestions(link.study, given, scope);
  const index = visible.findIndex((v) => v.id === qid);
  const value = given[qid];

  // The plausibility prompt is a screen of its own so the respondent reads one thing at a time.
  const prompt = confirm ? checkPlausible(q, value, given, scope) : null;

  if (prompt) {
    return (
      <div className="wrap">
        <div className="letter" key={`${qid}-confirm`}>
          <Progress done={index + 1} total={visible.length + 1} label={`${index + 1} of ${visible.length}`} />
          <p className="q">{prompt.message}</p>
          <p className="hint">
            Either answer is fine. We ask because the number is unusual for a place this size, and
            a quick check now saves us both an email later.
          </p>
          <form action={answerQuestion}>
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="qid" value={qid} />
            <input type="hidden" name="value" value={String(value ?? "")} />
            <div className="nav">
              <button className="btn ghost" type="submit" name="confirmed" value="no">
                Let me change it
              </button>
              <button className="btn" type="submit" name="confirmed" value="yes">
                Yes, that is right
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  const optional = !q.required;
  const canSkipForward = optional && !canContinue(q, value);

  return (
    <div className="wrap">
      <div className="letter" key={qid}>
        <Progress done={index + 1} total={visible.length + 1} label={`${index + 1} of ${visible.length}`} />

        <form action={answerQuestion}>
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="qid" value={qid} />

          <p className="q">{q.text}</p>
          {q.hint ? <p className="hint">{q.hint}</p> : null}

          {problem === "required" ? (
            <p className="problem" role="alert">
              This one is needed to compare your answers with places your size. Please answer it to
              carry on.
            </p>
          ) : null}

          <QuestionBody q={q} value={value} />

          <div className="nav">
            <button className="btn ghost" type="submit" formAction={goBack}>
              Back
            </button>
            {selfSubmitting(q) ? (
              canSkipForward ? (
                <button className="btn ghost" type="submit" name="skip" value="1">
                  Skip this one
                </button>
              ) : (
                <span />
              )
            ) : (
              <button className="btn" type="submit">
                Continue
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

"use server";

import { redirect } from "next/navigation";
import { MAX_TURN_CHARS } from "@/core/interview";
import { whyUnavailable } from "@/core/engines";
import { linkFor, responseFor } from "@/db/queries/respondent";
import { addTurn, finishInterview, interviewFor, startInterview, turnsFor } from "@/db/queries/interview";
import { askAnthropic, nextMove } from "@/lib/interview";
import { modelAvailability } from "@/lib/model";
import { sameOrigin } from "@/lib/request";

async function guard(token: string) {
  if (!(await sameOrigin())) redirect(`/s/${token}/done`);
  const link = await linkFor(token);
  if (!link) redirect(`/s/${token}`);
  return link;
}

function interviewStage(study: Awaited<ReturnType<typeof linkFor>>) {
  return study?.study.stages.find((s) => s.type === "interview") ?? null;
}

/** Pressing Start is what begins an interview, and it asks the scripted opening. */
export async function beginInterview(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const link = await guard(token);

  const stage = interviewStage(link);
  if (!stage || stage.type !== "interview") redirect(`/s/${token}/done`);
  // Rule 6: the interview only exists on the native engine, and the kernel decides that.
  if (whyUnavailable(link.study.engine, "ai_interview")) redirect(`/s/${token}/done`);
  if (!link.study.features.ai_interview) redirect(`/s/${token}/done`);

  const response = await responseFor(link.studyContactId);
  if (!response) redirect(`/s/${token}`);

  const model = modelAvailability();
  const interview = await startInterview(response.id, stage.id, model.available ? model.model : null);

  const existing = await turnsFor(interview.id);
  if (existing.length === 0) {
    const move = await nextMove(stage.guide, [], interview.startedAt ?? new Date(), askAnthropic);
    if (move.kind === "question") {
      await addTurn(interview.id, "interviewer", move.text, move.topicId, move.scripted);
    } else {
      await finishInterview(interview.id, "completed");
    }
  }

  redirect(`/s/${token}/interview`);
}

export async function replyToInterview(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const link = await guard(token);

  const stage = interviewStage(link);
  if (!stage || stage.type !== "interview") redirect(`/s/${token}/done`);

  const response = await responseFor(link.studyContactId);
  if (!response) redirect(`/s/${token}`);

  const interview = await interviewFor(response.id, stage.id);
  if (!interview || interview.status !== "started") redirect(`/s/${token}/interview`);

  const said = String(formData.get("reply") ?? "").trim().slice(0, MAX_TURN_CHARS);
  if (said) await addTurn(interview.id, "respondent", said, null, false);

  const turns = await turnsFor(interview.id);
  const move = await nextMove(stage.guide, turns, interview.startedAt ?? new Date(), askAnthropic);

  if (move.kind === "end") {
    await finishInterview(interview.id, "completed");
  } else {
    await addTurn(interview.id, "interviewer", move.text, move.topicId, move.scripted);
  }

  redirect(`/s/${token}/interview`);
}

/** "Stop here" is always one tap away, and ends the conversation at once. */
export async function stopInterview(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const link = await guard(token);

  const stage = interviewStage(link);
  if (!stage) redirect(`/s/${token}/done`);

  const response = await responseFor(link.studyContactId);
  if (!response) redirect(`/s/${token}`);

  const interview = await interviewFor(response.id, stage.id);
  if (interview && interview.status === "started") {
    await finishInterview(interview.id, "completed");
  }
  redirect(`/s/${token}/interview`);
}

"use server";

import { redirect } from "next/navigation";
import { canContinue, checkPlausible, nextQuestion, previousQuestion, visibleQuestions, wantsFollowup } from "@/core/flow";
import { followupQuestion } from "@/core/followup";
import { whyUnavailable } from "@/core/engines";
import { followupFor, recordFollowup, saveFollowupAnswer } from "@/db/queries/followup";
import { generate, modelAvailability } from "@/lib/model";
import { qualityFlags } from "@/core/quality";
import {
  answersFor, joinPanel, linkFor, markComplete, medianDurationSeconds,
  otherCompletesFromEntity, recordStarted, responseFor, saveAnswer, saveHandRaises, startResponse,
} from "@/db/queries/respondent";
import { db } from "@/db/client";
import { answers as answersTable, responses as responsesTable } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { callerIpHash, sameOrigin, userAgent } from "@/lib/request";
import { tooManyRecently } from "@/lib/token-limit";
import {
  CHOICES_SAVED, confirmedImplausible, confirmedKey, isFreeText, linkScope,
  questionById, readAnswer, respondentAnswers,
} from "./survey";

async function guard(token: string) {
  if (!(await sameOrigin())) redirect(`/s/${token}?problem=origin`);
  const link = await linkFor(token);
  if (!link) redirect(`/s/${token}`);
  if (link.tokenStatus === "expired" || link.status === "closed") redirect(`/s/${token}`);
  return link;
}

/** "Opened" means a person pressed Start. This is that POST, and only this (rule 1). */
export async function startSurvey(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const link = await guard(token);

  if (link.tokenStatus === "completed") redirect(`/s/${token}/done`);
  if (await tooManyRecently(link.studyContactId, 120, 60)) redirect(`/s/${token}?problem=busy`);

  const existing = await responseFor(link.studyContactId);
  if (!existing) await recordStarted(link.studyContactId, await userAgent(), await callerIpHash());
  const response = existing ?? (await startResponse(link));

  const stored = await answersFor(response.id);
  const scope = linkScope(link.attributes);
  const first = nextQuestion(link.study, respondentAnswers(stored), scope, null);
  redirect(first ? `/s/${token}/q/${first.id}` : `/s/${token}/done`);
}

export async function answerQuestion(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const qid = String(formData.get("qid") ?? "");
  const link = await guard(token);
  if (link.tokenStatus === "completed") redirect(`/s/${token}/done`);

  const response = await responseFor(link.studyContactId);
  if (!response) redirect(`/s/${token}`);
  if (response.status === "complete") redirect(`/s/${token}/done`);

  const q = questionById(link.study, qid);
  if (!q) redirect(`/s/${token}`);

  const stored = await answersFor(response.id);
  const given = respondentAnswers(stored);
  const scope = linkScope(link.attributes);

  // "Skip this question" on an optional question moves on without recording anything.
  if (formData.get("skip")) {
    const after = nextQuestion(link.study, given, scope, qid);
    redirect(after ? `/s/${token}/q/${after.id}` : `/s/${token}/done`);
  }

  const value = readAnswer(q, formData);

  if (!canContinue(q, value)) {
    redirect(`/s/${token}/q/${qid}?problem=required`);
  }

  if (value !== undefined) {
    await saveAnswer(response.id, qid, value, isFreeText(q));
    given[qid] = value;
  }

  // A number that looks off for a place this size gets one gentle question. It never blocks.
  const confirmed = formData.get("confirmed");
  if (confirmed === null && stored[confirmedKey(qid)] === undefined) {
    const prompt = checkPlausible(q, value, given, scope);
    if (prompt) redirect(`/s/${token}/q/${qid}?confirm=1`);
  }
  if (confirmed === "no") {
    // They want to correct it, so send them back to the question rather than onward.
    redirect(`/s/${token}/q/${qid}`);
  }
  if (confirmed === "yes") {
    // They stood by an unusual number. The operator sees that at review; it excludes nothing.
    await saveAnswer(response.id, confirmedKey(qid), true, false);
  }

  // After an open answer worth following up, one question written in response to it.
  if (wantsFollowup(link.study, q, value) && !whyUnavailable(link.study.engine, "ai_followup")) {
    const asked = await askFollowup(response.id, q.id, q.text, String(value), q.type === "open" ? q.fallback : undefined);
    if (asked) redirect(`/s/${token}/q/${qid}/followup`);
  }

  const after = nextQuestion(link.study, given, scope, qid);
  redirect(after ? `/s/${token}/q/${after.id}` : `/s/${token}/done`);
}

/**
 * Generates and logs the follow-up. Returns false when there is nothing to ask, so the survey
 * simply carries on: a respondent never waits on this, and never sees it fail.
 */
async function askFollowup(
  responseId: string,
  questionId: string,
  questionText: string,
  answerText: string,
  fallback: string | undefined,
): Promise<boolean> {
  const already = await followupFor(responseId, questionId);
  if (already) return true;
  if (!fallback) return false;

  const model = modelAvailability();
  if (!model.available) {
    // No key, so the scripted question stands in. It is still logged as a fallback.
    await recordFollowup(responseId, questionId, fallback, null, true);
    return true;
  }

  const result = await followupQuestion(questionText, answerText, fallback, generate);
  await recordFollowup(responseId, questionId, result.question, model.model, result.fallbackUsed);
  return true;
}

/** The answer to the follow-up, or a skip. Either way the survey moves on. */
export async function answerFollowup(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const qid = String(formData.get("qid") ?? "");
  const link = await guard(token);

  const response = await responseFor(link.studyContactId);
  if (!response) redirect(`/s/${token}`);

  const followup = await followupFor(response.id, qid);
  if (followup) {
    const said = String(formData.get("value") ?? "").trim().slice(0, 2000);
    await saveFollowupAnswer(followup.id, said || null);
  }

  const stored = await answersFor(response.id);
  const scope = linkScope(link.attributes);
  const after = nextQuestion(link.study, respondentAnswers(stored), scope, qid);
  redirect(after ? `/s/${token}/q/${after.id}` : `/s/${token}/done`);
}

export async function goBack(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const qid = String(formData.get("qid") ?? "");
  const link = await guard(token);

  const response = await responseFor(link.studyContactId);
  if (!response) redirect(`/s/${token}`);

  const stored = respondentAnswers(await answersFor(response.id));
  const scope = linkScope(link.attributes);
  const before = previousQuestion(link.study, stored, scope, qid);
  redirect(before ? `/s/${token}/q/${before.id}` : `/s/${token}`);
}

export async function backFromEnd(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const link = await guard(token);
  const response = await responseFor(link.studyContactId);
  if (!response || response.status === "complete") redirect(`/s/${token}/done`);

  const stored = respondentAnswers(await answersFor(response.id));
  const scope = linkScope(link.attributes);
  const visible = visibleQuestions(link.study, stored, scope);
  const last = visible[visible.length - 1];
  redirect(last ? `/s/${token}/q/${last.id}` : `/s/${token}`);
}

/** "That is not me" keeps the response tied to the original government until the operator says otherwise. */
export async function recordCorrection(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const link = await guard(token);

  const response = await startResponse(link);
  const note = String(formData.get("note") ?? "").trim().slice(0, 1000);
  const whoElse = String(formData.get("who_else") ?? "").trim().slice(0, 300);

  await saveAnswer(response.id, "__corrected_identity", true, false);
  if (note) await saveAnswer(response.id, "__correction_note", note, false);
  if (whoElse) await saveAnswer(response.id, "__correction_who", whoElse, false);

  redirect(`/s/${token}/not-me?saved=1`);
}

export async function completeSurvey(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const link = await guard(token);

  const response = await responseFor(link.studyContactId);
  if (!response) redirect(`/s/${token}`);
  if (response.status === "complete") redirect(`/s/${token}/done`);

  const stored = await answersFor(response.id);
  const given = respondentAnswers(stored);

  const durationSeconds = Math.max(1, Math.round((Date.now() - response.startedAt.getTime()) / 1000));
  const flags = qualityFlags({
    durationSeconds,
    medianDurationSeconds: await medianDurationSeconds(link.studyId),
    speederSeconds: link.study.quality.speeder_seconds,
    confirmedImplausible: confirmedImplausible(stored),
    otherCompletesFromEntity: await otherCompletesFromEntity(link.studyId, link.studyContactId),
    involvement: given.involvement,
    correctedIdentity: stored.__corrected_identity === true,
  });

  const quotePermission = formData.get("quote_permission") !== null;
  await markComplete(response.id, link.studyContactId, durationSeconds, flags, quotePermission);
  redirect(`/s/${token}/done?recorded=1`);
}

/** The boxes at the end: the report, the pilot, the panel. Saved once, after the response is in. */
export async function saveChoices(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const link = await guard(token);

  const response = await responseFor(link.studyContactId);
  if (!response) redirect(`/s/${token}`);
  if (response.status !== "complete") redirect(`/s/${token}/done`);

  const stored = await answersFor(response.id);
  if (stored[CHOICES_SAVED] === true) redirect(`/s/${token}/done`);

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const wants = (link.study.hand_raises ?? []).filter((h) => formData.get(`raise_${h.id}`) !== null);
  const joining = link.study.features.panel && formData.get("join_panel") !== null;

  if ((wants.length > 0 || joining) && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    // Carry their choices back so nothing has to be ticked twice. The email address itself
    // is never put in a URL (spec section 13), so that one field is retyped.
    const kept = new URLSearchParams({ problem: "email", ticked: wants.map((w) => w.id).join(",") });
    if (joining) kept.set("panel", "1");
    redirect(`/s/${token}/done?${kept.toString()}`);
  }

  if (wants.length > 0) {
    const domain = email.split("@")[1] ?? "";
    const known = String(link.attributes.email_domain ?? "").toLowerCase();
    const domainMatch = (known !== "" && domain === known) || /\.gov$/.test(domain) || /\.[a-z]{2}\.us$/.test(domain);
    await saveHandRaises(response.id, wants.map((h) => ({ type: h.id, email, domainMatch })));
  }

  // Only the respondent's own choice creates a panel row (rule 12).
  if (joining) await joinPanel(link.studyContactId, link.studyId);

  await saveAnswer(response.id, CHOICES_SAVED, true, false);
  redirect(`/s/${token}/done?saved=1`);
}

/** Used by the console's preview to throw away a rehearsal. */
export async function discardPreviewResponse(responseId: string): Promise<void> {
  await db().delete(answersTable).where(eq(answersTable.responseId, responseId));
  await db().delete(responsesTable).where(and(eq(responsesTable.id, responseId)));
}

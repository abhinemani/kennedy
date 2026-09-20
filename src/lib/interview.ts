import Anthropic from "@anthropic-ai/sdk";
import {
  buildInterviewMessages, buildInterviewSystem, nextScriptedTopic, shouldEnd,
  validateInterviewTurn, type Guide, type Turn,
} from "@/core/interview";
import { withDeadline } from "@/core/deadline";
import { env } from "./env";
import { modelAvailability } from "./model";

/**
 * Driving one interview turn.
 *
 * The interviewer is a model, so every turn it produces is checked before a respondent sees
 * it. Anything that is not a single question within the word limit is discarded and the next
 * scripted topic is asked instead — the conversation degrades to the researcher's own guide
 * rather than to whatever the model felt like saying.
 */

const TURN_TIMEOUT_MS = 12_000;

export type NextMove =
  | { kind: "question"; text: string; topicId: string | null; scripted: boolean }
  | { kind: "end" };

export function askedTopicIds(turns: (Turn & { topicId: string | null })[]): string[] {
  return turns.filter((t) => t.topicId).map((t) => t.topicId!) as string[];
}

/** The opening question is always scripted: the model does not get to set the frame. */
export function openingMove(guide: Guide): NextMove {
  const topic = nextScriptedTopic(guide, []);
  return topic
    ? { kind: "question", text: topic.ask, topicId: topic.id, scripted: true }
    : { kind: "end" };
}

export function scriptedFallback(guide: Guide, asked: string[]): NextMove {
  const topic = nextScriptedTopic(guide, asked);
  return topic
    ? { kind: "question", text: topic.ask, topicId: topic.id, scripted: true }
    : { kind: "end" };
}

export type AskModel = (system: string, messages: { role: "assistant" | "user"; content: string }[], signal: AbortSignal) => Promise<string>;

/**
 * Work out the next thing to say.
 *
 * Stop conditions are checked first and are not the model's decision: the turn cap, the clock,
 * and the respondent saying stop all end the conversation whatever the model would have said.
 */
export async function nextMove(
  guide: Guide,
  turns: (Turn & { topicId: string | null })[],
  startedAt: Date,
  ask: AskModel,
  now = new Date(),
  timeoutMs = TURN_TIMEOUT_MS,
): Promise<NextMove> {
  if (shouldEnd(turns, guide, startedAt, now)) return { kind: "end" };

  const asked = askedTopicIds(turns);
  if (turns.length === 0) return openingMove(guide);

  const result = await withDeadline(timeoutMs, (signal) =>
    ask(buildInterviewSystem(guide), buildInterviewMessages(turns), signal));

  if (!result.ok) return scriptedFallback(guide, asked);

  const move = validateInterviewTurn(result.value);
  if (!move) return scriptedFallback(guide, asked);
  if (move.kind === "end") return { kind: "end" };

  // A model question covers no particular topic, so the scripted list is untouched by it and
  // the fallback still has somewhere to go.
  return { kind: "question", text: move.text, topicId: null, scripted: false };
}

let client: Anthropic | null = null;

/** The real model, for the route. Tests pass their own `ask`. */
export const askAnthropic: AskModel = async (system, messages, signal) => {
  const availability = modelAvailability();
  if (!availability.available) throw new Error(availability.why);

  if (!client) client = new Anthropic({ apiKey: env.anthropicKey() ?? undefined });

  const response = await client.messages.create(
    {
      model: availability.model,
      max_tokens: 200,
      system,
      messages: messages.length ? messages : [{ role: "user", content: "Begin." }],
    },
    { signal },
  );

  return response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();
};

import Anthropic from "@anthropic-ai/sdk";
import { env } from "./env";

/**
 * The one place this app talks to a model.
 *
 * It hands the kernel a plain `generate` function and nothing else: no tools, no streaming, no
 * conversation state. Everything about what may be asked and what counts as a valid answer
 * lives in `src/core`, where it is tested without a key.
 *
 * The model name is read from the environment and never hardcoded.
 */

export type ModelAvailability =
  | { available: true; model: string }
  | { available: false; why: string };

export function modelAvailability(): ModelAvailability {
  const key = env.anthropicKey();
  const model = env.anthropicModel();
  if (!key) {
    return {
      available: false,
      why: "ANTHROPIC_API_KEY is not set. Set it in the Railway dashboard under Variables, then redeploy.",
    };
  }
  if (!model) {
    return {
      available: false,
      why: "ANTHROPIC_MODEL is not set, so there is no model to ask. Set it in the Railway dashboard under Variables, then redeploy.",
    };
  }
  return { available: true, model };
}

let client: Anthropic | null = null;

function anthropic(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: env.anthropicKey() ?? undefined });
  return client;
}

/**
 * One request, one short answer. `maxTokens` stays small on purpose: every caller here wants
 * a sentence or a code, and a cap is the cheapest guard against a runaway response.
 */
export async function generate(
  message: { system: string; user: string },
  signal: AbortSignal,
  maxTokens = 256,
): Promise<string> {
  const availability = modelAvailability();
  if (!availability.available) throw new Error(availability.why);

  const response = await anthropic().messages.create(
    {
      model: availability.model,
      max_tokens: maxTokens,
      system: message.system,
      messages: [{ role: "user", content: message.user }],
    },
    { signal },
  );

  return response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();
}

/** For the health checklist's "Test it" button: does a real call actually work? */
export async function testModel(): Promise<{ ok: true; sample: string } | { ok: false; why: string }> {
  const availability = modelAvailability();
  if (!availability.available) return { ok: false, why: availability.why };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const sample = await generate(
      {
        system: "Reply with exactly the word: ready",
        user: "Are you reachable?",
      },
      controller.signal,
      16,
    );
    return sample.length > 0
      ? { ok: true, sample }
      : { ok: false, why: "The model answered with nothing at all." };
  } catch (err) {
    const message = err instanceof Error ? err.message : "The call failed.";
    return { ok: false, why: `The model could not be reached: ${message}` };
  } finally {
    clearTimeout(timer);
  }
}

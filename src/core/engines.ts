import type { Study } from "./study-schema";

export type LinkContext = { token: string; baseUrl: string; attributes: Record<string, string | number> };
export type SyncedResponse = { externalId: string; token: string; answers: Record<string, unknown>; completedAt: Date };

/** Both engines do the same three jobs. Everything else in Canvass is engine-blind. */
export interface SurveyEngine {
  name: "native" | "surveymonkey";
  /** Make the published version live. Returns notes for the operator, e.g. logic to set by hand. */
  publish(study: Study, version: number): Promise<{ operatorChecklist: string[] }>;
  linkFor(ctx: LinkContext): string;
  /** Native responses are already in the database, so this returns nothing. */
  syncResponses(study: Study): Promise<SyncedResponse[]>;
}

export const nativeEngine: SurveyEngine = {
  name: "native",
  async publish() { return { operatorChecklist: [] }; },
  linkFor: ({ baseUrl, token }) => `${baseUrl.replace(/\/$/, "")}/s/${token}`,
  async syncResponses() { return []; },
};

/** What each engine can do. The console reads this to explain unavailable features. */
export const ENGINE_FEATURES = {
  native: { ai_followup: true, ai_interview: true, plausibility: true, single_use_tokens: true },
  surveymonkey: { ai_followup: false, ai_interview: false, plausibility: false, single_use_tokens: false },
} as const;

export function whyUnavailable(engine: keyof typeof ENGINE_FEATURES, feature: keyof (typeof ENGINE_FEATURES)["native"]): string | null {
  if (ENGINE_FEATURES[engine][feature]) return null;
  return "This needs the survey to run on Canvass pages. Switch this study's engine to native to turn it on.";
}

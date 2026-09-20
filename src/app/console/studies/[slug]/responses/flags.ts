// Quality flags inform the operator's review. They never exclude anything by themselves
// (rule 4), so each one is phrased as something to look at rather than a verdict.
export const FLAG_WORDS: Record<string, string> = {
  speeder: "finished faster than seems possible",
  implausible_confirmed: "stood by a number that looks unusual",
  duplicate_entity: "another person from the same government also answered",
  role_not_involved: "says they are not involved in this work",
  corrected_identity: "told us we had the wrong person",
};

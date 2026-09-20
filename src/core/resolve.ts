// Resolving an imported row to a government in the registry.
//
// The government is the backbone: officials retire and lose elections, the clerk's office
// persists. A row that cannot be matched with confidence goes to a review queue rather than
// being dropped or forced onto the nearest name, because a wrong match quietly attributes
// one city's answers to another.

export type RegistryEntity = {
  id: string;
  name: string;
  state: string;
  type: string;
  population: number | null;
};

const LEADING = /^(city|town|township|village|borough|county|charter township|municipality) of\s+/i;
const TRAILING = /\s+(city|town|township|village|borough|county|municipality|twp\.?|co\.?)$/i;

/** "City of Ann Arbor", "Ann Arbor City", "ann-arbor" all reduce to the same thing. */
export function normalizeName(raw: string): string {
  let name = raw.normalize("NFKD").toLowerCase().trim();
  name = name.replace(/[.,'’]/g, "");
  name = name.replace(/[-_/]+/g, " ");
  name = name.replace(/\s+/g, " ").trim();

  // Strip one leading and one trailing form-of-government word, not repeatedly: a place
  // genuinely called "Township of Township" is not our problem, but "City of York City" is.
  name = name.replace(LEADING, "");
  name = name.replace(TRAILING, "");
  return name.trim();
}

export const TYPE_SYNONYMS: Record<string, string> = {
  city: "city",
  town: "city",
  village: "city",
  borough: "city",
  municipality: "city",
  municipal: "city",
  county: "county",
  parish: "county",
  township: "township",
  twp: "township",
  "charter township": "township",
  school: "school_district",
  "school district": "school_district",
  "special district": "special_district",
  district: "special_district",
  state: "state_agency",
  "state agency": "state_agency",
};

export function normalizeType(raw: string): string | null {
  const key = raw.toLowerCase().trim().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  return TYPE_SYNONYMS[key] ?? (key === "" ? null : null);
}

export function normalizeState(raw: string): string {
  return raw.trim().toUpperCase().slice(0, 2);
}

export type Resolution =
  | { kind: "matched"; entity: RegistryEntity; how: "geoid" | "name" }
  | { kind: "ambiguous"; candidates: RegistryEntity[] }
  | { kind: "unresolved"; reason: string };

export type IncomingRow = {
  geoid?: string;
  entityName: string;
  state: string;
  type?: string;
};

/**
 * Exact identifiers win. Otherwise a row matches only when state, type and normalized name
 * agree and exactly one government does so. Two candidates is a question for the operator,
 * not a coin toss.
 */
export function resolveEntity(row: IncomingRow, registry: RegistryEntity[]): Resolution {
  const geoid = row.geoid?.trim();
  if (geoid) {
    const byGeoid = registry.find((e) => e.id === geoid || normalizeGeoid(e) === normalizeGeoid({ geoid }));
    if (byGeoid) return { kind: "matched", entity: byGeoid, how: "geoid" };
  }

  const state = normalizeState(row.state);
  if (state.length !== 2) return { kind: "unresolved", reason: "No state, so there is nothing to match within." };

  const name = normalizeName(row.entityName);
  if (!name) return { kind: "unresolved", reason: "No government name in this row." };

  const wantedType = row.type ? normalizeType(row.type) : null;

  const sameState = registry.filter((e) => normalizeState(e.state) === state);
  let candidates = sameState.filter((e) => normalizeName(e.name) === name);

  if (wantedType) {
    const byType = candidates.filter((e) => e.type === wantedType);
    // Only narrow by type when it helps; a file that mislabels type should not lose a match
    // that is otherwise unambiguous.
    if (byType.length > 0) candidates = byType;
  }

  if (candidates.length === 1) return { kind: "matched", entity: candidates[0]!, how: "name" };
  if (candidates.length > 1) return { kind: "ambiguous", candidates };

  return {
    kind: "unresolved",
    reason: `No ${state} government matches "${row.entityName}".`,
  };
}

function normalizeGeoid(e: { geoid?: string; id?: string }): string {
  return (e.geoid ?? e.id ?? "").replace(/\D/g, "");
}

/** Emails are the identity of a contact, so they dedupe case-insensitively. */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function looksLikeEmail(raw: string): boolean {
  const email = normalizeEmail(raw);
  return /^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$/.test(email);
}

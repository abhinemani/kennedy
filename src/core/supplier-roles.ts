// Turning a supplier's role labels into our audience lists.
//
// Power Almanac writes its own labels ("Head of Finance"), and a person often holds several,
// comma-separated in one field ("Head of Finance,Head of Purchasing"). Mapping them is not a
// nicety: without it every imported contact lands in "other", and the audience screen shows
// thirteen empty lists beside a database full of people.
//
// The list below is built from a real export. Anything not on it stays "other", which is
// honest: a role we cannot place is not one we should guess at.

import { isRole, type RoleKey } from "./lists";

export const SUPPLIER_ROLES: Record<string, RoleKey> = {
  "head clerk": "clerk",
  clerk: "clerk",
  "city clerk": "clerk",
  "county clerk": "clerk",
  "top appointed executive": "manager",
  "deputy top appointed executive": "manager",
  "chief administrative officer": "manager",
  "city manager": "manager",
  "county manager": "manager",
  "top elected official": "mayor",
  mayor: "mayor",
  "council member": "council",
  "head of it": "it",
  "head of geographic information system": "it",
  "head of information technology": "it",
  "head of finance": "finance",
  "head of purchasing": "purchasing",
  "head of procurement": "purchasing",
  "head of public works": "public_works",
  "head of police": "police",
  "police chief": "police",
  "head of fire": "fire",
  "fire chief": "fire",
  "head of buildings": "buildings",
  "head of planning": "buildings",
  "head of communications": "communications",
  "head of hr": "hr",
  "head of human resources": "hr",
  "head of legal": "attorney",
  "city attorney": "attorney",
  "county attorney": "attorney",
  "head of records": "records_officer",
  "records officer": "records_officer",
  "public records officer": "records_officer",
};

/**
 * The first role we recognise, or "other".
 *
 * First rather than best: the supplier lists the role the file is about first, so a Finance
 * export's "Head of Finance,Head of Purchasing" is a finance contact who also does purchasing.
 */
export function roleFromSupplier(raw: string): RoleKey {
  const parts = raw
    .split(/[,;|/]/)
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);

  for (const part of parts) {
    const mapped = SUPPLIER_ROLES[part];
    if (mapped) return mapped;
    // A file may already use our own keys.
    if (isRole(part)) return part;
  }
  return "other";
}

/** Every role a person holds, for showing the operator what a file contains. */
export function allRolesFromSupplier(raw: string): RoleKey[] {
  const found = raw
    .split(/[,;|/]/)
    .map((p) => p.trim().toLowerCase())
    .map((p) => SUPPLIER_ROLES[p] ?? (isRole(p) ? (p as RoleKey) : null))
    .filter((r): r is RoleKey => r !== null);
  return [...new Set(found)];
}

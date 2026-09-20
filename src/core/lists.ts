// Audience lists. The console's "Who are you asking?" screen is built from these.
// The first thirteen mirror Power Almanac's role-based lists; confirm the labels against a
// real export header before the first import. The rest come from other sources.

export const ROLES = [
  { key: "clerk",          label: "Clerks",                          origin: "power_almanac" },
  { key: "manager",        label: "City and county managers",        origin: "power_almanac" },
  { key: "mayor",          label: "Mayors and top elected officials", origin: "power_almanac" },
  { key: "council",        label: "Council and board members",       origin: "power_almanac" },
  { key: "it",             label: "Heads of IT",                     origin: "power_almanac" },
  { key: "finance",        label: "Heads of finance",                origin: "power_almanac" },
  { key: "purchasing",     label: "Heads of purchasing",             origin: "power_almanac" },
  { key: "public_works",   label: "Heads of public works",           origin: "power_almanac" },
  { key: "police",         label: "Police chiefs",                   origin: "power_almanac" },
  { key: "fire",           label: "Fire chiefs",                     origin: "power_almanac" },
  { key: "buildings",      label: "Heads of buildings and permitting", origin: "power_almanac" },
  { key: "communications", label: "Heads of communications",         origin: "power_almanac" },
  { key: "hr",             label: "Heads of HR",                     origin: "power_almanac" },
  { key: "records_officer", label: "Public records officers",        origin: "other" },
  { key: "attorney",       label: "City and county attorneys",       origin: "other" },
  { key: "police_records", label: "Police records units",            origin: "other" },
  { key: "other",          label: "Other contacts",                  origin: "other" },
] as const;

export type RoleKey = (typeof ROLES)[number]["key"];
export const ROLE_KEYS = ROLES.map((r) => r.key) as [RoleKey, ...RoleKey[]];
export const isRole = (s: string): s is RoleKey => (ROLE_KEYS as readonly string[]).includes(s);

export type ListContact = {
  id: string; role: RoleKey; state: string; entityType: string; population: number | null;
  source: string; licenseScope: string; emailStatus: "unverified" | "valid" | "risky" | "invalid";
  suppressed: boolean; lastContactedAt: Date | null;
};

export type Band = { key: string; label: string; max: number | null };

export function bandOf(population: number | null, bands: Band[]): string | null {
  if (population === null) return null;
  return bands.find((b) => b.max === null || population <= b.max)?.key ?? null;
}

export type ListCard = {
  role: RoleKey; label: string; origin: string; total: number; reachable: number;
  recentlyContacted: number; byBand: Record<string, number>; sources: Record<string, number>;
};

/** One card per list, for the audience screen. "Reachable" is what a study could email today. */
export function listCards(contacts: ListContact[], bands: Band[], now: Date, historyWindowDays: number): ListCard[] {
  const windowMs = historyWindowDays * 86_400_000;
  return ROLES.map((r) => {
    const mine = contacts.filter((c) => c.role === r.key);
    const recent = (c: ListContact) => !!c.lastContactedAt && now.getTime() - c.lastContactedAt.getTime() < windowMs;
    const card: ListCard = { role: r.key, label: r.label, origin: r.origin, total: mine.length, reachable: 0, recentlyContacted: 0, byBand: {}, sources: {} };
    for (const c of mine) {
      if (recent(c)) card.recentlyContacted++;
      if (!c.suppressed && c.emailStatus !== "invalid" && !recent(c)) card.reachable++;
      const b = bandOf(c.population, bands) ?? "unknown";
      card.byBand[b] = (card.byBand[b] ?? 0) + 1;
      card.sources[c.source] = (card.sources[c.source] ?? 0) + 1;
    }
    return card;
  }).filter((c) => c.total > 0 || c.origin === "power_almanac"); // always show the thirteen, even when empty
}

export type AudienceFilter = { roles: RoleKey[]; states?: string[]; bands?: string[]; entityTypes?: string[]; licenseScopes?: string[] };

/** The running total on the audience screen as the operator clicks. */
export function filterAudience(contacts: ListContact[], f: AudienceFilter, bands: Band[]): ListContact[] {
  return contacts.filter((c) =>
    f.roles.includes(c.role)
    && (!f.states?.length || f.states.includes(c.state))
    && (!f.entityTypes?.length || f.entityTypes.includes(c.entityType))
    && (!f.bands?.length || f.bands.includes(bandOf(c.population, bands) ?? "unknown"))
    && (!f.licenseScopes?.length || f.licenseScopes.includes(c.licenseScope)));
}

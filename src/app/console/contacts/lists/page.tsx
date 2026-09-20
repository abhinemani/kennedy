import Link from "next/link";
import { redirect } from "next/navigation";
import { isSignedIn } from "@/lib/auth";
import { allLists, audienceContacts, needsReviewCount, suppressionCount } from "@/db/queries/contacts";
import { listCards, ROLES, isRole, type ListContact, type RoleKey } from "@/core/lists";
import { readSettings } from "@/lib/settings";
import { ContactsNav } from "../nav";

export const dynamic = "force-dynamic";

// Power Almanac's thirteen first, always shown even when empty, then everything else.
const BANDS = [
  { key: "under_10k", label: "Under 10,000", max: 9999 },
  { key: "10k_50k", label: "10,000 to 50,000", max: 49999 },
  { key: "50k_250k", label: "50,000 to 250,000", max: 249999 },
  { key: "over_250k", label: "Over 250,000", max: null },
];

export default async function Lists({
  searchParams,
}: {
  searchParams: Promise<{ imported?: string; duplicates?: string; review?: string }>;
}) {
  if (!(await isSignedIn())) redirect("/console/login");
  const { imported, duplicates, review: justReview } = await searchParams;

  const [rows, lists, reviewCount, suppressed, settings] = await Promise.all([
    audienceContacts().catch(() => []),
    allLists().catch(() => []),
    needsReviewCount().catch(() => 0),
    suppressionCount().catch(() => 0),
    readSettings(),
  ]);

  const contacts: ListContact[] = rows
    .filter((r) => isRole(r.role))
    .map((r) => ({
      id: r.id,
      role: r.role as RoleKey,
      state: r.state,
      entityType: r.entityType,
      population: r.population,
      licenseScope: r.licenseScope,
      source: r.source,
      suppressed: r.suppressed,
      emailStatus: r.emailStatus as ListContact["emailStatus"],
      lastContactedAt: r.lastContactedAt,
    }));

  const cards = listCards(contacts, BANDS, new Date(), settings.contactHistoryWindowDays);
  const byKey = new Map(cards.map((c) => [c.role as string, c]));
  const powerAlmanac = ROLES.filter((r) => r.origin === "power_almanac");
  const others = ROLES.filter((r) => r.origin !== "power_almanac");

  return (
    <>
      <ContactsNav current="/console/contacts/lists" reviewCount={reviewCount} />

      <div className="page-head">
        <div>
          <span className="eyebrow">Contacts</span>
          <h1>Lists</h1>
          <p className="sub">
        {contacts.length === 0
          ? "No contacts yet. Load the registry, then import a list."
          : `${contacts.length.toLocaleString("en-US")} contacts, ${suppressed.toLocaleString("en-US")} of them unsubscribed or suppressed.`}
      </p>
        </div>
      </div>

      {imported ? (
        <p className="ok-note" role="status">
          {Number(imported).toLocaleString("en-US")} contacts imported.
          {Number(duplicates) > 0 ? ` ${Number(duplicates).toLocaleString("en-US")} were already on file.` : ""}
          {Number(justReview) > 0 ? (
            <>
              {" "}
              {Number(justReview).toLocaleString("en-US")} rows are waiting in{" "}
              <Link href="/console/contacts/review">Needs review</Link>.
            </>
          ) : null}
        </p>
      ) : null}

      <h2>Power Almanac lists</h2>
      <Cards roles={powerAlmanac} byKey={byKey} />

      <h2>Lists from other sources</h2>
      <Cards roles={others} byKey={byKey} />

      <h2>Where these came from</h2>
      <div className="panel">
        {lists.length === 0 ? (
          <p className="note" style={{ margin: 0 }}>
            No imports yet. <Link href="/console/contacts/import">Import a list</Link>.
          </p>
        ) : (
          <ul className="rows">
            {lists.map((l) => (
              <li key={l.id}>
                <span>
                  {l.name}
                  <span className="state">
                    {" "}
                    — {l.source}, {l.licenseScope === "owner_only" ? "our own studies only" : "client studies allowed"}
                  </span>
                </span>
                <span className="when">{l.rowCount.toLocaleString("en-US")}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function Cards({
  roles,
  byKey,
}: {
  roles: readonly { key: string; label: string }[];
  byKey: Map<string, { total: number; reachable: number; recentlyContacted: number; byBand: Record<string, number> }>;
}) {
  return (
    <div className="lists">
      {roles.map((role) => {
        const card = byKey.get(role.key);
        const total = card?.total ?? 0;
        return (
          <div className={total === 0 ? "list empty" : "list"} key={role.key}>
            <b>{role.label}</b>
            <span>{total === 0 ? "none yet" : `${total.toLocaleString("en-US")} contacts`}</span>
            {total > 0 ? (
              <span>
                {(card?.reachable ?? 0).toLocaleString("en-US")} reachable today
                {card?.recentlyContacted ? `, ${card.recentlyContacted.toLocaleString("en-US")} asked recently` : ""}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

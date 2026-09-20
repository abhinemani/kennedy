import { redirect } from "next/navigation";
import { isSignedIn } from "@/lib/auth";
import { needsReviewCount, panelMemberRows } from "@/db/queries/contacts";
import { ROLES } from "@/core/lists";
import { ContactsNav } from "../nav";

export const dynamic = "force-dynamic";

const roleLabel = (key: string) => ROLES.find((r) => r.key === key)?.label ?? key;

// Only an official's own choice creates a row here. A purchased list is never a panel.
export default async function Panel() {
  if (!(await isSignedIn())) redirect("/console/login");

  const [members, review] = await Promise.all([
    panelMemberRows().catch(() => []),
    needsReviewCount().catch(() => 0),
  ]);

  return (
    <>
      <ContactsNav current="/console/contacts/panel" reviewCount={review} />

      <div className="page-head">
        <div>
          <span className="eyebrow">Contacts</span>
          <h1>Panel</h1>
          <p className="sub">
        Officials who asked to keep hearing from us. Everyone here ticked a box at the end of a
        survey; nobody is added any other way.
      </p>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        {members.length === 0 ? (
          <p className="note" style={{ margin: 0 }}>
            Nobody yet. The first members will come from the first study that finishes.
          </p>
        ) : (
          <ul className="rows">
            {members.map((m) => (
              <li key={m.id}>
                <span>
                  {roleLabel(m.role)}
                  <span className="state">
                    {" "}
                    — {m.entityName ?? "unknown government"}
                    {m.state ? `, ${m.state}` : ""}
                  </span>
                </span>
                <span className="when">
                  {m.joinedAt.toLocaleDateString("en-US", { dateStyle: "medium" })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="flag">
        Contact details are never shown here or exported with a study. A sponsor reaches someone
        only when that person raises a hand.
      </p>
    </>
  );
}

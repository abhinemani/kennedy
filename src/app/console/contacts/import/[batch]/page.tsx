import Link from "next/link";
import { redirect } from "next/navigation";
import { isSignedIn } from "@/lib/auth";
import { judgeBatch, needsReviewCount } from "@/db/queries/contacts";
import { Nav } from "../../../nav";
import { ContactsNav } from "../../nav";
import { ConfirmForm } from "./confirm";

export const dynamic = "force-dynamic";

const VERDICT_WORDS: Record<string, string> = {
  ready: "Will be added",
  duplicate: "Already on file",
  unresolved: "Needs review",
  ambiguous: "Needs review",
};

export default async function PreviewImport({ params }: { params: Promise<{ batch: string }> }) {
  if (!(await isSignedIn())) redirect("/console/login");
  const { batch } = await params;

  const [{ rows, counts }, review] = await Promise.all([
    judgeBatch(batch),
    needsReviewCount().catch(() => 0),
  ]);

  if (counts.total === 0) {
    return (
      <>
        <Nav current="/console/contacts" />
        <ContactsNav current="/console/contacts/import" reviewCount={review} />
        <h1>Nothing staged</h1>
        <p className="sub">
          This import has already been finished or discarded.{" "}
          <Link href="/console/contacts/import">Start another</Link>.
        </p>
      </>
    );
  }

  return (
    <>
      <Nav current="/console/contacts" />
      <ContactsNav current="/console/contacts/import" reviewCount={review} />

      <h1>Before you import</h1>
      <p className="sub">
        Nothing has been saved yet. This is what would happen to the {counts.total.toLocaleString("en-US")} rows
        in that file.
      </p>

      <div className="panel" style={{ marginTop: 16 }}>
        <ul className="rows">
          <li>
            <span>Will be added as new contacts</span>
            <span className="when">{counts.ready.toLocaleString("en-US")}</span>
          </li>
          <li>
            <span>Already on file, so skipped</span>
            <span className="when">{counts.duplicate.toLocaleString("en-US")}</span>
          </li>
          <li>
            <span>No government matched, so held for review</span>
            <span className="when">{counts.unresolved.toLocaleString("en-US")}</span>
          </li>
          <li>
            <span>More than one government fits, so held for review</span>
            <span className="when">{counts.ambiguous.toLocaleString("en-US")}</span>
          </li>
        </ul>
      </div>

      <h2>The first twenty rows</h2>
      <div className="panel scroll">
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Government</th>
              <th>State</th>
              <th style={{ textAlign: "left" }}>What happens</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 20).map((r) => (
              <tr key={r.id}>
                <td>{r.raw.email || "—"}</td>
                <td>{r.raw.entity_name || "—"}</td>
                <td>{r.raw.state || "—"}</td>
                <td style={{ textAlign: "left" }}>
                  {VERDICT_WORDS[r.verdict]}
                  <span className="state"> — {r.note}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmForm
        batch={batch}
        ready={counts.ready}
        duplicates={counts.duplicate}
        needsReview={counts.unresolved + counts.ambiguous}
      />
    </>
  );
}

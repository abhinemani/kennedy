import { redirect } from "next/navigation";
import { isSignedIn } from "@/lib/auth";
import { needsReview, needsReviewCount, searchRegistry } from "@/db/queries/contacts";
import { normalizeState } from "@/core/resolve";
import { ContactsNav } from "../nav";
import { ReviewRow } from "./row";

export const dynamic = "force-dynamic";

// Rows that did not resolve wait here rather than being dropped or force-matched, because a
// wrong match quietly attributes one government's answers to another.
export default async function Review() {
  if (!(await isSignedIn())) redirect("/console/login");

  const [rows, total] = await Promise.all([
    needsReview(50).catch(() => []),
    needsReviewCount().catch(() => 0),
  ]);

  // Offer the likeliest governments for each row: same state, similar name.
  const withCandidates = await Promise.all(
    rows.map(async (row) => {
      const state = normalizeState(row.raw.state ?? "");
      const query = (row.raw.entity_name ?? "").split(/\s+/).slice(0, 2).join(" ");
      const candidates = query ? await searchRegistry(query, 8).catch(() => []) : [];
      return {
        row,
        candidates: candidates
          .filter((c) => (state.length === 2 ? normalizeState(c.state) === state : true))
          .slice(0, 6)
          .map((c) => ({
            id: c.id,
            label: `${c.name} — ${c.state} ${c.type.replace("_", " ")}${c.population ? `, ${c.population.toLocaleString("en-US")} people` : ""}`,
          })),
      };
    }),
  );

  return (
    <>
      <ContactsNav current="/console/contacts/review" reviewCount={total} />

      <h1>Needs review</h1>
      <p className="sub">
        {total === 0
          ? "Nothing waiting. Rows that cannot be matched during an import land here."
          : `${total.toLocaleString("en-US")} rows could not be matched to a government. Match one by clicking, or skip it.`}
      </p>

      {withCandidates.map(({ row, candidates }) => (
        <ReviewRow key={row.id} row={row} candidates={candidates} />
      ))}
    </>
  );
}

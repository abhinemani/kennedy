import { redirect } from "next/navigation";
import Link from "next/link";
import { isSignedIn } from "@/lib/auth";
import { countEntities, needsReviewCount, profiles, sweepAbandonedImports } from "@/db/queries/contacts";
import { ContactsNav } from "../nav";
import { ImportForm } from "./form";

export const dynamic = "force-dynamic";

export default async function Import({
  searchParams,
}: {
  searchParams: Promise<{ discarded?: string; aged?: string }>;
}) {
  if (!(await isSignedIn())) redirect("/console/login");
  const { discarded, aged } = await searchParams;

  // Previews that were never finished are swept here rather than kept indefinitely.
  // `aged` exists so the end-to-end test can prove the sweep without waiting a day; it only
  // ever shortens the window, and the operator never sees it.
  await sweepAbandonedImports(aged ? 0 : 24).catch(() => 0);

  const [saved, entities, review] = await Promise.all([
    profiles().catch(() => []),
    countEntities().catch(() => 0),
    needsReviewCount().catch(() => 0),
  ]);

  return (
    <>
      <ContactsNav current="/console/contacts/import" reviewCount={review} />

      <div className="page-head">
        <div>
          <h1>Import contacts</h1>
          <p className="sub">
        Upload a file, say which column is which, then look at what would happen before anything
        is saved.
      </p>
        </div>
      </div>

      {discarded ? (
        <p className="ok-note" role="status">
          {Number(discarded).toLocaleString("en-US")} uploaded rows were thrown away. Nothing was
          added to your contacts.
        </p>
      ) : null}

      {entities === 0 ? (
        <p className="problem">
          The registry is empty, so every row would land in Needs review with nothing to match
          against. <Link href="/console/contacts/registry">Load the registry first</Link>.
        </p>
      ) : null}

      <ImportForm
        savedProfiles={saved.map((p) => ({ name: p.name, columns: p.columns as Record<string, string> }))}
      />
    </>
  );
}

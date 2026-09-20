import Link from "next/link";
import { redirect } from "next/navigation";
import { isSignedIn } from "@/lib/auth";
import { parseStudy } from "@/core/study-schema";
import { studyAndVersion, studyOf } from "@/db/queries/studies";
import { reviewQueue } from "@/db/queries/analysis";
import { Nav } from "../../../nav";
import { ReviewRow } from "./row";

export const dynamic = "force-dynamic";

export default async function Responses({ params }: { params: Promise<{ slug: string }> }) {
  if (!(await isSignedIn())) redirect("/console/login");
  const { slug } = await params;

  const found = await studyAndVersion(slug);
  if (!found) redirect("/console/studies");
  const { study, version } = found;

  const parsed = parseStudy(study.draftText);
  const spec = parsed.ok ? parsed.study : version ? studyOf(version) : null;

  const rows = await reviewQueue(study.id).catch(() => []);
  const flagged = rows.filter((r) => r.qualityFlags.length > 0);
  const excluded = rows.filter((r) => r.reviewStatus === "excluded");

  return (
    <>
      <Nav current="/console/studies" />
      <h1>Responses</h1>
      <p className="sub">
        {rows.length.toLocaleString("en-US")} completed. {flagged.length.toLocaleString("en-US")} carry a
        flag, {excluded.length.toLocaleString("en-US")} are excluded. Flagged ones are first.
      </p>

      <p className="ok-note">
        A flag is a thing worth looking at, not a verdict. Nothing is excluded unless you exclude
        it, and every exclusion carries your reason into the methods note.
      </p>

      {rows.length === 0 ? (
        <div className="panel" style={{ marginTop: 16 }}>
          <p className="note" style={{ margin: 0 }}>
            No completed responses yet.
          </p>
        </div>
      ) : (
        rows.map((row) => (
          <ReviewRow
            key={row.responseId}
            slug={slug}
            row={{
              ...row,
              completedAt: row.completedAt ? row.completedAt.toISOString() : null,
              bandLabel:
                spec?.sample.strata.bands.find((b) => b.key === row.stratumKey)?.label ?? row.stratumKey,
            }}
          />
        ))
      )}

      <p className="flag">
        <Link href={`/console/studies/${slug}/results`}>Back to results</Link>
      </p>
    </>
  );
}

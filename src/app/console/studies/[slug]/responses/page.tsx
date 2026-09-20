import Link from "next/link";
import { redirect } from "next/navigation";
import { isSignedIn } from "@/lib/auth";
import { parseStudy } from "@/core/study-schema";
import { studyAndVersion, studyOf } from "@/db/queries/studies";
import { reviewQueue } from "@/db/queries/analysis";
import { ReviewRow } from "./row";

export const dynamic = "force-dynamic";

// A queue on the left, the response being judged on the right. Flagged ones come first, and
// the first of them is open when the screen loads, so the work starts where it should.
export default async function Responses({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ r?: string }>;
}) {
  if (!(await isSignedIn())) redirect("/console/login");
  const { slug } = await params;
  const { r } = await searchParams;

  const found = await studyAndVersion(slug);
  if (!found) redirect("/console/studies");
  const { study, version } = found;

  const parsed = parseStudy(study.draftText);
  const spec = parsed.ok ? parsed.study : version ? studyOf(version) : null;

  const rows = await reviewQueue(study.id).catch(() => []);
  const flagged = rows.filter((row) => row.qualityFlags.length > 0);
  const excluded = rows.filter((row) => row.reviewStatus === "excluded");
  const pending = rows.filter((row) => row.qualityFlags.length > 0 && row.reviewStatus === "pending");

  const selected = rows.find((row) => row.responseId === r) ?? rows[0] ?? null;
  const bandLabel = (key: string) => spec?.sample.strata.bands.find((b) => b.key === key)?.label ?? key;
  const dateOf = (d: Date | null) => (d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "");

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">Running it</span>
          <h1>Responses</h1>
          <p className="sub">
        {rows.length.toLocaleString("en-US")} completed. {flagged.length.toLocaleString("en-US")} carry a
        flag, {excluded.length.toLocaleString("en-US")} are excluded. Flagged ones are first.
      </p>
        </div>
      </div>

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
        <div className="review" style={{ marginTop: 16 }}>
          <aside className="queue" aria-label="Completed responses">
            <div className="queue-head">
              <span>{pending.length.toLocaleString("en-US")} waiting for a decision</span>
              <span>{rows.length.toLocaleString("en-US")} in all</span>
            </div>
            <div className="queue-scroll">
              {rows.map((row) => (
                <Link
                  key={row.responseId}
                  href={`/console/studies/${slug}/responses?r=${row.responseId}`}
                  aria-current={selected?.responseId === row.responseId ? "true" : undefined}
                >
                  <b>{row.entityName}, {row.state}</b>
                  {row.reviewStatus === "excluded" ? (
                    <span className="tag out">Excluded</span>
                  ) : row.qualityFlags.length > 0 && row.reviewStatus === "pending" ? (
                    <span className="tag">{row.qualityFlags.length} {row.qualityFlags.length === 1 ? "flag" : "flags"}</span>
                  ) : row.reviewStatus === "included" ? (
                    <span className="tag kept">Kept</span>
                  ) : (
                    <span className="tag out">—</span>
                  )}
                  <span className="meta">
                    {row.role.replace(/_/g, " ")} · {bandLabel(row.stratumKey)}
                    {row.completedAt ? ` · ${dateOf(row.completedAt)}` : ""}
                  </span>
                </Link>
              ))}
            </div>
          </aside>

          {selected ? (
            <ReviewRow
              key={selected.responseId}
              slug={slug}
              row={{
                ...selected,
                completedAt: selected.completedAt ? selected.completedAt.toISOString() : null,
                bandLabel: bandLabel(selected.stratumKey),
              }}
              next={(() => {
                const i = pending.findIndex((row) => row.responseId === selected.responseId);
                const after = pending.slice(i + 1).find((row) => row.responseId !== selected.responseId);
                return after ? { href: `/console/studies/${slug}/responses?r=${after.responseId}`, name: `${after.entityName}, ${after.state}` } : null;
              })()}
            />
          ) : null}
        </div>
      )}

      <p className="flag">
        Answers themselves are not shown here. Written answers live on the{" "}
        <Link href={`/console/studies/${slug}/themes`}>Themes</Link> screen, apart from who wrote
        them.
      </p>
    </>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { isSignedIn } from "@/lib/auth";
import { listStudies, responseCounts, versionsOf } from "@/db/queries/studies";
import { STATUS_WORDS } from "./[slug]/words";

export const dynamic = "force-dynamic";

const n = (x: number) => x.toLocaleString("en-US");

export default async function Studies() {
  if (!(await isSignedIn())) redirect("/console/login");

  let studies: Awaited<ReturnType<typeof listStudies>> = [];
  try {
    studies = await listStudies();
  } catch {
    studies = [];
  }

  const rows = await Promise.all(
    studies.map(async (s) => ({
      study: s,
      counts: await responseCounts(s.id).catch(() => ({ started: 0, complete: 0 })),
      versions: await versionsOf(s.id).catch(() => []),
    })),
  );

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1>Studies</h1>
          <p className="sub">Each study is one question put to one audience.</p>
        </div>
        <Link className="btn" href="/console/studies/new">
          New study
        </Link>
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        {rows.length === 0 ? (
          <p className="note" style={{ margin: 0 }}>
            No studies yet. Start one from a template.
          </p>
        ) : (
          <ul className="index">
            {rows.map(({ study, counts, versions }) => (
              <li key={study.id}>
                <Link className="primary" href={`/console/studies/${study.slug}`}>
                  {study.name}
                </Link>
                <span className="meta">
                  {versions.length > 0 ? `Version ${versions[0]?.version}` : "Never published"} ·{" "}
                  {study.engine} engine · created{" "}
                  {study.createdAt.toLocaleDateString("en-US", { dateStyle: "medium" })}
                </span>
                <span className="right">
                  <span>
                    {n(counts.complete)} complete of {n(counts.started)} started
                  </span>
                  <span className={`pill ${study.status}`}>{STATUS_WORDS[study.status] ?? study.status}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

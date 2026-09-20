import Link from "next/link";
import { redirect } from "next/navigation";
import { isSignedIn } from "@/lib/auth";
import { listStudies, responseCounts } from "@/db/queries/studies";
import { Nav } from "../nav";

export const dynamic = "force-dynamic";

const STATUS_WORDS: Record<string, string> = {
  draft: "Draft",
  pilot: "In pilot",
  fielding: "Fielding",
  closed: "Closed",
};

export default async function Studies() {
  if (!(await isSignedIn())) redirect("/console/login");

  let studies: Awaited<ReturnType<typeof listStudies>> = [];
  try {
    studies = await listStudies();
  } catch {
    studies = [];
  }

  const withCounts = await Promise.all(
    studies.map(async (s) => ({ study: s, counts: await responseCounts(s.id).catch(() => ({ started: 0, complete: 0 })) })),
  );

  return (
    <>
      <Nav current="/console/studies" />
      <h1>Studies</h1>
      <p className="sub">Each study is one question put to one audience.</p>

      <div className="panel" style={{ marginTop: 16 }}>
        {withCounts.length === 0 ? (
          <p className="note" style={{ margin: 0 }}>
            No studies yet. Start one from a template.
          </p>
        ) : (
          <ul className="rows">
            {withCounts.map(({ study, counts }) => (
              <li key={study.id}>
                <span>
                  <Link href={`/console/studies/${study.slug}`}>{study.name}</Link>
                  <span className="state"> — {STATUS_WORDS[study.status] ?? study.status}</span>
                </span>
                <span className="when">
                  {counts.complete} complete of {counts.started} started
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="nav">
        <span />
        <Link className="btn" href="/console/studies/new">
          New study
        </Link>
      </div>
    </>
  );
}

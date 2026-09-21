import Link from "next/link";
import { redirect } from "next/navigation";
import { isSignedIn } from "@/lib/auth";
import { listStudies } from "@/db/queries/studies";
import { StudyCard, studyCardFacts } from "./card";

export const dynamic = "force-dynamic";
export const metadata = { title: "Studies" };

export default async function Studies() {
  if (!(await isSignedIn())) redirect("/console/login");

  let studies: Awaited<ReturnType<typeof listStudies>> = [];
  try {
    studies = await listStudies();
  } catch {
    studies = [];
  }
  const cards = await Promise.all(studies.map(studyCardFacts));
  const running = cards.filter((c) => c.study.status === "fielding" || c.study.status === "pilot");
  const rest = cards.filter((c) => !running.includes(c));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Studies</h1>
          <p className="sub">Each study is one question put to one audience. The card says how far each has come.</p>
        </div>
        <div className="actions">
          <Link className="btn" href="/console/studies/new">
            New study
          </Link>
        </div>
      </div>

      {cards.length === 0 ? (
        <div className="card">
          <p className="note" style={{ margin: 0 }}>
            No studies yet. <Link href="/console/studies/new">Write the first brief</Link>.
          </p>
        </div>
      ) : null}

      {running.length > 0 ? (
        <div className="section" style={{ marginTop: 0 }}>
          <div className="section-head">
            <div>
              <h2>In the field</h2>
            </div>
          </div>
          <div style={{ display: "grid", gap: 12 }}>
            {running.map((c) => (
              <StudyCard key={c.study.id} facts={c} />
            ))}
          </div>
        </div>
      ) : null}

      {rest.length > 0 ? (
        <div className="section" style={{ marginTop: running.length > 0 ? 32 : 0 }}>
          <div className="section-head">
            <div>
              <h2>{running.length > 0 ? "Drafts and closed studies" : "All studies"}</h2>
            </div>
          </div>
          <div style={{ display: "grid", gap: 12 }}>
            {rest.map((c) => (
              <StudyCard key={c.study.id} facts={c} />
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}

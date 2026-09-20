import Link from "next/link";
import { redirect } from "next/navigation";
import { isSignedIn } from "@/lib/auth";
import { parseStudy, readyToSend } from "@/core/study-schema";
import { responseCounts, studyAndVersion, versionsOf } from "@/db/queries/studies";
import { Nav } from "../../nav";
import { Editor } from "./editor";
import { changeStatus } from "../actions";

export const dynamic = "force-dynamic";

export default async function StudyScreen({ params }: { params: Promise<{ slug: string }> }) {
  if (!(await isSignedIn())) redirect("/console/login");
  const { slug } = await params;

  const found = await studyAndVersion(slug);
  if (!found) {
    return (
      <>
        <Nav current="/console/studies" />
        <h1>Not found</h1>
        <p className="sub">
          There is no study called {slug}. <Link href="/console/studies">Back to studies</Link>
        </p>
      </>
    );
  }

  const { study, version } = found;
  const parsed = parseStudy(study.draftText);
  const versions = await versionsOf(study.id);
  const counts = await responseCounts(study.id).catch(() => ({ started: 0, complete: 0 }));
  const sendable = readyToSend(study.draftText);

  return (
    <>
      <Nav current="/console/studies" />
      <h1>{study.name}</h1>
      <p className="sub">
        {study.status === "draft" ? "Draft" : study.status === "pilot" ? "In pilot" : study.status === "fielding" ? "Fielding" : "Closed"}
        {version ? ` · published version ${version.version}` : " · never published"}
        {` · ${counts.complete} complete of ${counts.started} started`}
      </p>

      {!sendable ? (
        <p className="problem">
          This study still contains CHANGE_ME. You can publish and preview it, but no email can be
          sent until those are filled in.
        </p>
      ) : null}

      <Editor
        slug={slug}
        initialText={study.draftText}
        published={version ? { version: version.version, at: version.publishedAt.toISOString() } : null}
      />

      <h2>Sample</h2>
      <div className="panel">
        <p className="note" style={{ margin: "0 0 12px" }}>
          Who this study asks, and how many of them. The Sample screen shows every count and every
          reason somebody is left out before anything is drawn.
        </p>
        <Link className="btn ghost" href={`/console/studies/${slug}/sample`}>
          Open the sample screen
        </Link>
      </div>

      <h2>Version history</h2>
      <div className="panel">
        {versions.length === 0 ? (
          <p className="note" style={{ margin: 0 }}>
            Never published. Publishing freezes the file as a version, and every response records
            which version it answered.
          </p>
        ) : (
          <ul className="rows">
            {versions.map((v) => (
              <li key={v.id}>
                <span>Version {v.version}</span>
                <span className="when">
                  {v.publishedAt.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <h2>Status</h2>
      <div className="panel">
        <p className="note" style={{ margin: "0 0 12px" }}>
          Closing a study makes every link say so kindly rather than breaking.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <StatusButtons slug={slug} current={study.status} />
        </div>
      </div>

      <p className="flag">
        {parsed.ok
          ? "Preview opens the respondent flow with sample link attributes and records nothing."
          : "Fix the problems beside the file before publishing."}
      </p>
    </>
  );
}

function StatusButtons({ slug, current }: { slug: string; current: string }) {
  const options = [
    { value: "draft", label: "Draft" },
    { value: "pilot", label: "In pilot" },
    { value: "fielding", label: "Fielding" },
    { value: "closed", label: "Closed" },
  ];
  return (
    <>
      {options.map((o) => (
        <form key={o.value} action={changeStatus}>
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="status" value={o.value} />
          <button className="btn ghost" type="submit" disabled={current === o.value} aria-current={current === o.value}>
            {o.label}
          </button>
        </form>
      ))}
    </>
  );
}

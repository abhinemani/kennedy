import Link from "next/link";
import { redirect } from "next/navigation";
import { isSignedIn } from "@/lib/auth";
import { parseStudy } from "@/core/study-schema";
import { studyAndVersion, studyOf } from "@/db/queries/studies";
import { analyse, noteFor } from "@/lib/study-analysis";
import { handRaiseRows } from "@/db/queries/analysis";
import { Nav } from "../../../nav";

export const dynamic = "force-dynamic";

export default async function Exports({ params }: { params: Promise<{ slug: string }> }) {
  if (!(await isSignedIn())) redirect("/console/login");
  const { slug } = await params;

  const found = await studyAndVersion(slug);
  if (!found) redirect("/console/studies");
  const { study, version } = found;

  const parsed = parseStudy(study.draftText);
  const spec = parsed.ok ? parsed.study : version ? studyOf(version) : null;
  if (!spec) {
    return (
      <>
        <Nav current="/console/studies" />
        <h1>Exports</h1>
        <p className="problem">
          The study file has problems, so nothing can be exported yet.{" "}
          <Link href={`/console/studies/${slug}`}>Fix them on the study screen</Link>.
        </p>
      </>
    );
  }

  const [analysis, raises] = await Promise.all([
    analyse(spec, study.id),
    handRaiseRows(study.id).catch(() => []),
  ]);
  const note = noteFor(spec, version?.version ?? 0, version?.publishedAt ?? null, analysis);

  const files: { kind: string; name: string; what: string; count: string }[] = [
    {
      kind: "answers",
      name: "Answers",
      what: "One row per response, one column per question. No names, no email addresses, no government names.",
      count: `${analysis.rows.length.toLocaleString("en-US")} responses`,
    },
    {
      kind: "free-text",
      name: "Written answers",
      what: "Kept in their own file, joined to identity by nothing.",
      count: "one row per written answer",
    },
    {
      kind: "estimates",
      name: "Estimates, as JSON",
      what: "Every metric with its n, effective n, and margin of error, overall and by band. Chart-ready.",
      count: `${analysis.estimates.length} metrics`,
    },
    {
      kind: "hand-raises",
      name: "Hand-raises",
      what: "The one identified export, and only people who asked to be contacted are in it.",
      count: `${raises.length.toLocaleString("en-US")} people`,
    },
    {
      kind: "methods",
      name: "Methods note",
      what: "Frame, sample, response rates, weights, exclusions and their reasons. Generated, so it always matches the numbers.",
      count: "Markdown",
    },
  ];

  return (
    <>
      <Nav current="/console/studies" />
      <h1>Exports</h1>
      <p className="sub">{study.name}. Every export is a download.</p>

      <p className="ok-note">
        The default exports are anonymised. A respondent is a size band, a state, and a role.
        Hand-raises are the exception, because those people asked to hear from someone.
      </p>

      {files.map((f) => (
        <div className="panel" key={f.kind} style={{ marginTop: 12 }}>
          <b style={{ fontWeight: 500 }}>{f.name}</b>
          <p className="note" style={{ margin: "2px 0 10px" }}>
            {f.what} <span className="state">— {f.count}</span>
          </p>
          <a className="btn ghost" href={`/console/studies/${slug}/exports/${f.kind}`}>
            Download
          </a>
        </div>
      ))}

      <h2>The methods note, as it stands</h2>
      <div className="panel">
        <pre style={{ whiteSpace: "pre-wrap", maxHeight: 420, overflowY: "auto" }}>{note}</pre>
      </div>

      <p className="flag">
        <Link href={`/console/studies/${slug}/results`}>Back to results</Link>
      </p>
    </>
  );
}

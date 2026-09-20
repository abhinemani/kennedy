import Link from "next/link";
import { redirect } from "next/navigation";
import { isSignedIn } from "@/lib/auth";
import { parseStudy } from "@/core/study-schema";
import { studyBySlug } from "@/db/queries/studies";
import { Preview } from "./preview";

export const dynamic = "force-dynamic";

export default async function PreviewScreen({ params }: { params: Promise<{ slug: string }> }) {
  if (!(await isSignedIn())) redirect("/console/login");
  const { slug } = await params;

  const study = await studyBySlug(slug);
  if (!study) redirect("/console/studies");

  const parsed = parseStudy(study.draftText);

  return (
    <>
      <nav className="subnav" aria-label="Ways to edit" style={{ marginTop: -8 }}>
        <Link href={`/console/studies/${slug}/edit`}>Form</Link>
        <Link href={`/console/studies/${slug}/file`}>Whole file</Link>
        <Link href={`/console/studies/${slug}/preview`} aria-current="page">
          Preview
        </Link>
      </nav>

      <h2>Preview</h2>
      <p className="sub">
        The respondent flow, with link attributes you can change. Nothing here is recorded.
      </p>

      {!parsed.ok ? (
        <>
          <p className="problem">
            This file has problems, so there is nothing to preview yet. Fix them on the study
            screen and come back.
          </p>
          <Link className="btn ghost" href={`/console/studies/${slug}`}>
            Back to the study
          </Link>
        </>
      ) : (
        <Preview study={parsed.study} slug={slug} />
      )}
    </>
  );
}

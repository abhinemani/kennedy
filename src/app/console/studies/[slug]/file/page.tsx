import Link from "next/link";
import { redirect } from "next/navigation";
import { isSignedIn } from "@/lib/auth";
import { readyToSend } from "@/core/study-schema";
import { studyAndVersion } from "@/db/queries/studies";
import { Editor } from "../editor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Whole file" };

// The whole study file at once, with the kernel's problems beside it, and publishing.
export default async function StudyFile({ params }: { params: Promise<{ slug: string }> }) {
  if (!(await isSignedIn())) redirect("/console/login");
  const { slug } = await params;

  const found = await studyAndVersion(slug);
  if (!found) redirect("/console/studies");
  const { study, version } = found;
  const sendable = readyToSend(study.draftText);

  return (
    <>
      <nav className="subnav" aria-label="Ways to edit" style={{ marginTop: -8 }}>
        <Link href={`/console/studies/${slug}/edit`}>Form</Link>
        <Link href={`/console/studies/${slug}/file`} aria-current="page">
          Whole file
        </Link>
        <Link href={`/console/studies/${slug}/preview`}>Preview</Link>
      </nav>

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
    </>
  );
}

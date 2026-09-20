import { responseCounts, studyAndVersion } from "@/db/queries/studies";
import { StudyTabs } from "./tabs";

import { STATUS_WORDS } from "./words";

// Every screen of a study sits under the same header, so the operator always knows which
// study they are in and can move between its screens without going back.
export default async function StudyLayout({
  params,
  children,
}: {
  params: Promise<{ slug: string }>;
  children: React.ReactNode;
}) {
  const { slug } = await params;
  const found = await studyAndVersion(slug).catch(() => null);
  if (!found) return <>{children}</>;

  const { study, version } = found;
  const counts = await responseCounts(study.id).catch(() => ({ started: 0, complete: 0 }));

  return (
    <>
      <header className="study-head">
        <h1 className="title">{study.name}</h1>
        <span className={`pill ${study.status}`}>{STATUS_WORDS[study.status] ?? study.status}</span>
        <span className="meta">
          {version ? `Version ${version.version}` : "Never published"} · <b>{counts.complete.toLocaleString("en-US")}</b>{" "}
          complete of {counts.started.toLocaleString("en-US")} started
        </span>
      </header>
      <StudyTabs slug={slug} />
      {children}
    </>
  );
}

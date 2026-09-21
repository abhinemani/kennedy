"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// The screens of one study, in two modes: what a sponsor asks about, and the work of running
// it. A switch picks the mode; the tabs of that mode follow. Edit covers the form, the whole
// file, and the preview, three views of one thing.
const RESULTS = [
  { path: "", label: "Overview" },
  { path: "/brief", label: "Brief" },
  { path: "/findings", label: "Findings" },
  { path: "/leads", label: "Leads" },
  { path: "/report", label: "Report" },
];
const RUN = [
  { path: "/sample", label: "Sample" },
  { path: "/follow-ups", label: "Follow-ups" },
  { path: "/responses", label: "Responses" },
  { path: "/themes", label: "Themes" },
  { path: "/interviews", label: "Interviews" },
  { path: "/edit", label: "Edit", also: ["/file", "/preview"] },
  { path: "/exports", label: "Downloads" },
];

type Tab = { path: string; label: string; also?: string[] };

export function StudyTabs({ slug }: { slug: string }) {
  const path = usePathname();
  const base = `/console/studies/${slug}`;
  const rest = path.startsWith(base) ? path.slice(base.length) : "";
  const isCurrent = (t: Tab) =>
    t.path === "" ? rest === "" : [t.path, ...(t.also ?? [])].some((p) => rest === p || rest.startsWith(`${p}/`));
  const running = RUN.some(isCurrent);
  const tabs = running ? RUN : RESULTS;

  const tab = (t: Tab) => (
    <Link key={t.path} href={`${base}${t.path}`} aria-current={isCurrent(t) ? "page" : undefined}>
      {t.label}
    </Link>
  );

  return (
    <nav className="subnav" aria-label="Study screens">
      <span className="seg" role="group" aria-label="Which side of the study">
        <Link href={base} aria-current={!running ? "true" : undefined}>
          Results
        </Link>
        <Link href={`${base}/sample`} aria-current={running ? "true" : undefined}>
          Run
        </Link>
      </span>
      {tabs.map(tab)}
    </nav>
  );
}

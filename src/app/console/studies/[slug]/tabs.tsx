"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// The screens of one study, in two groups: what a sponsor asks about, then the work of
// running it. Edit covers the form, the whole file, and the preview, three views of one thing.
const ASK = [
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
  const tab = (t: Tab) => (
    <Link key={t.path} href={`${base}${t.path}`} aria-current={isCurrent(t) ? "page" : undefined}>
      {t.label}
    </Link>
  );

  return (
    <nav className="subnav" aria-label="Study screens">
      {ASK.map(tab)}
      <span className="gap" />
      <span className="group-label">Running it</span>
      {RUN.map(tab)}
    </nav>
  );
}

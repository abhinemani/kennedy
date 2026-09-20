"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// The screens of one study, in the order the work happens. Edit covers the form, the whole
// file, and the preview, which are three views of the same thing.
const TABS = [
  { path: "", label: "Overview" },
  { path: "/edit", label: "Edit", also: ["/file", "/preview"] },
  { path: "/sample", label: "Sample" },
  { path: "/follow-ups", label: "Follow-ups" },
  { path: "/results", label: "Results" },
  { path: "/responses", label: "Responses" },
  { path: "/themes", label: "Themes" },
  { path: "/interviews", label: "Interviews" },
  { path: "/exports", label: "Exports" },
];

export function StudyTabs({ slug }: { slug: string }) {
  const path = usePathname();
  const base = `/console/studies/${slug}`;
  const rest = path.startsWith(base) ? path.slice(base.length) : "";
  const isCurrent = (t: (typeof TABS)[number]) =>
    t.path === "" ? rest === "" : [t.path, ...(t.also ?? [])].some((p) => rest === p || rest.startsWith(`${p}/`));

  return (
    <nav className="subnav" aria-label="Study screens">
      {TABS.map((t) => (
        <Link key={t.path} href={`${base}${t.path}`} aria-current={isCurrent(t) ? "page" : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

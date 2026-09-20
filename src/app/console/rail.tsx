"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, FileText, House, Settings, Users } from "lucide-react";

// The console's one piece of navigation. It knows the current path, which a server layout
// does not, and that is the only reason it runs on the client.
const ITEMS = [
  { href: "/console", label: "Home", exact: true, Icon: House },
  { href: "/console/studies", label: "Studies", Icon: FileText },
  { href: "/console/contacts", label: "Contacts", Icon: Users },
  { href: "/console/settings", label: "Settings", Icon: Settings },
  { href: "/console/activity", label: "Activity", Icon: Activity },
];

export function Rail({ reviewCount }: { reviewCount: number }) {
  const path = usePathname();
  const isCurrent = (item: (typeof ITEMS)[number]) =>
    item.exact ? path === item.href : path === item.href || path.startsWith(`${item.href}/`);

  return (
    <nav aria-label="Console sections">
      <span className="group">Workspace</span>
      {ITEMS.map(({ href, label, Icon, ...item }) => (
        <Link key={href} className="item" href={href} aria-current={isCurrent({ href, label, Icon, ...item }) ? "page" : undefined}>
          <span className="item-label">
            <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
            {label}
          </span>
          {href === "/console/contacts" && reviewCount > 0 ? (
            <span className="count" aria-label={`${reviewCount} rows need review`}>
              {reviewCount.toLocaleString("en-US")}
            </span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}

const WORDS: Record<string, string> = {
  console: "Console", studies: "Studies", contacts: "Contacts", settings: "Settings", activity: "Activity",
  new: "New study", brief: "Brief", findings: "Findings", leads: "Leads", report: "Report", edit: "Edit",
  file: "Whole file", preview: "Preview", sample: "Sample", "follow-ups": "Follow-ups", results: "Results",
  responses: "Responses", themes: "Themes", interviews: "Interviews", exports: "Exports", lists: "Lists",
  registry: "Registry", import: "Import", review: "Needs review", panel: "Panel", login: "Sign in",
};

/** The path as words, with study slugs replaced by their names. */
export function Crumbs({ names }: { names: Record<string, string> }) {
  const path = usePathname();
  const parts = path.split("/").filter(Boolean);
  const crumbs = parts.map((part, i) => ({
    href: `/${parts.slice(0, i + 1).join("/")}`,
    label: names[part] ?? WORDS[part] ?? part,
  }));
  return (
    <nav className="crumbs" aria-label="Where you are">
      {crumbs.flatMap((c, i) => [
        i > 0 ? <span className="sep" aria-hidden="true" key={`${c.href}-sep`}>/</span> : null,
        i === crumbs.length - 1 ? <b key={c.href}>{c.label}</b> : <Link href={c.href} key={c.href}>{c.label}</Link>,
      ])}
    </nav>
  );
}

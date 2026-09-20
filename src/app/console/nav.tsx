import Link from "next/link";

const TABS = [
  { href: "/console", label: "Set up" },
  { href: "/console/studies", label: "Studies" },
  { href: "/console/contacts", label: "Contacts" },
  { href: "/console/settings", label: "Settings" },
  { href: "/console/activity", label: "Activity" },
];

export function Nav({ current }: { current: string }) {
  return (
    <nav className="tabs" aria-label="Console sections">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} aria-current={t.href === current ? "page" : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

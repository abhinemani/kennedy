import Link from "next/link";

const TABS = [
  { href: "/console/contacts/lists", label: "Lists" },
  { href: "/console/contacts/registry", label: "Registry" },
  { href: "/console/contacts/import", label: "Import" },
  { href: "/console/contacts/review", label: "Needs review" },
  { href: "/console/contacts/panel", label: "Panel" },
];

export function ContactsNav({ current, reviewCount }: { current: string; reviewCount?: number }) {
  return (
    <nav className="tabs" aria-label="Contacts sections" style={{ marginTop: -8 }}>
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} aria-current={t.href === current ? "page" : undefined}>
          {t.label}
          {t.href === "/console/contacts/review" && reviewCount ? ` (${reviewCount})` : ""}
        </Link>
      ))}
    </nav>
  );
}

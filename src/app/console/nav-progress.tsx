"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

// A thin bar along the top of the console from the moment a link is pressed until the next
// screen has arrived. The screens are quick; this is the acknowledgement that the press landed.
function Bar() {
  const path = usePathname();
  const search = useSearchParams();
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setPending(false);
  }, [path, search]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || !url.pathname.startsWith("/console")) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      setPending(true);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  useEffect(() => {
    if (!pending) return;
    // If a screen takes longer than this something else is wrong, and the bar should not lie.
    const t = setTimeout(() => setPending(false), 8000);
    return () => clearTimeout(t);
  }, [pending]);

  return pending ? <div className="nav-progress" aria-hidden="true" /> : null;
}

export function NavProgress() {
  return (
    <Suspense fallback={null}>
      <Bar />
    </Suspense>
  );
}

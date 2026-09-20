import Link from "next/link";
import { redirect } from "next/navigation";
import { isSignedIn } from "@/lib/auth";
import { checklist } from "@/lib/health-facts";
import { checklistReady } from "@/core/health";
import { Nav } from "./nav";

export const dynamic = "force-dynamic";

// The first visit opens the checklist, not an empty dashboard (NO_TERMINAL.md).
export default async function Console() {
  if (!(await isSignedIn())) redirect("/console/login");

  const checks = await checklist();
  const ready = checklistReady(checks);
  const remaining = checks.filter((c) => c.state === "todo").length;

  return (
    <>
      <Nav current="/console" />
      <h1>Setting up</h1>
      <p className="sub">
        {ready
          ? "Everything is in place. The next step is loading contacts and creating a study."
          : `${remaining} of ${checks.length} still to do. Each line says what is missing and where to fix it.`}
      </p>

      <div className="panel" style={{ marginTop: 16 }}>
        <ul className="checks">
          {checks.map((c) => (
            <li key={c.id}>
              <span className={`dot ${c.state}`} aria-hidden="true" />
              <div>
                <b>{c.label}</b>{" "}
                <span className="state">{c.state === "ok" ? "Done" : "Still to do"}</span>
                <p>{c.detail}</p>
                {c.fix ? (
                  c.fix.href.startsWith("http") ? (
                    <a className="fix" href={c.fix.href} target="_blank" rel="noreferrer noopener">
                      {c.fix.label}
                    </a>
                  ) : (
                    <Link className="fix" href={c.fix.href}>
                      {c.fix.label}
                    </Link>
                  )
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </div>

      <p className="flag">
        This checklist also lives at <Link href="/console/settings">Settings</Link>, and reflects
        this deployment right now. Changing an environment variable needs a redeploy from the
        Vercel dashboard before it shows here.
      </p>
    </>
  );
}

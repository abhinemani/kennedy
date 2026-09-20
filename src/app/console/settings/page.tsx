import { redirect } from "next/navigation";
import { isSignedIn } from "@/lib/auth";
import { readSettings } from "@/lib/settings";
import { checklist } from "@/lib/health-facts";
import { Nav } from "../nav";
import { SettingsForm } from "./form";
import { endSession } from "../actions";

export const dynamic = "force-dynamic";

export default async function Settings() {
  if (!(await isSignedIn())) redirect("/console/login");
  const [current, checks] = await Promise.all([readSettings(), checklist()]);

  return (
    <>
      <Nav current="/console/settings" />
      <h1>Settings</h1>
      <p className="sub">Addresses, send limits, and the thresholds that pause sending.</p>

      <SettingsForm current={current} />

      <h2>Health</h2>
      <div className="panel">
        <ul className="checks">
          {checks.map((c) => (
            <li key={c.id}>
              <span className={`dot ${c.state}`} aria-hidden="true" />
              <div>
                <b>{c.label}</b>{" "}
                <span className="state">{c.state === "ok" ? "Done" : "Still to do"}</span>
                <p>{c.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <h2>Session</h2>
      <form action={endSession}>
        <button className="btn ghost" type="submit">
          Sign out
        </button>
      </form>
    </>
  );
}

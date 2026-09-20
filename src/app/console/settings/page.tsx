import { redirect } from "next/navigation";
import { isSignedIn } from "@/lib/auth";
import { readSettings } from "@/lib/settings";
import { buildInfo } from "@/lib/env";
import { checklist } from "@/lib/health-facts";
import { sampleDataStatus } from "@/db/queries/sample-data";
import { SampleDataPanel, SettingsForm, TestModelButton } from "./form";
import { endSession } from "../actions";

export const dynamic = "force-dynamic";

export default async function Settings() {
  if (!(await isSignedIn())) redirect("/console/login");
  const [current, checks, sample] = await Promise.all([
    readSettings(),
    checklist(),
    sampleDataStatus().catch(() => ({ loaded: false, counts: { governments: 0, contacts: 0, responses: 0, messages: 0, interviews: 0 } })),
  ]);
  const build = buildInfo();

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">Settings</span>
          <h1>Settings</h1>
          <p className="sub">Addresses, send limits, and the thresholds that pause sending.</p>
        </div>
      </div>

      <div className="cols" style={{ marginTop: 16 }}>
        <SettingsForm current={current} />

        <div>
          <div className="panel">
            <span className="label">Health</span>
            <p className="note" style={{ margin: "0 0 10px" }}>
              {build.commit
                ? `Running build ${build.commit}${build.deployedAt ? `, deployed ${new Date(build.deployedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}` : ""}.`
                : "This build does not know which commit it came from, which usually means it is running outside Railway."}
            </p>
            <ul className="checks">
              {checks.map((c) => (
                <li key={c.id}>
                  <span className={`dot ${c.state}`} aria-hidden="true" />
                  <div>
                    <b>{c.label}</b>{" "}
                    <span className="state">{c.state === "ok" ? "Done" : "Still to do"}</span>
                    <p>{c.detail}</p>
                    {c.id === "ai" ? <TestModelButton /> : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <h2>Sample data</h2>
          <SampleDataPanel loaded={sample.loaded} counts={sample.counts} />

          <h2>Session</h2>
          <form action={endSession}>
            <button className="btn ghost" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </>
  );
}

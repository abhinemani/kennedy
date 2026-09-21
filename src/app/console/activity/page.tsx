import { redirect } from "next/navigation";
import { isSignedIn } from "@/lib/auth";
import { recentActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";

const WORDS: Record<string, string> = {
  sign_in: "Signed in",
  sign_in_failed: "A sign-in was refused",
  sign_out: "Signed out",
  settings_saved: "Settings saved",
};

function when(at: Date | null): string {
  if (!at) return "";
  return at.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

export default async function Activity() {
  if (!(await isSignedIn())) redirect("/console/login");
  const rows = await recentActivity();

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Activity</h1>
          <p className="sub">What happened, and when. The newest is first.</p>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        {rows.length === 0 ? (
          <p className="note" style={{ margin: 0 }}>
            Nothing logged yet. Actions you take in the console appear here.
          </p>
        ) : (
          <ul className="rows">
            {rows.map((row) => {
              const changed = (row.detail as { changed?: string[] } | null)?.changed;
              return (
                <li key={row.id}>
                  <span>
                    {WORDS[row.action] ?? row.action}
                    {changed?.length ? <span className="state"> — {changed.join(", ")}</span> : null}
                  </span>
                  <span className="when">{when(row.createdAt)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}

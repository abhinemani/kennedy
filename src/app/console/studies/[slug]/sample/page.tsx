import Link from "next/link";
import { redirect } from "next/navigation";
import { isSignedIn } from "@/lib/auth";
import { parseStudy } from "@/core/study-schema";
import { SKIP_WORDS, type SkipReason } from "@/core/draw";
import { studyAndVersion, studyOf } from "@/db/queries/studies";
import { drawnSummary, planSample } from "@/db/queries/sample";
import { DrawForm } from "./form";

export const dynamic = "force-dynamic";

// Nothing is drawn until the operator has seen the counts and every reason someone was left
// out. This screen is the last thing between a study and real people.
export default async function Sample({ params }: { params: Promise<{ slug: string }> }) {
  if (!(await isSignedIn())) redirect("/console/login");
  const { slug } = await params;

  const found = await studyAndVersion(slug);
  if (!found) redirect("/console/studies");
  const { study, version } = found;

  if (!version) {
    return (
      <>
        <h1>Sample</h1>
        <p className="problem">
          Publish the study first. A sample records which version each person was asked, so there
          has to be a version. <Link href={`/console/studies/${slug}`}>Back to the study</Link>
        </p>
      </>
    );
  }

  const parsed = parseStudy(study.draftText);
  const spec = parsed.ok ? parsed.study : studyOf(version);

  const [plan, drawn] = await Promise.all([
    planSample(spec, ["owner_only", "client_ok"]).catch(() => null),
    drawnSummary(study.id).catch(() => []),
  ]);

  const alreadyDrawn = drawn.reduce((n, d) => n + d.n, 0);

  // The draw sorts its keys so the same seed always gives the same sample. For reading, the
  // bands belong in the order the study file lists them: smallest places first.
  const bandOrder = spec.sample.strata.bands.map((b) => b.key);
  const inBandOrder = <T extends { key?: string; stratumKey?: string }>(rows: T[]) =>
    [...rows].sort((a, b) => {
      const ai = bandOrder.indexOf(a.key ?? a.stratumKey ?? "");
      const bi = bandOrder.indexOf(b.key ?? b.stratumKey ?? "");
      return (ai === -1 ? bandOrder.length : ai) - (bi === -1 ? bandOrder.length : bi);
    });

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">Running it</span>
          <h1>Sample</h1>
          <p className="sub">
        {alreadyDrawn > 0
          ? `${alreadyDrawn.toLocaleString("en-US")} people have already been drawn into this study.`
          : "Nobody has been drawn into this study yet."}
      </p>
        </div>
      </div>

      {!plan ? (
        <p className="problem">
          Could not work out the sample. The database did not answer. Check the first line of the
          setup checklist.
        </p>
      ) : (
        <>
          <h2>Who is eligible</h2>
          <div className="panel scroll">
            <table>
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>Size band</th>
                  <th>Target</th>
                  <th>Eligible</th>
                  <th>Would draw</th>
                  <th>Short by</th>
                </tr>
              </thead>
              <tbody>
                {inBandOrder(plan.strata).map((s) => {
                  const band = spec.sample.strata.bands.find((b) => b.key === s.key);
                  return (
                    <tr key={s.key}>
                      <td style={{ textAlign: "left" }}>{band?.label ?? s.key}</td>
                      <td>{s.target.toLocaleString("en-US")}</td>
                      <td>{s.eligible.toLocaleString("en-US")}</td>
                      <td>{s.picked.toLocaleString("en-US")}</td>
                      <td className={s.shortBy > 0 ? "low" : undefined}>
                        {s.shortBy > 0 ? s.shortBy.toLocaleString("en-US") : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <h2>Who is left out, and why</h2>
          <div className="panel">
            <ul className="rows">
              {(Object.entries(plan.skipped) as [SkipReason, number][]).map(([reason, n]) => (
                <li key={reason}>
                  <span>
                    {SKIP_WORDS[reason].charAt(0).toUpperCase() + SKIP_WORDS[reason].slice(1)}
                  </span>
                  <span className="when">{n.toLocaleString("en-US")}</span>
                </li>
              ))}
            </ul>
            <p className="note">
              {plan.candidates.toLocaleString("en-US")} contacts were in the frame before these were
              set aside.
            </p>
          </div>

          {drawn.length > 0 ? (
            <>
              <h2>Already drawn</h2>
              <div className="panel">
                <ul className="rows">
                  {inBandOrder(drawn).map((d) => (
                    <li key={d.stratumKey}>
                      <span>
                        {spec.sample.strata.bands.find((b) => b.key === d.stratumKey)?.label ?? d.stratumKey}
                        {d.pilots > 0 ? <span className="state"> — {d.pilots} in the pilot</span> : null}
                      </span>
                      <span className="when">{d.n.toLocaleString("en-US")}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          ) : null}

          <DrawForm
            slug={slug}
            willDraw={plan.picked.length}
            pilotSize={spec.sample.pilot_size}
            seed={spec.sample.seed}
            alreadyDrawn={alreadyDrawn}
          />
        </>
      )}

      <p className="flag">
        Drawing mints one single-use link per person and records the attributes as they are today.
        It sends nothing. <Link href={`/console/studies/${slug}`}>Back to the study</Link>
      </p>
    </>
  );
}

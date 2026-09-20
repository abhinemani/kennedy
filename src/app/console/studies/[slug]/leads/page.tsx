import Link from "next/link";
import { redirect } from "next/navigation";
import { isSignedIn } from "@/lib/auth";
import { parseStudy } from "@/core/study-schema";
import { ROLES } from "@/core/lists";
import { studyAndVersion, studyOf } from "@/db/queries/studies";
import { handRaiseRows } from "@/db/queries/analysis";
import { panelJoinsFor } from "@/db/queries/contacts";

export const dynamic = "force-dynamic";

const n = (x: number) => x.toLocaleString("en-US");
const roleLabel = (key: string) => ROLES.find((r) => r.key === key)?.label.replace(/s$/, "") ?? key.replace(/_/g, " ");
const when = (d: Date | null) => (d ? d.toLocaleDateString("en-US", { dateStyle: "medium" }) : "");

// The people who asked to hear more. This is the one identified screen for a study, and the
// trust wall is the reason: a sponsor reaches an official only through that official's own tick.
export default async function Leads({ params }: { params: Promise<{ slug: string }> }) {
  if (!(await isSignedIn())) redirect("/console/login");
  const { slug } = await params;

  const found = await studyAndVersion(slug);
  if (!found) redirect("/console/studies");
  const { study, version } = found;
  const parsed = parseStudy(study.draftText);
  const spec = parsed.ok ? parsed.study : version ? studyOf(version) : null;
  const base = `/console/studies/${slug}`;

  const [raises, joins] = await Promise.all([
    handRaiseRows(study.id).catch(() => []),
    panelJoinsFor(study.id).catch(() => []),
  ]);
  const types = spec?.hand_raises ?? [];
  const labelFor = (type: string) => types.find((t) => t.id === type)?.label ?? type;
  const byType = types.map((t) => ({ ...t, rows: raises.filter((r) => r.type === t.id) }));
  const other = raises.filter((r) => !types.some((t) => t.id === r.type));
  if (other.length) byType.push({ id: "other", label: "Other", default: false, rows: other });
  const verified = raises.filter((r) => r.verifiedAt || r.domainMatch).length;

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">Leads</span>
          <h1>Who asked to hear more</h1>
          <p className="lede">
            Every person here ticked a box at the end of the survey and gave a work address. Nobody
            reaches an official any other way, and these details never leave this screen except in
            the hand-raises download.
          </p>
        </div>
        <div className="actions">
          <a className="btn ghost" href={`${base}/exports/hand-raises`}>
            Download hand-raises
          </a>
        </div>
      </div>

      <div className="stats">
        <div className="stat good">
          <span className="k">Hand-raises</span>
          <span className="n">{n(raises.length)}</span>
          <span className="l">across {types.length} {types.length === 1 ? "offer" : "offers"} at the end of the survey</span>
        </div>
        <div className="stat">
          <span className="k">Verified</span>
          <span className="n">
            {n(verified)}
            <small>of {n(raises.length)}</small>
          </span>
          <span className="l">Address confirmed, or its domain matches the government</span>
        </div>
        {byType.map((t) => (
          <div className="stat" key={t.id}>
            <span className="k">{t.id === "pilot" ? "Pilot interest" : t.id === "report" ? "Wants the report" : t.label}</span>
            <span className="n">{n(t.rows.length)}</span>
            <span className="l">{t.label}</span>
          </div>
        ))}
        <div className="stat">
          <span className="k">Joined the panel</span>
          <span className="n">{n(joins.length)}</span>
          <span className="l">Will hear about future studies. Only their own tick adds them.</span>
        </div>
      </div>

      {byType.map((t) => (
        <div className="section" key={t.id}>
          <div className="section-head">
            <div>
              <h2>{t.label}</h2>
              <p>
                {t.rows.length === 0 ? "Nobody yet." : `${n(t.rows.length)} ${t.rows.length === 1 ? "person" : "people"}, newest first.`}
              </p>
            </div>
          </div>
          {t.rows.length > 0 ? (
            <div className="card scroll">
              <table>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left" }}>Who</th>
                    <th style={{ textAlign: "left" }}>Government</th>
                    <th style={{ textAlign: "left" }}>Email</th>
                    <th style={{ textAlign: "left" }}>Standing</th>
                    <th>When</th>
                  </tr>
                </thead>
                <tbody>
                  {t.rows.map((r, i) => (
                    <tr key={`${r.email}-${i}`}>
                      <td style={{ textAlign: "left" }}>
                        <b style={{ fontWeight: 600 }}>{r.fullName ?? roleLabel(r.role)}</b>
                        {r.fullName ? <span className="state" style={{ display: "block" }}>{roleLabel(r.role)}</span> : null}
                      </td>
                      <td style={{ textAlign: "left" }}>
                        {r.entityName}, {r.state}
                      </td>
                      <td style={{ textAlign: "left", fontVariantNumeric: "normal" }}>{r.email}</td>
                      <td style={{ textAlign: "left" }}>
                        {r.verifiedAt ? (
                          <span className="pill ok">Verified</span>
                        ) : r.domainMatch ? (
                          <span className="pill ok">Domain matches</span>
                        ) : (
                          <span className="pill warn">Unverified</span>
                        )}
                      </td>
                      <td>{when(r.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ))}

      <div className="section">
        <div className="section-head">
          <div>
            <h2>Joined the panel through this study</h2>
            <p>Shown by role and government, never by contact details. The panel lives under Contacts.</p>
          </div>
          <Link className="btn ghost small" href="/console/contacts/panel">
            The whole panel
          </Link>
        </div>
        <div className="card">
          {joins.length === 0 ? (
            <p className="note" style={{ margin: 0 }}>
              Nobody yet. The invitation is the last thing a respondent sees.
            </p>
          ) : (
            <ul className="rows">
              {joins.map((m) => (
                <li key={m.id}>
                  <span>
                    {roleLabel(m.role)}
                    <span className="state">
                      {" "}
                      — {m.entityName ?? "unknown government"}
                      {m.state ? `, ${m.state}` : ""}
                    </span>
                  </span>
                  <span className="when">{when(m.joinedAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <p className="flag">
        {labelFor("pilot") !== "pilot" ? "" : ""}
        Unverified hand-raises are shown but marked. A verification message goes out with the
        first send after someone raises a hand.
      </p>
    </>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { isSignedIn } from "@/lib/auth";
import { parseStudy } from "@/core/study-schema";
import { ROLES } from "@/core/lists";
import { expectedCompletes, expectedInterviews, marginAt, sampleSize } from "@/core/plan";
import { studyAndVersion, studyOf } from "@/db/queries/studies";
import { planSample } from "@/db/queries/sample";

export const dynamic = "force-dynamic";
export const metadata = { title: "Brief" };

const n = (x: number) => x.toLocaleString("en-US");
const roleLabel = (key: string) => ROLES.find((r) => r.key === key)?.label ?? key;

const TYPE_WORDS: Record<string, string> = {
  choice: "one answer", multi: "several answers", number: "a number", slider: "a share", scale: "a rating",
  open: "written", short_text: "a short answer",
};

// The study as a sponsor would describe it: the question, who is asking, who is asked, how
// deep it goes, and what each survey question is there to prove.
export default async function Brief({ params }: { params: Promise<{ slug: string }> }) {
  if (!(await isSignedIn())) redirect("/console/login");
  const { slug } = await params;

  const found = await studyAndVersion(slug);
  if (!found) redirect("/console/studies");
  const { study, version } = found;
  const parsed = parseStudy(study.draftText);
  const spec = parsed.ok ? parsed.study : version ? studyOf(version) : null;
  const base = `/console/studies/${slug}`;

  if (!spec) {
    return (
      <>
        <h1>Brief</h1>
        <p className="problem">
          The study file has problems, so the brief cannot be read. <Link href={`${base}/file`}>Fix them in the study file</Link>.
        </p>
      </>
    );
  }

  const plan = await planSample(spec, ["owner_only", "client_ok"]).catch(() => null);
  const reach = plan ? plan.candidates - Object.values(plan.skipped).reduce((a, b) => a + b, 0) : 0;
  const sample = plan ? plan.picked.length : sampleSize(reach, spec.sample.strata.bands.map((b) => b.target));
  const completes = expectedCompletes(sample);
  const interview = spec.stages.find((s) => s.type === "interview");
  const interviews = spec.features.ai_interview && interview && interview.type === "interview"
    ? expectedInterviews(completes, interview.invite?.max ?? null)
    : 0;
  const live = spec.stages.find((s) => s.type === "live");
  const evidence = spec.evidence_map ?? {};

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="ask">{spec.question ?? "What this study is for"}</h1>
          <p className="lede">
            {spec.question
              ? "The question this study exists to answer, then who is asking, who is asked, and how deep it goes."
              : "No question has been written yet. Add one in the whole file, as a line called question, and it leads the report."}
          </p>
        </div>
        <div className="actions">
          <Link className="btn ghost" href={`${base}/edit`}>
            Edit the questions
          </Link>
          <Link className="btn ghost" href={`${base}/preview`}>
            Preview as a respondent
          </Link>
        </div>
      </div>

      <div className="cols">
        <div>
          <div className="card">
            <div className="card-head">
              <div>
                <h3>Who is asking</h3>
                <p>What every respondent reads before the first question.</p>
              </div>
            </div>
            <dl className="kv">
              <dt>Appears as</dt>
              <dd>{spec.brand.display_name}</dd>
              <dt>The disclosure</dt>
              <dd>{spec.brand.sponsor_line}</dd>
              <dt>Reply-to</dt>
              <dd>{spec.brand.contact_email === "CHANGE_ME" ? <span className="low">Not set yet</span> : spec.brand.contact_email}</dd>
            </dl>
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-head">
              <div>
                <h3>Who is asked</h3>
                <p>The frame, the roles, and the size bands the sample is drawn across.</p>
              </div>
              <Link className="btn ghost small" href={`${base}/sample`}>
                The sample
              </Link>
            </div>
            <dl className="kv">
              <dt>Governments</dt>
              <dd>
                {spec.sample.frame.entity_types.map((t) => t.replace("_", " ")).join(", ")}
                {spec.sample.frame.min_population ? ` with at least ${n(spec.sample.frame.min_population)} people` : ""}
              </dd>
              <dt>Roles</dt>
              <dd>
                {spec.sample.frame.roles.map(roleLabel).join(", ")}
                {spec.sample.primary_roles?.length ? (
                  <span className="state">Mostly {spec.sample.primary_roles.map(roleLabel).join(" and ").toLowerCase()}</span>
                ) : null}
              </dd>
              <dt>Size bands</dt>
              <dd>
                {spec.sample.strata.bands.map((b) => (
                  <span key={b.key} style={{ display: "block" }}>
                    {b.label} <span className="state" style={{ display: "inline" }}>· target {n(b.target)}</span>
                  </span>
                ))}
              </dd>
              <dt>Pilot</dt>
              <dd>{n(spec.sample.pilot_size)} people first, then the rest</dd>
            </dl>
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-head">
              <div>
                <h3>The questions</h3>
                <p>Each one with what it is there to prove, from the study file&rsquo;s evidence map.</p>
              </div>
              <span className="pill">{spec.questions.length} questions</span>
            </div>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 36 }}>#</th>
                  <th style={{ textAlign: "left" }}>Question</th>
                  <th style={{ textAlign: "left" }}>Asks for</th>
                  <th style={{ textAlign: "left" }}>What it proves</th>
                </tr>
              </thead>
              <tbody>
                {spec.questions.map((q, i) => (
                  <tr key={q.id}>
                    <td style={{ textAlign: "left", color: "var(--muted)" }}>{i + 1}</td>
                    <td style={{ textAlign: "left" }}>
                      {q.text}
                      {spec.spine.includes(q.id) ? <span className="state"> · spine</span> : null}
                      {q.show_if ? <span className="state"> · only some see it</span> : null}
                    </td>
                    <td style={{ textAlign: "left", whiteSpace: "nowrap", color: "var(--muted)" }}>{TYPE_WORDS[q.type] ?? q.type}</td>
                    <td style={{ textAlign: "left", color: "var(--muted)", fontSize: 13 }}>{evidence[q.id] ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="card-foot">
              Spine questions open every way of responding, so interviews and surveys feed one dataset.
            </p>
          </div>
        </div>

        <div>
          <div className="card">
            <div className="card-head">
              <div>
                <h3>How deep it goes</h3>
                <p>Each step reaches fewer people and learns more from each.</p>
              </div>
            </div>
            <div className="rungs">
              <div className="rung">
                <span className={`dot ok`} style={{ marginTop: 4 }} aria-hidden="true" />
                <div>
                  <b>Survey</b>
                  <p>{spec.questions.length} questions, about five minutes.</p>
                </div>
                <span className="yield">on</span>
              </div>
              <div className="rung">
                <span className={`dot ${spec.features.ai_followup ? "ok" : "todo"}`} style={{ marginTop: 4 }} aria-hidden="true" />
                <div>
                  <b>Smart survey</b>
                  <p>One AI follow-up after each written answer.</p>
                </div>
                <span className="yield">{spec.features.ai_followup ? "on" : "off"}</span>
              </div>
              <div className="rung">
                <span className={`dot ${spec.features.ai_interview ? "ok" : "todo"}`} style={{ marginTop: 4 }} aria-hidden="true" />
                <div>
                  <b>AI interview</b>
                  <p>
                    {interview && interview.type === "interview"
                      ? `${interview.guide.topics.length} topics, up to ${interview.guide.max_minutes} minutes, offered to ${interview.invite?.max ?? "any"} people.`
                      : "No interview guide in this study."}
                  </p>
                </div>
                <span className="yield">{spec.features.ai_interview ? "on" : "off"}</span>
              </div>
              <div className="rung">
                <span className={`dot ${live && live.type === "live" && live.scheduling_url !== "CHANGE_ME" ? "ok" : "todo"}`} style={{ marginTop: 4 }} aria-hidden="true" />
                <div>
                  <b>Live conversation</b>
                  <p>{live && live.type === "live" && live.scheduling_url !== "CHANGE_ME" ? "A booking link is offered at the end." : "No booking link set."}</p>
                </div>
                <span className="yield">{live && live.type === "live" && live.scheduling_url !== "CHANGE_ME" ? "on" : "off"}</span>
              </div>
              <div className="rung">
                <span className={`dot ${spec.features.panel ? "ok" : "todo"}`} style={{ marginTop: 4 }} aria-hidden="true" />
                <div>
                  <b>Panel invitation</b>
                  <p>{spec.panel?.label ?? "No invitation text."}</p>
                </div>
                <span className="yield">{spec.features.panel ? "on" : "off"}</span>
              </div>
            </div>
          </div>

          <div className="card quiet" style={{ marginTop: 16 }}>
            <div className="card-head">
              <div>
                <h3>What to expect</h3>
                <p>From the lists as they stand today. Real numbers take over once fielding starts.</p>
              </div>
            </div>
            <dl className="kv">
              <dt>Reachable now</dt>
              <dd>{plan ? n(reach) : "—"}</dd>
              <dt>Would be drawn</dt>
              <dd>{n(sample)}</dd>
              <dt>Completed surveys</dt>
              <dd>about {n(completes)}</dd>
              {interviews > 0 ? (
                <>
                  <dt>Interviews</dt>
                  <dd>about {n(interviews)}</dd>
                </>
              ) : null}
              <dt>Margin of error</dt>
              <dd>{marginAt(completes) === null ? "—" : `about ±${marginAt(completes)} points on a share`}</dd>
            </dl>
          </div>

          {interview && interview.type === "interview" ? (
            <div className="card" style={{ marginTop: 16 }}>
              <div className="card-head">
                <div>
                  <h3>What the interviewer is testing</h3>
                  <p>The researcher&rsquo;s hypotheses. The model never invents a question outside the guide.</p>
                </div>
              </div>
              <ul className="rows">
                {interview.guide.hypotheses.map((h) => (
                  <li key={h}>
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}

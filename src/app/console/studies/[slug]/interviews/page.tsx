import Link from "next/link";
import { redirect } from "next/navigation";
import { isSignedIn } from "@/lib/auth";
import { parseStudy } from "@/core/study-schema";
import { whyUnavailable } from "@/core/engines";
import { studyAndVersion, studyOf } from "@/db/queries/studies";
import { interviewsFor, turnsFor } from "@/db/queries/interview";
import { modelAvailability } from "@/lib/model";
import { Nav } from "../../../nav";

export const dynamic = "force-dynamic";

export default async function Interviews({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ read?: string }>;
}) {
  if (!(await isSignedIn())) redirect("/console/login");
  const { slug } = await params;
  const { read } = await searchParams;

  const found = await studyAndVersion(slug);
  if (!found) redirect("/console/studies");
  const { study, version } = found;

  const parsed = parseStudy(study.draftText);
  const spec = parsed.ok ? parsed.study : version ? studyOf(version) : null;
  if (!spec) {
    return (
      <>
        <Nav current="/console/studies" />
        <h1>Interviews</h1>
        <p className="problem">
          The study file has problems, so its stages cannot be read.{" "}
          <Link href={`/console/studies/${slug}`}>Fix them on the study screen</Link>.
        </p>
      </>
    );
  }

  const stage = spec.stages.find((s) => s.type === "interview");
  // Rule 6: the kernel decides where this works, and the console explains when it does not.
  const engineProblem = whyUnavailable(spec.engine, "ai_interview");
  const model = modelAvailability();

  const list = await interviewsFor(study.id).catch(() => []);
  const reading = read ? await turnsFor(read).catch(() => []) : [];

  return (
    <>
      <Nav current="/console/studies" />
      <h1>Interviews</h1>
      <p className="sub">
        {study.name}. {list.length.toLocaleString("en-US")} conversations,{" "}
        {list.filter((i) => i.status === "completed").length.toLocaleString("en-US")} finished.
      </p>

      {engineProblem ? (
        <p className="problem">
          {engineProblem} This study runs on the {spec.engine} engine.
        </p>
      ) : !stage ? (
        <p className="problem">
          This study has no interview stage. Add one to the study file, and turn on
          features.ai_interview, to offer conversations after the survey.
        </p>
      ) : !spec.features.ai_interview ? (
        <p className="problem">
          There is an interview stage in the file but features.ai_interview is off, so nobody is
          offered one. The survey is unaffected either way.
        </p>
      ) : !model.available ? (
        <p className="problem">{model.why}</p>
      ) : (
        <p className="ok-note">
          Offered to respondents who match the stage&rsquo;s condition, up to{" "}
          {stage.type === "interview" ? (stage.invite?.max ?? "no") : "no"} of them. The opening
          question is always the researcher&rsquo;s, and anything the model says that is not a
          single question is thrown away in favour of the next scripted topic.
        </p>
      )}

      <div className="panel" style={{ marginTop: 16 }}>
        {list.length === 0 ? (
          <p className="note" style={{ margin: 0 }}>
            No conversations yet.
          </p>
        ) : (
          <ul className="rows">
            {list.map((i) => (
              <li key={i.id}>
                <span>
                  <Link href={`/console/studies/${slug}/interviews?read=${i.id}`}>
                    {i.stratumKey} · {i.turns} turns
                  </Link>
                  <span className="state"> — {i.status}</span>
                </span>
                <span className="when">
                  {i.startedAt ? i.startedAt.toLocaleDateString("en-US", { dateStyle: "medium" }) : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {read && reading.length > 0 ? (
        <>
          <h2>Transcript</h2>
          <div className="panel">
            <div className="chat">
              {reading.map((t) => (
                <div className={`msg ${t.speaker === "interviewer" ? "ai" : "me"}`} key={t.n}>
                  {t.text}
                  {t.speaker === "interviewer" && t.scripted ? (
                    <span className="state"> — from the guide</span>
                  ) : null}
                </div>
              ))}
            </div>
            <p className="note">
              No name, no email, no government. A transcript is kept apart from whoever gave it,
              the same as every other written answer.
            </p>
          </div>
        </>
      ) : null}

      <p className="flag">
        Transcripts are coded against the same codebook as written survey answers.{" "}
        <Link href={`/console/studies/${slug}/themes`}>Themes</Link> ·{" "}
        <Link href={`/console/studies/${slug}`}>Back to the study</Link>
      </p>
    </>
  );
}

import { readdir } from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isSignedIn } from "@/lib/auth";
import { parseStudy } from "@/core/study-schema";
import { readTemplate, startFromTemplate } from "../actions";

export const dynamic = "force-dynamic";

async function templates() {
  const dir = path.join(process.cwd(), "templates");
  let names: string[] = [];
  try {
    names = (await readdir(dir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
  } catch {
    return [];
  }
  const out = [];
  for (const name of names) {
    try {
      const parsed = parseStudy(await readTemplate(name));
      if (parsed.ok) {
        out.push({
          dir: name,
          name: parsed.study.name,
          questions: parsed.study.questions.length,
          modes: [
            "Survey",
            parsed.study.features.ai_followup ? "smart survey" : null,
            parsed.study.features.ai_interview ? "AI interview" : null,
          ].filter(Boolean).join(", "),
        });
      }
    } catch {
      // A template that does not parse is not offered.
    }
  }
  return out;
}

export default async function NewStudy({ searchParams }: { searchParams: Promise<{ problem?: string }> }) {
  if (!(await isSignedIn())) redirect("/console/login");
  const { problem } = await searchParams;
  const list = await templates();

  return (
    <>
      <h1>New study</h1>
      <p className="sub">
        Start from a template and edit it. Nothing is sent to anyone until you draw a sample and
        queue a touch.
      </p>

      {problem ? (
        <p className="problem" role="alert">
          {problem === "unknown" ? "That template could not be read." : problem}
        </p>
      ) : null}

      <h2>Start from a template</h2>
      <div className="panel">
        {list.length === 0 ? (
          <p className="note" style={{ margin: 0 }}>
            No templates found under <code>templates/</code>.
          </p>
        ) : (
          <ul className="checks">
            {list.map((t) => (
              <li key={t.dir}>
                <span />
                <div>
                  <b>{t.name}</b>
                  <p>
                    {t.questions} questions. {t.modes}.
                  </p>
                  <form action={startFromTemplate} style={{ marginTop: 8 }}>
                    <input type="hidden" name="template" value={t.dir} />
                    <button className="btn" type="submit">
                      Use this template
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="flag">
        Choosing who to ask and how they can answer comes next, on the study&rsquo;s own screen.{" "}
        <Link href="/console/studies">Back to studies</Link>
      </p>
    </>
  );
}

import { readdir } from "node:fs/promises";
import path from "node:path";
import { redirect } from "next/navigation";
import { isSignedIn } from "@/lib/auth";
import { parseStudy } from "@/core/study-schema";
import { listCards, isRole, type ListContact, type RoleKey } from "@/core/lists";
import { audienceContacts } from "@/db/queries/contacts";
import { readSettings } from "@/lib/settings";
import { readTemplate, startFromTemplate } from "../actions";
import { Brief, type TemplateChoice } from "./brief";

export const dynamic = "force-dynamic";

const BANDS = [
  { key: "under_10k", label: "Under 10,000", max: 9999 },
  { key: "10k_50k", label: "10,000 to 50,000", max: 49999 },
  { key: "50k_250k", label: "50,000 to 250,000", max: 249999 },
  { key: "over_250k", label: "Over 250,000", max: null },
];

async function templates(): Promise<TemplateChoice[]> {
  const dir = path.join(process.cwd(), "templates");
  let names: string[] = [];
  try {
    names = (await readdir(dir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
  } catch {
    return [];
  }
  const out: TemplateChoice[] = [];
  for (const name of names) {
    try {
      const parsed = parseStudy(await readTemplate(name));
      if (!parsed.ok) continue;
      const s = parsed.study;
      const interview = s.stages.find((st) => st.type === "interview");
      out.push({
        dir: name,
        name: s.name,
        question: s.question ?? "",
        sponsorLine: s.brand.sponsor_line,
        roles: s.sample.frame.roles,
        features: { ai_followup: s.features.ai_followup, ai_interview: s.features.ai_interview, panel: s.features.panel },
        targets: s.sample.strata.bands.map((b) => b.target),
        interviewMax: interview && interview.type === "interview" ? (interview.invite?.max ?? null) : null,
        questions: s.questions.length,
        hasInterview: Boolean(interview),
      });
    } catch {
      // A template that does not parse is not offered.
    }
  }
  return out;
}

// The brief comes first: what to learn, from whom, how deep, and what that should yield.
// The template is the starting point, not the whole story.
export default async function NewStudy({ searchParams }: { searchParams: Promise<{ problem?: string }> }) {
  if (!(await isSignedIn())) redirect("/console/login");
  const { problem } = await searchParams;

  const [list, rows, settings] = await Promise.all([templates(), audienceContacts().catch(() => []), readSettings()]);
  const contacts: ListContact[] = rows
    .filter((r) => isRole(r.role))
    .map((r) => ({
      id: r.id, role: r.role as RoleKey, state: r.state, entityType: r.entityType, population: r.population,
      licenseScope: r.licenseScope, source: r.source, suppressed: r.suppressed,
      emailStatus: r.emailStatus as ListContact["emailStatus"], lastContactedAt: r.lastContactedAt,
    }));
  const cards = listCards(contacts, BANDS, new Date(), settings.contactHistoryWindowDays);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Write the brief</h1>
          <p className="lede">
            Three choices shape everything else: the question, who you are asking, and how deep to go.
            Nothing is sent to anyone until you draw a sample and queue an email.
          </p>
        </div>
      </div>

      {problem ? (
        <p className="problem" role="alert">
          {problem === "unknown" ? "That template could not be read." : problem}
        </p>
      ) : null}

      {list.length === 0 ? (
        <div className="card">
          <p className="note" style={{ margin: 0 }}>
            No templates found under <code>templates/</code>.
          </p>
        </div>
      ) : (
        <Brief
          lists={cards.map((c) => ({ key: c.role, label: c.label, origin: c.origin, total: c.total, reachable: c.reachable }))}
          templates={list}
        />
      )}

      <div className="section">
        <div className="section-head">
          <div>
            <h2>Or start from a template as it is</h2>
            <p>The file exactly as written, with its own name. Everything can be changed after.</p>
          </div>
        </div>
        <div className="card">
          <ul className="checks">
            {list.map((t) => (
              <li key={t.dir}>
                <span />
                <div>
                  <b>{t.name}</b>
                  <p>
                    {t.questions} questions.{t.hasInterview ? " With an interview guide." : ""}
                  </p>
                  <form action={startFromTemplate} style={{ marginTop: 8 }}>
                    <input type="hidden" name="template" value={t.dir} />
                    <button className="btn ghost small" type="submit">
                      Use this template
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}

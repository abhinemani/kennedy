import Link from "next/link";
import { redirect } from "next/navigation";
import { isSignedIn } from "@/lib/auth";
import { parseStudy } from "@/core/study-schema";
import { themeCounts } from "@/core/coding";
import { studyAndVersion } from "@/db/queries/studies";
import { codableAnswers, codesForCounting, codingAgreement, themeList, themesFor } from "@/db/queries/coding";
import { modelAvailability } from "@/lib/model";
import { CodebookEditor, SuggestButtons, CodeRow } from "./forms";

export const dynamic = "force-dynamic";

// Uncoded answers come first, so the ones needing work are always on the page.
const SHOWN = 200;

export default async function Themes({ params }: { params: Promise<{ slug: string }> }) {
  if (!(await isSignedIn())) redirect("/console/login");
  const { slug } = await params;

  const found = await studyAndVersion(slug);
  if (!found) redirect("/console/studies");
  const { study } = found;

  const parsed = parseStudy(study.draftText);
  const inFile = parsed.ok ? (parsed.study.codebook ?? []) : [];

  const [themes, themes_, answers, counts, agreement] = await Promise.all([
    themesFor(study.id).catch(() => []),
    themeList(study.id).catch(() => []),
    codableAnswers(study.id).catch(() => []),
    codesForCounting(study.id).catch(() => []),
    codingAgreement(study.id).catch(() => null),
  ]);

  const model = modelAvailability();
  const tally = themeCounts(themes_, counts);
  const coded = answers.filter((a) => a.themeId !== null).length;
  const suggested = answers.filter((a) => a.coder === "ai").length;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Themes</h1>
          <p className="sub">
        {coded.toLocaleString("en-US")} of {answers.length.toLocaleString("en-US")} written
        answers carry a theme{suggested ? `, ${suggested} of them still as an unconfirmed suggestion` : ""}.
      </p>
        </div>
      </div>

      <p className="ok-note">
        The model proposes and you decide. A suggestion is never a code until you accept it, and
        a theme counts respondents, not mentions.
      </p>

      {!model.available ? <p className="problem">{model.why}</p> : null}

      <h2>The codebook</h2>
      <CodebookEditor
        slug={slug}
        themes={themes.map((t) => ({ id: t.id, code: t.code, label: t.label, definition: t.definition ?? "" }))}
        inFile={inFile.length}
      />

      {tally.some((t) => t.respondents > 0) ? (
        <>
          <h2>What people said</h2>
          <div className="panel">
            {tally.map((t) => {
              const top = Math.max(1, ...tally.map((x) => x.respondents));
              return (
                <div className="theme" key={t.code}>
                  <span>{t.label}</span>
                  <span className="n">{t.respondents}</span>
                  <div className="track">
                    <div className="fill" style={{ width: `${(t.respondents / top) * 100}%` }} />
                  </div>
                </div>
              );
            })}
            <p className="note">Each bar is how many people said it, not how many times it was said.</p>
          </div>
        </>
      ) : null}

      <h2>Coding</h2>
      <SuggestButtons slug={slug} disabled={!model.available || themes.length === 0} />

      <div className="panel" style={{ marginTop: 12 }}>
        <p className="note" style={{ margin: 0 }}>
          {agreement
            ? `On the double-coded sample, the two passes agreed on ${agreement.agreed} of ${agreement.sampled}` +
              ` (${Math.round((agreement.agreed / Math.max(1, agreement.sampled)) * 100)} percent). This figure goes in the methods note.`
            : "No answer has been coded twice yet. The second pass is what makes the agreement figure mean anything."}
        </p>
      </div>

      {answers.length === 0 ? (
        <div className="panel" style={{ marginTop: 12 }}>
          <p className="note" style={{ margin: 0 }}>
            No written answers yet.
          </p>
        </div>
      ) : (
        answers.slice(0, SHOWN).map((a) => (
          <CodeRow
            key={a.freeTextId}
            slug={slug}
            answer={a}
            themes={themes.map((t) => ({ id: t.id, code: t.code, label: t.label }))}
          />
        ))
      )}

      {answers.length > SHOWN ? (
        <p className="note">
          Showing the first {SHOWN.toLocaleString("en-US")} of {answers.length.toLocaleString("en-US")} written answers, uncoded ones first.
        </p>
      ) : null}

      <p className="flag">
        Written answers are stored apart from anything that identifies who wrote them.{" "}
        <Link href={`/console/studies/${slug}/results`}>Back to results</Link>
      </p>
    </>
  );
}

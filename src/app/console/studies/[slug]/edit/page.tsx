import Link from "next/link";
import { redirect } from "next/navigation";
import { isSignedIn } from "@/lib/auth";
import { parseStudy } from "@/core/study-schema";
import { studyBySlug } from "@/db/queries/studies";
import { QuestionCard, SampleForm, TouchCard } from "./forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit" };

// Version two of the editor, on top of the same file as the text view. Nothing here can
// produce a study the Advanced view would refuse: every change is checked before it is saved.
export default async function FormEditor({ params }: { params: Promise<{ slug: string }> }) {
  if (!(await isSignedIn())) redirect("/console/login");
  const { slug } = await params;

  const study = await studyBySlug(slug);
  if (!study) redirect("/console/studies");

  const parsed = parseStudy(study.draftText);
  if (!parsed.ok) {
    return (
      <>
        <h1>Edit</h1>
        <p className="problem">
          This file has problems, so the form cannot work on it. The form only ever edits a study
          that already parses, which is how it can never be the thing that breaks one.{" "}
          <Link href={`/console/studies/${slug}/file`}>Fix it in the whole file</Link>.
        </p>
      </>
    );
  }

  const spec = parsed.study;
  const questions = spec.questions.map((q) => ({
    id: q.id,
    type: q.type,
    text: q.text,
    hint: q.hint ?? "",
    options: q.type === "choice" || q.type === "multi" ? q.options.map((o) => ({ value: String(o.value), label: o.label })) : [],
    showIf: q.show_if ? JSON.stringify(q.show_if) : "",
    inSpine: spec.spine.includes(q.id),
  }));

  return (
    <>
      <nav className="subnav" aria-label="Ways to edit" style={{ marginTop: -8 }}>
        <Link href={`/console/studies/${slug}/edit`} aria-current="page">
          Form
        </Link>
        <Link href={`/console/studies/${slug}/file`}>Whole file</Link>
        <Link href={`/console/studies/${slug}/preview`}>Preview</Link>
      </nav>

      <h2>Edit</h2>
      <p className="sub">
        The same file as the whole-file view, one field at a time. Every change is checked
        before it is saved.
      </p>

      <p className="ok-note">
        Editing here and editing in the text view are the same thing. Comments and layout in the
        file are left exactly as they are.
      </p>

      <h2>Questions</h2>
      {questions.map((q, i) => (
        <QuestionCard
          key={q.id}
          slug={slug}
          question={q}
          earlier={questions.slice(0, i).map((e) => ({ id: e.id, text: e.text, options: e.options }))}
          isFirst={i === 0}
          isLast={i === questions.length - 1}
        />
      ))}

      <h2>The email sequence</h2>
      {spec.sequence.map((t) => (
        <TouchCard key={t.touch} slug={slug} touch={{ touch: t.touch, day: t.day, subjects: t.subjects, body: t.body }} />
      ))}

      <h2>Sample</h2>
      <SampleForm
        slug={slug}
        bands={spec.sample.strata.bands.map((b) => ({ key: b.key, label: b.label, target: b.target }))}
        pilotSize={spec.sample.pilot_size}
        seed={spec.sample.seed}
        historyWindow={spec.sample.contact_history_window_days}
      />

      <p className="flag">
        <Link href={`/console/studies/${slug}/file`}>The whole file, and publishing</Link> ·{" "}
        <Link href={`/console/studies/${slug}/preview`}>Preview the survey</Link>
      </p>
    </>
  );
}

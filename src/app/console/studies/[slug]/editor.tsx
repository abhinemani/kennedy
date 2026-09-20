"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { parseStudy } from "@/core/study-schema";
import { makeTestLink, publishStudy, saveStudyDraft } from "../actions";

// Version one of the editor is a text editor with guard rails (NO_TERMINAL.md). The problems
// beside it come from the kernel's parseStudy, so the operator reads the same plain words the
// rules are written in, and Publish is disabled while any problem remains.

export function Editor({
  slug,
  initialText,
  published,
}: {
  slug: string;
  initialText: string;
  published: { version: number; at: string } | null;
}) {
  const [text, setText] = useState(initialText);
  const [saveMessage, save, saving] = useActionState(saveStudyDraft, null);
  const [publishMessage, doPublish, publishing] = useActionState(publishStudy, null);
  const [linkMessage, makeLink, linking] = useActionState(makeTestLink, null);

  // Validated as it is typed, by the same function that guards publishing.
  const parsed = useMemo(() => parseStudy(text), [text]);
  const problems = parsed.ok ? [] : parsed.problems;
  const warnings = parsed.ok ? parsed.warnings : [];
  const dirty = text !== initialText;

  return (
    <div className="editor" style={{ marginTop: 16 }}>
      <form action={save}>
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="text" value={text} />
        <label className="field" htmlFor="study-text">
          The study file
        </label>
        <p className="hint field-hint" id="study-text-hint">
          Everything about this study lives here: the questions, who is asked, the emails, and the
          benchmark.
        </p>
        <textarea
          id="study-text"
          value={text}
          spellCheck={false}
          onChange={(e) => setText(e.target.value)}
          aria-describedby="study-text-hint study-problems"
        />
        <div className="nav">
          <button className="btn ghost" type="submit" disabled={saving || !dirty}>
            {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
          </button>
          <Link className="btn ghost" href={`/console/studies/${slug}/preview`}>
            Preview survey
          </Link>
        </div>
        {saveMessage ? (
          <p className="note" role="status">
            {saveMessage}
          </p>
        ) : null}
      </form>

      <div id="study-problems">
        <h2 style={{ marginTop: 0 }}>
          {problems.length === 0 ? "No problems" : problems.length === 1 ? "1 problem" : `${problems.length} problems`}
        </h2>

        {problems.length === 0 ? (
          <p className="ok-note">
            This file is valid. {warnings.length === 0 ? "Nothing is waiting on you." : "There are notes below."}
          </p>
        ) : (
          <ul className="problems">
            {problems.map((p, i) => (
              <li key={`${p.where}-${i}`}>
                <b>{p.where}</b>
                {p.message}
              </li>
            ))}
          </ul>
        )}

        {warnings.length > 0 ? (
          <>
            <h2>Notes</h2>
            <ul className="problems">
              {warnings.map((w, i) => (
                <li key={`${w.where}-${i}`}>
                  <b>{w.where}</b>
                  {w.message}
                </li>
              ))}
            </ul>
          </>
        ) : null}

        <h2>Publish</h2>
        <div className="panel">
          <p className="note" style={{ margin: "0 0 12px" }}>
            {published
              ? `Version ${published.version} is live. Publishing again freezes the file as the next version; the old one stays exactly as it was.`
              : "Publishing freezes the file as version 1. Every response records the version it answered."}
          </p>
          <form action={doPublish}>
            <input type="hidden" name="slug" value={slug} />
            <button className="btn" type="submit" disabled={publishing || problems.length > 0 || dirty}>
              {publishing ? "Publishing…" : "Publish version"}
            </button>
          </form>
          {problems.length > 0 ? (
            <p className="note">Publishing is off while there are problems to fix.</p>
          ) : dirty ? (
            <p className="note">Save your changes first, so you publish what you are looking at.</p>
          ) : null}
          {publishMessage ? (
            <p className="note" role="status">
              {publishMessage}
            </p>
          ) : null}
        </div>

        <h2>Try it yourself</h2>
        <div className="panel">
          <p className="note" style={{ margin: "0 0 12px" }}>
            A rehearsal link, pointed at an obviously fake government, so you can walk the whole
            survey on your phone before anyone real is asked.
          </p>
          <form action={makeLink}>
            <input type="hidden" name="slug" value={slug} />
            <button className="btn ghost" type="submit" disabled={linking || !published}>
              {linking ? "Making a link…" : "Create a rehearsal link"}
            </button>
          </form>
          {!published ? <p className="note">Publish the study first.</p> : null}
          {linkMessage ? (
            linkMessage.startsWith("/s/") ? (
              <p className="note" role="status">
                Open <Link href={linkMessage}>{linkMessage}</Link> — it behaves exactly like a real
                one, and its answers are marked as a rehearsal.
              </p>
            ) : (
              <p className="note" role="status">
                {linkMessage}
              </p>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}

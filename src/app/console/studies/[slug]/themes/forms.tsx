"use client";

import { useActionState, useState } from "react";
import { applyCode, deleteTheme, editTheme, importCodebook, suggestAll, suggestSecondPass } from "./actions";

type ThemeRow = { id: string; code: string; label: string; definition: string };

export function CodebookEditor({ slug, themes, inFile }: { slug: string; themes: ThemeRow[]; inFile: number }) {
  const [message, action, working] = useActionState(editTheme, null);
  const [editing, setEditing] = useState<ThemeRow | null>(null);

  return (
    <>
      <div className="panel">
        {themes.length === 0 ? (
          <p className="note" style={{ margin: "0 0 12px" }}>
            No themes yet.{" "}
            {inFile > 0
              ? `The study file has ${inFile}; bring them in and edit from there.`
              : "Add them below, or write them into the study file first."}
          </p>
        ) : (
          <ul className="rows">
            {themes.map((t) => (
              <li key={t.id}>
                <span>
                  <b style={{ fontWeight: 500 }}>{t.label}</b>
                  <span className="state"> — {t.code}</span>
                  {t.definition ? <p className="note" style={{ margin: 0 }}>{t.definition}</p> : null}
                </span>
                <span style={{ display: "flex", gap: 8 }}>
                  <button className="chip" type="button" onClick={() => setEditing(t)}>
                    Edit
                  </button>
                  <form action={deleteTheme}>
                    <input type="hidden" name="slug" value={slug} />
                    <input type="hidden" name="theme_id" value={t.id} />
                    <button className="chip" type="submit">
                      Remove
                    </button>
                  </form>
                </span>
              </li>
            ))}
          </ul>
        )}

        {inFile > 0 ? (
          <form action={importCodebook} style={{ marginTop: 12 }}>
            <input type="hidden" name="slug" value={slug} />
            <button className="btn ghost" type="submit">
              Bring in the {inFile} themes from the study file
            </button>
          </form>
        ) : null}
      </div>

      <form action={action} className="panel" style={{ marginTop: 12 }} key={editing?.id ?? "new"}>
        <input type="hidden" name="slug" value={slug} />

        <label className="field" htmlFor="theme-code">
          {editing ? `Editing ${editing.code}` : "Add a theme"}
        </label>
        <p className="hint field-hint" id="theme-code-hint">
          A short code for the data, and a label a person can read.
        </p>
        <input
          id="theme-code"
          name="code"
          type="text"
          required
          aria-describedby="theme-code-hint"
          placeholder="redaction"
          defaultValue={editing?.code ?? ""}
          readOnly={Boolean(editing)}
        />

        <label className="field" htmlFor="theme-label">
          Label
        </label>
        <input
          id="theme-label"
          name="label"
          type="text"
          required
          placeholder="Redaction takes the time"
          defaultValue={editing?.label ?? ""}
        />

        <label className="field" htmlFor="theme-definition">
          What counts as this theme
        </label>
        <p className="hint field-hint" id="theme-definition-hint">
          Optional, and the thing that makes two people code the same way.
        </p>
        <input
          id="theme-definition"
          name="definition"
          type="text"
          aria-describedby="theme-definition-hint"
          defaultValue={editing?.definition ?? ""}
        />

        {message ? (
          <p className="note" role="status">
            {message}
          </p>
        ) : null}

        <div className="nav">
          {editing ? (
            <button className="btn ghost" type="button" onClick={() => setEditing(null)}>
              Add a new one instead
            </button>
          ) : (
            <span />
          )}
          <button className="btn" type="submit" disabled={working}>
            {working ? "Saving…" : editing ? "Save theme" : "Add theme"}
          </button>
        </div>
      </form>
    </>
  );
}

export function SuggestButtons({ slug, disabled }: { slug: string; disabled: boolean }) {
  const [first, suggestFirst, working] = useActionState(suggestAll, null);
  const [second, suggestSecond, working2] = useActionState(suggestSecondPass, null);

  return (
    <div className="panel">
      <p className="note" style={{ margin: "0 0 12px" }}>
        The model reads one answer at a time and picks from your codebook. It never invents a
        theme, and anything it returns that is not one of your codes is thrown away.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <form action={suggestFirst}>
          <input type="hidden" name="slug" value={slug} />
          <button className="btn ghost" type="submit" disabled={disabled || working}>
            {working ? "Reading…" : "Suggest themes for uncoded answers"}
          </button>
        </form>
        <form action={suggestSecond}>
          <input type="hidden" name="slug" value={slug} />
          <button className="btn ghost" type="submit" disabled={disabled || working2}>
            {working2 ? "Reading…" : "Code the double-coded sample again"}
          </button>
        </form>
      </div>
      {first ? (
        <p className="note" role="status">
          {first}
        </p>
      ) : null}
      {second ? (
        <p className="note" role="status">
          {second}
        </p>
      ) : null}
    </div>
  );
}

type Answer = {
  freeTextId: string;
  text: string;
  questionId: string;
  stratumKey: string;
  themeId: string | null;
  themeCode: string | null;
  coder: string | null;
  confidence: number | null;
  isDoubleCoded: boolean;
};

export function CodeRow({
  slug,
  answer,
  themes,
}: {
  slug: string;
  answer: Answer;
  themes: { id: string; code: string; label: string }[];
}) {
  const [message, action, working] = useActionState(applyCode, null);

  return (
    <div className="panel" style={{ marginTop: 12 }}>
      <p className="note" style={{ margin: "0 0 4px" }}>
        {answer.questionId} · {answer.stratumKey}
        {answer.isDoubleCoded ? <span className="state"> · in the double-coded sample</span> : null}
      </p>
      <p className="prose" style={{ fontSize: 16, margin: "0 0 12px" }}>
        {answer.text}
      </p>

      {answer.coder === "ai" && answer.themeCode ? (
        <p className="problem" style={{ margin: "0 0 10px" }}>
          Suggested: {themes.find((t) => t.id === answer.themeId)?.label ?? answer.themeCode}
          {answer.confidence !== null ? ` — ${answer.confidence} out of 100 confident` : ""}. Accept it
          or pick another.
        </p>
      ) : null}

      <form action={action}>
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="free_text_id" value={answer.freeTextId} />

        <div className="chips">
          {themes.map((t) => (
            <button
              key={t.id}
              className="chip"
              type="submit"
              name="theme_id"
              value={t.id}
              aria-pressed={answer.themeId === t.id}
              disabled={working}
            >
              {t.label}
            </button>
          ))}
          <button className="chip" type="submit" name="theme_id" value="" disabled={working}>
            None of these
          </button>
        </div>

        {message ? (
          <p className="note" role="status">
            {message}
          </p>
        ) : null}
      </form>
    </div>
  );
}

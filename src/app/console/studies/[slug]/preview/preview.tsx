"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Question, Study } from "@/core/study-schema";
import { canContinue, checkPlausible, nextQuestion, previousQuestion, visibleQuestions, UNKNOWN } from "@/core/flow";
import { computeBenchmark } from "@/core/benchmark";
import { afterSurvey } from "@/core/flow";

// The whole respondent flow, driven by the same kernel functions the real pages use, running
// in the browser so that nothing touches the database. Rule: preview records nothing.

type Attrs = Record<string, string | number>;

const DEFAULT_ATTRS: Attrs = {
  role: "clerk",
  role_label: "clerk",
  state: "MI",
  entity_type: "city",
  population: 42000,
  population_band: "10k_50k",
};

export function Preview({ study, slug }: { study: Study; slug: string }) {
  const [attrs, setAttrs] = useState<Attrs>(DEFAULT_ATTRS);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);

  const scope = useMemo(() => ({ ...attrs, ...answers }), [attrs, answers]);
  const visible = visibleQuestions(study, answers, attrs);
  const current = currentId ? study.questions.find((q) => q.id === currentId) ?? null : null;

  const reset = () => {
    setAnswers({});
    setCurrentId(null);
    setStarted(false);
    setConfirming(null);
  };

  const set = (id: string, value: unknown) => setAnswers((a) => ({ ...a, [id]: value }));

  const advance = (from: string) => {
    const q = study.questions.find((x) => x.id === from);
    if (q) {
      const prompt = checkPlausible(q, answers[from], answers, attrs);
      if (prompt && confirming !== from) {
        setConfirming(from);
        return;
      }
    }
    setConfirming(null);
    const after = nextQuestion(study, answers, attrs, from);
    setCurrentId(after ? after.id : "__done");
  };

  return (
    <>
      <h2>Link attributes</h2>
      <div className="panel">
        <p className="note" style={{ margin: "0 0 8px" }}>
          What we already know about the person this link was prepared for. Change these to see how
          the survey behaves for a different government.
        </p>
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
          {Object.entries(attrs).map(([k, v]) => (
            <label className="field" key={k} style={{ margin: 0 }}>
              {k}
              <input
                type={typeof v === "number" ? "number" : "text"}
                value={String(v)}
                onChange={(e) =>
                  setAttrs((a) => ({ ...a, [k]: typeof v === "number" ? Number(e.target.value) : e.target.value }))
                }
              />
            </label>
          ))}
        </div>
        <div className="nav">
          <button className="btn ghost" type="button" onClick={reset}>
            Start over
          </button>
          <Link className="btn ghost" href={`/console/studies/${slug}`}>
            Back to the study
          </Link>
        </div>
      </div>

      <h2>What they see</h2>
      <div className="letter" style={{ maxWidth: 420 }}>
        {!started ? (
          <Intro study={study} attrs={attrs} onStart={() => {
            setStarted(true);
            const first = nextQuestion(study, {}, attrs, null);
            setCurrentId(first ? first.id : "__done");
          }} />
        ) : currentId === "__done" ? (
          <EndScreen study={study} answers={answers} attrs={attrs} scope={scope} onBack={() => {
            const last = visible[visible.length - 1];
            setCurrentId(last ? last.id : null);
          }} />
        ) : current ? (
          confirming === current.id ? (
            <Confirm
              message={checkPlausible(current, answers[current.id], answers, attrs)?.message ?? ""}
              onKeep={() => advance(current.id)}
              onChange={() => setConfirming(null)}
            />
          ) : (
            <Screen
              q={current}
              value={answers[current.id]}
              index={visible.findIndex((v) => v.id === current.id)}
              total={visible.length + 1}
              onChange={(v) => set(current.id, v)}
              onNext={() => advance(current.id)}
              onBack={() => {
                const before = previousQuestion(study, answers, attrs, current.id);
                if (before) setCurrentId(before.id);
                else setStarted(false);
              }}
            />
          )
        ) : null}
      </div>

      <p className="flag">
        Nothing on this screen is written down. To record a real run, make a rehearsal link on the
        study screen instead.
      </p>
    </>
  );
}

function fill(template: string, scope: Record<string, unknown>) {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => {
    const v = scope[key];
    if (v === undefined || v === null) return whole;
    return typeof v === "number" ? v.toLocaleString("en-US") : String(v);
  });
}

function Intro({ study, attrs, onStart }: { study: Study; attrs: Attrs; onStart: () => void }) {
  return (
    <>
      <p className="q">{fill(study.intro.title, attrs)}</p>
      <p className="hint">{fill(study.intro.body, attrs)}</p>
      <div className="nav">
        <span className="btn ghost">{study.intro.not_me_label}</span>
        <button className="btn" type="button" onClick={onStart}>
          Start the survey
        </button>
      </div>
    </>
  );
}

function Confirm({ message, onKeep, onChange }: { message: string; onKeep: () => void; onChange: () => void }) {
  return (
    <>
      <p className="q">{message}</p>
      <p className="hint">Either answer is fine.</p>
      <div className="nav">
        <button className="btn ghost" type="button" onClick={onChange}>
          Let me change it
        </button>
        <button className="btn" type="button" onClick={onKeep}>
          Yes, that is right
        </button>
      </div>
    </>
  );
}

function Screen({
  q,
  value,
  index,
  total,
  onChange,
  onNext,
  onBack,
}: {
  q: Question;
  value: unknown;
  index: number;
  total: number;
  onChange: (v: unknown) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const pct = Math.round(((index + 1) / total) * 100);
  return (
    <>
      <div className="progress">
        <i style={{ width: `${pct}%` }} />
      </div>
      <p className="q">{q.text}</p>
      {q.hint ? <p className="hint">{q.hint}</p> : null}

      {(q.type === "choice" || q.type === "multi") && (
        <div className="opts">
          {q.options.map((o) => {
            const chosen =
              q.type === "multi"
                ? Array.isArray(value) && (value as (string | number)[]).includes(o.value)
                : value === o.value;
            return (
              <button
                key={String(o.value)}
                className="opt"
                type="button"
                aria-pressed={chosen}
                onClick={() => {
                  if (q.type === "multi") {
                    const list = Array.isArray(value) ? [...(value as (string | number)[])] : [];
                    const at = list.indexOf(o.value);
                    if (at === -1) list.push(o.value);
                    else list.splice(at, 1);
                    onChange(list);
                  } else {
                    onChange(o.value);
                  }
                }}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      )}

      {q.type === "number" && (
        <>
          <input
            type="number"
            min={0}
            value={typeof value === "number" ? value : ""}
            onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
          />
          {q.allow_unknown ? (
            <label className="check" style={{ marginTop: 14 }}>
              <input type="checkbox" checked={value === UNKNOWN} onChange={(e) => onChange(e.target.checked ? UNKNOWN : undefined)} />
              <span>I don&rsquo;t know</span>
            </label>
          ) : null}
        </>
      )}

      {q.type === "slider" && (
        <>
          <output className="big">
            {typeof value === "number" ? value : (q.default ?? q.min)}
            {q.unit ?? ""}
          </output>
          <input
            type="range"
            min={q.min}
            max={q.max}
            step={q.step}
            value={typeof value === "number" ? value : (q.default ?? q.min)}
            onChange={(e) => onChange(Number(e.target.value))}
          />
        </>
      )}

      {q.type === "scale" && (
        <>
          <div className="scale" style={{ gridTemplateColumns: `repeat(${q.max - q.min + 1}, 1fr)` }}>
            {Array.from({ length: q.max - q.min + 1 }, (_, i) => q.min + i).map((n) => (
              <button key={n} className="opt" type="button" aria-pressed={value === n} onClick={() => onChange(n)}>
                {n}
              </button>
            ))}
          </div>
          <div className="ends">
            <span>{q.min_label}</span>
            <span>{q.max_label}</span>
          </div>
        </>
      )}

      {(q.type === "open" || q.type === "short_text") &&
        (q.type === "open" ? (
          <textarea value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} />
        ) : (
          <input type="text" value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} />
        ))}

      <div className="nav">
        <button className="btn ghost" type="button" onClick={onBack}>
          Back
        </button>
        <button className="btn" type="button" onClick={onNext} disabled={!canContinue(q, value)}>
          Continue
        </button>
      </div>
    </>
  );
}

function EndScreen({
  study,
  answers,
  attrs,
  scope,
  onBack,
}: {
  study: Study;
  answers: Record<string, unknown>;
  attrs: Attrs;
  scope: Record<string, unknown>;
  onBack: () => void;
}) {
  // No peers in a preview, so the benchmark shows its sentences and says the chart is empty.
  const results = computeBenchmark(study, scope, {});
  const steps = afterSurvey(study, answers, attrs, 0);

  return (
    <>
      <div className="progress">
        <i style={{ width: "100%" }} />
      </div>
      <p className="q">Here is how your answers compare.</p>
      <p className="hint">
        A preview has no peers to compare against, so the chart is empty here. A real respondent
        sees their size band.
      </p>
      {results
        .filter((r) => r.sentence)
        .map((r) => (
          <p className="hint" key={r.id}>
            {r.sentence}
          </p>
        ))}

      {steps.map((s, i) =>
        s.kind === "hand_raise" ? (
          <label className="check" key={s.id}>
            <input type="checkbox" defaultChecked={s.default} readOnly />
            <span>{s.label}</span>
          </label>
        ) : s.kind === "panel" ? (
          <label className="check" key={`panel-${i}`}>
            <input type="checkbox" readOnly />
            <span>{s.label}</span>
          </label>
        ) : s.kind === "interview" ? (
          <p className="note" key={s.stageId}>
            Offered: {s.label}
          </p>
        ) : s.kind === "live" ? (
          <p className="note" key={s.stageId}>
            Offered: {s.label}
          </p>
        ) : null,
      )}

      <div className="nav">
        <button className="btn ghost" type="button" onClick={onBack}>
          Back
        </button>
        <span className="btn" aria-disabled="true">
          Record my response
        </span>
      </div>
    </>
  );
}

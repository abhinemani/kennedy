"use client";

import { useActionState, useState } from "react";
import {
  editOption, editQuestionText, editSample, editShowIf, editSubject, editTarget, editTouch,
  reorderQuestion,
} from "./actions";

type Option = { value: string; label: string };
type Question = {
  id: string;
  type: string;
  text: string;
  hint: string;
  options: Option[];
  showIf: string;
  inSpine: boolean;
};

function Message({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p className={text === "Saved." ? "note" : "problem"} role="status">
      {text}
    </p>
  );
}

export function QuestionCard({
  slug,
  question,
  earlier,
  isFirst,
  isLast,
}: {
  slug: string;
  question: Question;
  earlier: { id: string; text: string; options: Option[] }[];
  isFirst: boolean;
  isLast: boolean;
}) {
  const [wording, saveWording, savingWording] = useActionState(editQuestionText, null);
  const [option, saveOption, savingOption] = useActionState(editOption, null);
  const [order, saveOrder, savingOrder] = useActionState(reorderQuestion, null);
  const [condition, saveCondition, savingCondition] = useActionState(editShowIf, null);
  const [dependsOn, setDependsOn] = useState(() => {
    const match = /^\{"([a-z0-9_]+)"/.exec(question.showIf);
    return match?.[1] ?? "";
  });

  const chosen = earlier.find((e) => e.id === dependsOn);

  return (
    <div className="panel" style={{ marginTop: 12 }}>
      <p className="note" style={{ margin: "0 0 8px" }}>
        {question.id} · {question.type}
        {question.inSpine ? <span className="state"> · in the spine</span> : null}
      </p>

      <form action={saveWording}>
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="id" value={question.id} />
        <input type="hidden" name="field" value="text" />
        <label className="field" htmlFor={`text-${question.id}`}>
          What it asks
        </label>
        <input id={`text-${question.id}`} name="value" type="text" defaultValue={question.text} />
        <div className="nav">
          <span />
          <button className="btn ghost" type="submit" disabled={savingWording}>
            Save wording
          </button>
        </div>
        <Message text={wording} />
      </form>

      <form action={saveWording}>
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="id" value={question.id} />
        <input type="hidden" name="field" value="hint" />
        <label className="field" htmlFor={`hint-${question.id}`}>
          The smaller line underneath
        </label>
        <p className="hint field-hint" id={`hint-${question.id}-hint`}>
          Leave it empty to take it away.
        </p>
        <input
          id={`hint-${question.id}`}
          name="value"
          type="text"
          defaultValue={question.hint}
          aria-describedby={`hint-${question.id}-hint`}
        />
        <div className="nav">
          <span />
          <button className="btn ghost" type="submit" disabled={savingWording}>
            Save hint
          </button>
        </div>
      </form>

      {question.options.length > 0 ? (
        <>
          <label className="field">Answers</label>
          {question.options.map((o) => (
            <form action={saveOption} key={o.value} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="id" value={question.id} />
              <input type="hidden" name="option_value" value={o.value} />
              <input name="label" type="text" defaultValue={o.label} aria-label={`Label for ${o.value}`} />
              <button className="chip" type="submit" disabled={savingOption}>
                Save
              </button>
            </form>
          ))}
          <Message text={option} />
        </>
      ) : null}

      <form action={saveCondition}>
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="id" value={question.id} />

        <label className="field" htmlFor={`dep-${question.id}`}>
          Only show this when
        </label>
        <p className="hint field-hint" id={`dep-${question.id}-hint`}>
          A question can only look at answers given before it.
        </p>
        <select
          id={`dep-${question.id}`}
          name="depends_on"
          value={dependsOn}
          aria-describedby={`dep-${question.id}-hint`}
          onChange={(e) => setDependsOn(e.target.value)}
        >
          <option value="">Always show it</option>
          {earlier.map((e) => (
            <option key={e.id} value={e.id}>
              {e.text.slice(0, 60)}
            </option>
          ))}
        </select>

        {dependsOn ? (
          <>
            <label className="field" htmlFor={`test-${question.id}`}>
              is
            </label>
            <select id={`test-${question.id}`} name="test" defaultValue="equals">
              <option value="equals">exactly</option>
              <option value="not_equals">anything but</option>
              <option value="in">one of</option>
              <option value="not_in">none of</option>
              <option value="answered">answered at all</option>
            </select>

            {chosen && chosen.options.length > 0 ? (
              <>
                <label className="field">these answers</label>
                <div className="chips">
                  {chosen.options.map((o) => (
                    <label className="chip" key={o.value}>
                      <input type="checkbox" name="values" value={o.value} /> {o.label}
                    </label>
                  ))}
                </div>
              </>
            ) : null}
          </>
        ) : null}

        <div className="nav">
          <span />
          <button className="btn ghost" type="submit" disabled={savingCondition}>
            Save condition
          </button>
        </div>
        <Message text={condition} />
      </form>

      <form action={saveOrder} style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="id" value={question.id} />
        <button className="chip" type="submit" name="direction" value="up" disabled={savingOrder || isFirst}>
          Move up
        </button>
        <button className="chip" type="submit" name="direction" value="down" disabled={savingOrder || isLast}>
          Move down
        </button>
      </form>
      <Message text={order} />
    </div>
  );
}

export function TouchCard({
  slug,
  touch,
}: {
  slug: string;
  touch: { touch: number; day: number; subjects: string[]; body: string };
}) {
  const [message, save, saving] = useActionState(editTouch, null);
  const [subject, saveSubject, savingSubject] = useActionState(editSubject, null);

  return (
    <div className="panel" style={{ marginTop: 12 }}>
      <b style={{ fontWeight: 500 }}>Touch {touch.touch}</b>

      <form action={save}>
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="touch" value={touch.touch} />
        <input type="hidden" name="field" value="day" />
        <label className="field" htmlFor={`day-${touch.touch}`}>
          Days after the first email
        </label>
        <input id={`day-${touch.touch}`} name="value" type="number" min={0} defaultValue={touch.day} />
        <div className="nav">
          <span />
          <button className="btn ghost" type="submit" disabled={saving}>
            Save day
          </button>
        </div>
      </form>

      <label className="field">Subject lines</label>
      {touch.subjects.map((s, i) => (
        <form action={saveSubject} key={i} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="touch" value={touch.touch} />
          <input type="hidden" name="index" value={i} />
          <input name="value" type="text" defaultValue={s} aria-label={`Subject line ${i + 1}`} />
          <button className="chip" type="submit" disabled={savingSubject}>
            Save
          </button>
        </form>
      ))}
      <Message text={subject} />

      <form action={save}>
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="touch" value={touch.touch} />
        <input type="hidden" name="field" value="body" />
        <label className="field" htmlFor={`body-${touch.touch}`}>
          The email
        </label>
        <p className="hint field-hint" id={`body-${touch.touch}-hint`}>
          It must keep one {"{link}"}, a {"{postal_address}"} and an {"{unsubscribe}"}, and carry no
          other link. A change that breaks those is refused.
        </p>
        <textarea
          id={`body-${touch.touch}`}
          name="value"
          defaultValue={touch.body}
          aria-describedby={`body-${touch.touch}-hint`}
          style={{ minHeight: 200, fontFamily: "ui-monospace, monospace", fontSize: 13 }}
        />
        <div className="nav">
          <span />
          <button className="btn ghost" type="submit" disabled={saving}>
            Save the email
          </button>
        </div>
        <Message text={message} />
      </form>
    </div>
  );
}

export function SampleForm({
  slug,
  bands,
  pilotSize,
  seed,
  historyWindow,
}: {
  slug: string;
  bands: { key: string; label: string; target: number }[];
  pilotSize: number;
  seed: number;
  historyWindow: number;
}) {
  const [target, saveTarget, savingTarget] = useActionState(editTarget, null);
  const [sample, saveSample, savingSample] = useActionState(editSample, null);

  return (
    <>
      <div className="panel">
        <label className="field">Completed responses wanted, per band</label>
        {bands.map((b) => (
          <form action={saveTarget} key={b.key} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="key" value={b.key} />
            <input name="target" type="number" min={1} defaultValue={b.target} aria-label={`Target for ${b.label}`} />
            <span className="state" style={{ flex: 1 }}>
              {b.label}
            </span>
            <button className="chip" type="submit" disabled={savingTarget}>
              Save
            </button>
          </form>
        ))}
        <Message text={target} />
      </div>

      <div className="panel" style={{ marginTop: 12 }}>
        {(
          [
            ["pilot_size", "How many go out in the pilot", pilotSize],
            ["seed", "The number the draw is built from", seed],
            ["contact_history_window_days", "Days before someone can be asked again", historyWindow],
          ] as const
        ).map(([field, label, value]) => (
          <form action={saveSample} key={field} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="field" value={field} />
            <input name="value" type="number" min={0} defaultValue={value} aria-label={label} />
            <span className="state" style={{ flex: 1 }}>
              {label}
            </span>
            <button className="chip" type="submit" disabled={savingSample}>
              Save
            </button>
          </form>
        ))}
        <Message text={sample} />
      </div>
    </>
  );
}

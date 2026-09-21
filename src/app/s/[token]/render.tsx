import type { Question } from "@/core/study-schema";
import { UNKNOWN } from "@/core/flow";
import { Slider } from "./slider";

// One question per screen, server-rendered. The only client JavaScript is the slider's
// read-out; every screen works without it.

export function Progress({ done, total, label }: { done: number; total: number; label?: string }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <>
      <div
        className="progress"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="How far through the survey you are"
      >
        <i style={{ width: `${pct}%` }} />
      </div>
      {label ? <span className="step">{label}</span> : null}
    </>
  );
}

const asText = (v: string | number) => String(v);

export function QuestionBody({ q, value }: { q: Question; value: unknown }) {
  switch (q.type) {
    case "choice":
      return (
        <div className="opts">
          {q.options.map((o) => (
            <button
              key={asText(o.value)}
              className="opt"
              type="submit"
              name="value"
              value={asText(o.value)}
              aria-pressed={asText(o.value) === asText(value as string | number)}
            >
              {o.label}
            </button>
          ))}
        </div>
      );

    case "multi":
      return (
        <div className="opts">
          {q.options.map((o) => {
            const chosen =
              Array.isArray(value) && (value as (string | number)[]).map(asText).includes(asText(o.value));
            return (
              <label key={asText(o.value)} className="opt opt-check">
                <input type="checkbox" name="value" value={asText(o.value)} defaultChecked={chosen} />
                <span>{o.label}</span>
              </label>
            );
          })}
        </div>
      );

    case "number":
      return (
        <>
          <input
            type="number"
            inputMode="numeric"
            name="value"
            min={0}
            defaultValue={typeof value === "number" ? value : ""}
            aria-label={q.text}
          />
          {q.allow_unknown ? (
            <label className="check" style={{ marginTop: 14 }}>
              <input type="checkbox" name="unknown" value="1" defaultChecked={value === UNKNOWN} />
              <span>I don&rsquo;t know</span>
            </label>
          ) : null}
        </>
      );

    case "slider":
      return (
        <Slider
          min={q.min}
          max={q.max}
          step={q.step}
          unit={q.unit ?? ""}
          label={q.text}
          initial={typeof value === "number" ? value : (q.default ?? q.min)}
        />
      );

    case "scale": {
      const range: number[] = [];
      for (let n = q.min; n <= q.max; n += 1) range.push(n);
      return (
        <>
          <div className="scale" style={{ gridTemplateColumns: `repeat(${range.length}, 1fr)` }}>
            {range.map((n) => (
              <button key={n} className="opt" type="submit" name="value" value={n} aria-pressed={Number(value) === n}>
                {n}
              </button>
            ))}
          </div>
          <div className="ends">
            <span>{q.min_label}</span>
            <span>{q.max_label}</span>
          </div>
        </>
      );
    }

    case "short_text":
      return (
        <input type="text" name="value" defaultValue={typeof value === "string" ? value : ""} aria-label={q.text} />
      );

    case "open":
      return <textarea name="value" defaultValue={typeof value === "string" ? value : ""} aria-label={q.text} />;
  }
}

/** Choice and scale submit on click, so those screens need no Continue button. */
export function selfSubmitting(q: Question): boolean {
  return q.type === "choice" || q.type === "scale";
}

"use client";

import { useActionState } from "react";
import { matchRow, skipRow } from "../actions";

type Row = { id: string; raw: Record<string, string>; problem: string };

export function ReviewRow({ row, candidates }: { row: Row; candidates: { id: string; label: string }[] }) {
  const [message, action, working] = useActionState(matchRow, null);

  return (
    <div className="panel" style={{ marginTop: 12 }}>
      <b style={{ fontWeight: 500 }}>{row.raw.entity_name || "No government name"}</b>
      <p className="note" style={{ margin: "2px 0 10px" }}>
        {row.raw.email || "no email"} · {row.raw.state || "no state"} · {row.raw.title || "no title"}
        <br />
        <span className="state">{row.problem}</span>
      </p>

      <form action={action}>
        <input type="hidden" name="row_id" value={row.id} />

        {candidates.length === 0 ? (
          <p className="note" style={{ margin: "0 0 10px" }}>
            Nothing in the registry looks close. Skipping is the right answer unless you add this
            government to the registry first.
          </p>
        ) : (
          <>
            <label className="field" htmlFor={`entity-${row.id}`}>
              Match it to
            </label>
            <p className="hint field-hint" id={`entity-${row.id}-hint`}>
              Governments in the registry with a similar name in that state.
            </p>
            <select
              id={`entity-${row.id}`}
              name="entity_id"
              defaultValue=""
              aria-describedby={`entity-${row.id}-hint`}
            >
              <option value="">Choose a government</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </>
        )}

        {message ? (
          <p className="problem" role="status">
            {message}
          </p>
        ) : null}

        <div className="nav">
          <button className="btn ghost" type="submit" formAction={skipRow} formNoValidate>
            Skip this row
          </button>
          <button className="btn" type="submit" disabled={working || candidates.length === 0}>
            {working ? "Matching…" : "Match and add"}
          </button>
        </div>
      </form>
    </div>
  );
}

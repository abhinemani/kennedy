"use client";

import { useActionState } from "react";
import { reviewResponse } from "./actions";
import { FLAG_WORDS } from "./flags";

type Row = {
  responseId: string;
  entityName: string;
  state: string;
  role: string;
  bandLabel: string;
  completedAt: string | null;
  durationSeconds: number | null;
  qualityFlags: string[];
  reviewStatus: "pending" | "included" | "excluded";
  exclusionReason: string | null;
};

export function ReviewRow({ slug, row }: { slug: string; row: Row }) {
  const [message, action, working] = useActionState(reviewResponse, null);

  return (
    <div className="panel" style={{ marginTop: 12 }}>
      <b style={{ fontWeight: 500 }}>
        {row.entityName}, {row.state}
      </b>
      <p className="note" style={{ margin: "2px 0 8px" }}>
        {row.role.replace(/_/g, " ")} · {row.bandLabel}
        {row.durationSeconds ? ` · took ${Math.round(row.durationSeconds / 60)} min` : ""}
        {row.completedAt ? ` · ${new Date(row.completedAt).toLocaleDateString("en-US", { dateStyle: "medium" })}` : ""}
      </p>

      {row.qualityFlags.length > 0 ? (
        <ul className="problems" style={{ margin: "0 0 10px" }}>
          {row.qualityFlags.map((flag) => (
            <li key={flag}>{FLAG_WORDS[flag] ?? flag}</li>
          ))}
        </ul>
      ) : null}

      {row.reviewStatus === "excluded" ? (
        <p className="problem" style={{ margin: "0 0 10px" }}>
          Excluded: {row.exclusionReason ?? "no reason recorded"}
        </p>
      ) : null}

      <form action={action}>
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="response_id" value={row.responseId} />

        {row.reviewStatus !== "excluded" ? (
          <>
            <label className="field" htmlFor={`reason-${row.responseId}`}>
              Reason, if you exclude it
            </label>
            <p className="hint field-hint" id={`reason-${row.responseId}-hint`}>
              In your own words. This is printed in the methods note.
            </p>
            <input
              id={`reason-${row.responseId}`}
              name="reason"
              type="text"
              aria-describedby={`reason-${row.responseId}-hint`}
              placeholder="answered about the wrong government"
            />
          </>
        ) : null}

        {message ? (
          <p className="note" role="status">
            {message}
          </p>
        ) : null}

        <div className="nav">
          {row.reviewStatus === "excluded" ? (
            <button className="btn ghost" type="submit" name="decision" value="pending" disabled={working}>
              Put it back
            </button>
          ) : (
            <button className="btn ghost" type="submit" name="decision" value="excluded" disabled={working}>
              Exclude
            </button>
          )}
          <button
            className="btn"
            type="submit"
            name="decision"
            value="included"
            disabled={working || row.reviewStatus === "included"}
          >
            {row.reviewStatus === "included" ? "Kept" : "Keep it"}
          </button>
        </div>
      </form>
    </div>
  );
}

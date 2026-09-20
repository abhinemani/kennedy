"use client";

import Link from "next/link";
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

// The one response being judged. Keep, exclude with a reason, or put back.
export function ReviewRow({ slug, row, next }: { slug: string; row: Row; next: { href: string; name: string } | null }) {
  const [message, action, working] = useActionState(reviewResponse, null);

  return (
    <div className="panel">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <b style={{ fontWeight: 600, fontSize: 17 }}>
            {row.entityName}, {row.state}
          </b>
          <p className="note" style={{ margin: "2px 0 0" }}>
            {row.role.replace(/_/g, " ")} · {row.bandLabel}
            {row.durationSeconds ? ` · took ${Math.round(row.durationSeconds / 60)} min` : ""}
            {row.completedAt ? ` · ${new Date(row.completedAt).toLocaleDateString("en-US", { dateStyle: "medium" })}` : ""}
          </p>
        </div>
        <span className={`pill ${row.reviewStatus === "excluded" ? "warn" : row.reviewStatus === "included" ? "ok" : ""}`}>
          {row.reviewStatus === "excluded" ? "Excluded" : row.reviewStatus === "included" ? "Kept" : "Waiting"}
        </span>
      </div>

      {row.qualityFlags.length > 0 ? (
        <>
          <span className="label" style={{ marginTop: 16 }}>
            What was flagged
          </span>
          <ul className="problems" style={{ margin: "0 0 4px" }}>
            {row.qualityFlags.map((flag) => (
              <li key={flag}>{FLAG_WORDS[flag] ?? flag}</li>
            ))}
          </ul>
        </>
      ) : (
        <p className="note" style={{ margin: "14px 0 0" }}>
          Nothing was flagged on this one.
        </p>
      )}

      {row.reviewStatus === "excluded" ? (
        <p className="problem" style={{ margin: "14px 0 0" }}>
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
          <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {next ? (
              <Link className="btn ghost" href={next.href}>
                Next flagged
              </Link>
            ) : null}
            <button
              className="btn"
              type="submit"
              name="decision"
              value="included"
              disabled={working || row.reviewStatus === "included"}
            >
              {row.reviewStatus === "included" ? "Kept" : "Keep it"}
            </button>
          </span>
        </div>
      </form>
    </div>
  );
}

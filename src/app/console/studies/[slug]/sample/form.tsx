"use client";

import { useActionState } from "react";
import { drawSampleNow } from "../../actions";

export function DrawForm({
  slug,
  willDraw,
  pilotSize,
  seed,
  alreadyDrawn,
}: {
  slug: string;
  willDraw: number;
  pilotSize: number;
  seed: number;
  alreadyDrawn: number;
}) {
  const [message, action, working] = useActionState(drawSampleNow, null);

  return (
    <>
      <h2>Draw the sample</h2>
      <form action={action} className="panel">
        <input type="hidden" name="slug" value={slug} />
        <p className="note" style={{ margin: "0 0 12px" }}>
          This draws {willDraw.toLocaleString("en-US")} people, {pilotSize.toLocaleString("en-US")} of
          them marked as the pilot, using seed {seed}. The same seed always draws the same sample,
          so this can be re-run and explained in the methods note.
          {alreadyDrawn > 0
            ? " Anyone already in this study keeps the link they were given; only new people get one."
            : ""}
        </p>

        {message ? (
          <p className="problem" role="status">
            {message}
          </p>
        ) : null}

        <div className="nav">
          <span />
          <button className="btn" type="submit" disabled={working || willDraw === 0}>
            {working ? "Drawing…" : "Draw sample"}
          </button>
        </div>
      </form>
    </>
  );
}

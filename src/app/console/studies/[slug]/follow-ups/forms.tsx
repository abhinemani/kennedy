"use client";

import { useActionState } from "react";
import { pauseSending, queueTouch, resumeSending } from "./actions";

export function QueueForm({
  slug,
  touch,
  willSend,
  blocked,
  provider,
}: {
  slug: string;
  touch: number;
  willSend: number;
  blocked: boolean;
  provider: string;
}) {
  const [message, action, working] = useActionState(queueTouch, null);

  const label =
    provider === "dryrun"
      ? `Record ${willSend.toLocaleString("en-US")} as a dry run`
      : provider === "csv"
        ? `Make a merge file for ${willSend.toLocaleString("en-US")}`
        : `Queue ${willSend.toLocaleString("en-US")} emails`;

  return (
    <form action={action}>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="touch" value={touch} />
      <button className="btn" type="submit" disabled={working || blocked || willSend === 0}>
        {working ? "Working…" : label}
      </button>
      {message ? (
        <p className="note" role="status">
          {message}
        </p>
      ) : null}
    </form>
  );
}

export function PauseForm({ slug, paused, hot }: { slug: string; paused: boolean; hot: boolean }) {
  return (
    <form action={paused ? resumeSending : pauseSending} className="panel">
      <input type="hidden" name="slug" value={slug} />
      <span className="label">{paused ? "Paused" : "Sending"}</span>
      <p className="note" style={{ margin: "0 0 12px" }}>
        {paused
          ? hot
            ? "Sending is paused and the recent numbers are still above your thresholds. Resuming now sends anyway; fix the list first if you can."
            : "Sending is paused. Nothing will go out until you resume it."
          : "One switch stops every touch for this study. The circuit breaker uses the same one."}
      </p>
      <button className="btn ghost" type="submit">
        {paused ? "Resume sending" : "Pause sending"}
      </button>
    </form>
  );
}

"use client";

import { useEffect } from "react";

/** Everything else, including the console. The operator is told where to look. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("page failed", error);
  }, [error]);

  return (
    <div className="wrap">
      <h1>That page could not load</h1>
      <p className="sub">
        Something failed on the server. The most common cause by far is the database: check the
        first line of the setup checklist, which says what it is and where to fix it.
      </p>
      <div className="panel">
        <p className="note" style={{ margin: 0 }}>
          If you are signed in, open <a href="/console">the setup checklist</a>. If the database
          is unreachable it will say so there, in words, rather than failing like this.
        </p>
      </div>
      <div className="nav">
        <a className="btn ghost" href="/console">
          Setup checklist
        </a>
        <button className="btn" type="button" onClick={reset}>
          Try again
        </button>
      </div>
    </div>
  );
}

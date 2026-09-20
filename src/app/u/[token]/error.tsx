"use client";

import { useEffect } from "react";

/**
 * What a respondent sees when something breaks.
 *
 * They were invited by email, they clicked a link, and the least we owe them is a sentence in
 * plain words rather than a stack of framework chrome. Nothing about the failure is shown:
 * what went wrong is our problem, and it tells them nothing useful.
 */
export default function UnsubscribeError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("unsubscribe page failed", error);
  }, [error]);

  return (
    <div className="wrap">
      <div className="letter">
        <p className="q">Something went wrong at our end.</p>
        <p className="hint">
          You have not been unsubscribed yet. Try again in a minute, and if it still will not
          load, reply to the email with the word stop and we will take care of it.
        </p>
        <div className="nav">
          <span />
          <button className="btn" type="button" onClick={reset}>
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}

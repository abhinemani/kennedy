"use client";

import { useActionState } from "react";
import { cancelImport, confirmImport } from "../../actions";

/** Why there is nobody to add, in the words that fit this particular file. */
function nobodyNew(duplicates: number, needsReview: number): string {
  if (duplicates > 0 && needsReview > 0) {
    return "Everyone in this file is either already on file or could not be matched to a government, so there is nobody new to add. The unmatched rows are waiting in Needs review.";
  }
  if (duplicates > 0) {
    return "Everyone in this file is already on file, so there is nobody new to add. Discarding it changes nothing.";
  }
  if (needsReview > 0) {
    return "No row here matched a government, so there is nobody to add yet. Check the column matching, or load the registry first.";
  }
  return "Nothing here would be added. Check the column matching, or load the registry first.";
}

export function ConfirmForm({
  batch,
  ready,
  duplicates,
  needsReview,
}: {
  batch: string;
  ready: number;
  duplicates: number;
  needsReview: number;
}) {
  const [message, action, working] = useActionState(confirmImport, null);

  return (
    <>
      <h2>Save this as a list</h2>
      <form action={action} className="panel">
        <input type="hidden" name="batch" value={batch} />

        <label className="field" htmlFor="list_name">
          List name
        </label>
        <p className="hint field-hint" id="list_name-hint">
          What the audience screen will call it. &ldquo;Power Almanac clerks, September 2026&rdquo;
          is the sort of thing that is still clear in a year.
        </p>
        <input aria-describedby="list_name-hint" id="list_name" name="list_name" type="text" required />

        <label className="field" htmlFor="source">
          Where these came from
        </label>
        <p className="hint field-hint" id="source-hint">
          The supplier or the file, in your own words.
        </p>
        <input aria-describedby="source-hint" id="source" name="source" type="text" placeholder="power-almanac" />

        <label className="field" htmlFor="license_scope">
          What this list may be used for
        </label>
        <p className="hint field-hint" id="license_scope-hint">
          Lists never mix across scopes. A list licensed to you alone is never drawn into a
          client&rsquo;s study or shown to a sponsor.
        </p>
        <select aria-describedby="license_scope-hint" id="license_scope" name="license_scope" defaultValue="owner_only">
          <option value="owner_only">Our own studies only</option>
          <option value="client_ok">Our studies and client studies</option>
        </select>

        {message ? (
          <p className="problem" role="alert">
            {message}
          </p>
        ) : null}

        <div className="nav">
          <span />
          <button className="btn" type="submit" disabled={working || ready === 0}>
            {working ? "Importing…" : `Import ${ready.toLocaleString("en-US")} contacts`}
          </button>
        </div>
        {ready === 0 ? <p className="note">{nobodyNew(duplicates, needsReview)}</p> : null}
      </form>

      {/* Its own form: a staged file holds real names and emails, so discarding it must not
          depend on one button inside another form's action. */}
      <form action={cancelImport} className="panel" style={{ marginTop: 12 }}>
        <input type="hidden" name="batch" value={batch} />
        <p className="note" style={{ margin: "0 0 12px" }}>
          Discarding throws the uploaded rows away. Nothing has been added to your contacts yet.
        </p>
        <button className="btn ghost" type="submit">
          Discard this import
        </button>
      </form>
    </>
  );
}

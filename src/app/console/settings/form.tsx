"use client";

import { useActionState } from "react";
import { loadSample, removeSample, saveSettings, testTheModel } from "../actions";
import type { Settings } from "@/lib/settings";

export function TestModelButton() {
  const [message, action, working] = useActionState(testTheModel, null);
  return (
    <form action={action} style={{ marginTop: 10 }}>
      <button className="btn ghost" type="submit" disabled={working}>
        {working ? "Asking…" : "Test it"}
      </button>
      {message ? (
        <p className="note" role="status">
          {message}
        </p>
      ) : null}
    </form>
  );
}

export function SettingsForm({ current }: { current: Settings }) {
  const [message, action, pending] = useActionState(saveSettings, null);

  return (
    <form action={action} className="panel" style={{ marginTop: 16 }}>
      <label className="field" htmlFor="linkDomain">
        Survey link domain
      </label>
      <p className="hint field-hint" id="linkDomain-hint">
        What people will see in their email. Just the domain, no path. For example
          https://surveys.ethoslabs.us
      </p>
      <input aria-describedby="linkDomain-hint" id="linkDomain" name="linkDomain" type="text" defaultValue={current.linkDomain ?? ""} placeholder="https://surveys.ethoslabs.us" />

      <label className="field" htmlFor="postalAddress">
        Postal address
      </label>
      <p className="hint field-hint" id="postalAddress-hint">
        Carried in the footer of every email. Sending is blocked without it.
      </p>
      <input aria-describedby="postalAddress-hint" id="postalAddress" name="postalAddress" type="text" defaultValue={current.postalAddress ?? ""} />

      <label className="field" htmlFor="replyTo">
        Reply-to address
      </label>
      <p className="hint field-hint" id="replyTo-hint">
        Where a reply goes, and the contact shown on the privacy page.
      </p>
      <input aria-describedby="replyTo-hint" id="replyTo" name="replyTo" type="email" defaultValue={current.replyTo ?? ""} />

      <label className="field" htmlFor="sendProvider">
        Send provider
      </label>
      <p className="hint field-hint" id="sendProvider-hint">
        Dry run logs messages and sends nothing. It is the default on purpose.
      </p>
      <select aria-describedby="sendProvider-hint" id="sendProvider" name="sendProvider" defaultValue={current.sendProvider}>
        <option value="dryrun">Dry run — log only, send nothing</option>
        <option value="csv">CSV — download a merge-ready file</option>
      </select>

      <label className="field" htmlFor="perInboxDailyLimit">
        Messages per inbox per day
      </label>
      <input aria-describedby="perInboxDailyLimit-hint" id="perInboxDailyLimit" name="perInboxDailyLimit" type="number" min={0} defaultValue={current.perInboxDailyLimit} />

      <label className="field" htmlFor="contactHistoryWindowDays">
        Contact history window, in days
      </label>
      <p className="hint field-hint" id="perInboxDailyLimit-hint">
        Someone asked by another study inside this window is skipped.
      </p>
      <input id="contactHistoryWindowDays" name="contactHistoryWindowDays" type="number" min={0} defaultValue={current.contactHistoryWindowDays} />

      <label className="field" htmlFor="bounceRate">
        Pause sending above this bounce rate, in percent
      </label>
      <input id="bounceRate" name="bounceRate" type="number" min={0} step={0.1} defaultValue={current.bounceRate * 100} />

      <label className="field" htmlFor="complaintRate">
        Pause sending above this complaint rate, in percent
      </label>
      <input id="complaintRate" name="complaintRate" type="number" min={0} step={0.1} defaultValue={current.complaintRate * 100} />

      {message ? (
        <p className="problem" role="status">
          {message}
        </p>
      ) : null}

      <div className="nav">
        <span />
        <button className="btn" type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save settings"}
        </button>
      </div>
    </form>
  );
}

export function SampleDataPanel({ loaded, counts }: { loaded: boolean; counts: { governments: number; contacts: number; responses: number } }) {
  const [loadMessage, load, loading] = useActionState(loadSample, null);
  const [removeMessage, remove, removing] = useActionState(removeSample, null);
  const message = loadMessage ?? removeMessage;

  return (
    <div className="panel">
      <p className="note" style={{ margin: "0 0 12px" }}>
        {loaded
          ? `Sample data is loaded: ${counts.governments.toLocaleString("en-US")} fake governments, ${counts.contacts.toLocaleString("en-US")} fake contacts, and a study called "Sample study (fake data)" with ${counts.responses.toLocaleString("en-US")} responses. Every record is marked, and removing it deletes only those.`
          : "Fill every screen with obviously fake governments, people, a fielding study, responses, interviews and coded answers, so you can see the product before any real list is loaded. Nothing is emailed. Every record is marked as sample data and can be removed with one press."}
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {loaded ? (
          <form action={remove}>
            <button className="btn ghost" type="submit" disabled={removing}>
              {removing ? "Removing…" : "Remove sample data"}
            </button>
          </form>
        ) : (
          <form action={load}>
            <button className="btn" type="submit" disabled={loading}>
              {loading ? "Loading…" : "Load sample data"}
            </button>
          </form>
        )}
      </div>
      {message ? (
        <p className="note" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}

"use client";

import { useActionState } from "react";
import { saveSettings } from "../actions";
import type { Settings } from "@/lib/settings";

export function SettingsForm({ current }: { current: Settings }) {
  const [message, action, pending] = useActionState(saveSettings, null);

  return (
    <form action={action} className="panel" style={{ marginTop: 16 }}>
      <label className="field" htmlFor="linkDomain">
        Survey link domain
        <span className="hint">
          What people will see in their email. Just the domain, no path. For example
          https://surveys.ethoslabs.us
        </span>
      </label>
      <input id="linkDomain" name="linkDomain" type="text" defaultValue={current.linkDomain ?? ""} placeholder="https://surveys.ethoslabs.us" />

      <label className="field" htmlFor="postalAddress">
        Postal address
        <span className="hint">Carried in the footer of every email. Sending is blocked without it.</span>
      </label>
      <input id="postalAddress" name="postalAddress" type="text" defaultValue={current.postalAddress ?? ""} />

      <label className="field" htmlFor="replyTo">
        Reply-to address
        <span className="hint">Where a reply goes, and the contact shown on the privacy page.</span>
      </label>
      <input id="replyTo" name="replyTo" type="email" defaultValue={current.replyTo ?? ""} />

      <label className="field" htmlFor="sendProvider">
        Send provider
        <span className="hint">Dry run logs messages and sends nothing. It is the default on purpose.</span>
      </label>
      <select id="sendProvider" name="sendProvider" defaultValue={current.sendProvider}>
        <option value="dryrun">Dry run — log only, send nothing</option>
        <option value="csv">CSV — download a merge-ready file</option>
      </select>

      <label className="field" htmlFor="perInboxDailyLimit">
        Messages per inbox per day
      </label>
      <input id="perInboxDailyLimit" name="perInboxDailyLimit" type="number" min={0} defaultValue={current.perInboxDailyLimit} />

      <label className="field" htmlFor="contactHistoryWindowDays">
        Contact history window, in days
        <span className="hint">Someone asked by another study inside this window is skipped.</span>
      </label>
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

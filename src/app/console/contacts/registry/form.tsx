"use client";

import { useActionState } from "react";
import { uploadRegistry } from "../actions";

export function RegistryForm() {
  const [message, action, working] = useActionState(uploadRegistry, null);

  return (
    <form action={action} className="panel">
      <p className="note" style={{ margin: "0 0 12px" }}>
        Upload the Census Bureau&rsquo;s government units file exactly as it comes out of the
        Individual Unit File zip — <code>Fin_PID_2022.txt</code> — and it is read as published,
        with no converting first. A CSV with the columns below works too.
      </p>

      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>Column</th>
              <th style={{ textAlign: "left" }}>What it holds</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>name</td><td style={{ textAlign: "left" }}>Needed. &ldquo;City of Ann Arbor&rdquo;</td></tr>
            <tr><td>state</td><td style={{ textAlign: "left" }}>Needed. Two letters</td></tr>
            <tr><td>type</td><td style={{ textAlign: "left" }}>Needed. city, county, township, school district, special district</td></tr>
            <tr><td>population</td><td style={{ textAlign: "left" }}>Needed for sampling: the size bands are built from it</td></tr>
            <tr><td>geoid</td><td style={{ textAlign: "left" }}>Optional, and the safest way to match again later</td></tr>
            <tr><td>annual_budget</td><td style={{ textAlign: "left" }}>Optional</td></tr>
            <tr><td>email_domain</td><td style={{ textAlign: "left" }}>Optional. Used to check a work email at the end</td></tr>
          </tbody>
        </table>
      </div>

      <label className="field" htmlFor="registry-file">
        The file
      </label>
      <p className="hint field-hint" id="registry-file-hint">
        Uploading again updates governments already here rather than doubling them.
      </p>
      <input aria-describedby="registry-file-hint" id="registry-file" type="file" name="file" accept=".csv,.txt,text/csv,text/plain" required />

      {message ? (
        <p className="problem" role="status">
          {message}
        </p>
      ) : null}

      <div className="nav">
        <span />
        <button className="btn" type="submit" disabled={working}>
          {working ? "Reading the file…" : "Upload registry"}
        </button>
      </div>
    </form>
  );
}

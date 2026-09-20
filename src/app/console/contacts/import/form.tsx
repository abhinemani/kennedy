"use client";

import { useActionState, useState } from "react";
import { stageContacts } from "../actions";
import { Field, describedBy } from "@/app/field";
import { ROLES } from "@/core/lists";

const ROLE_CHOICES = ROLES;

// The fields we can fill from their file. Nothing here is guessed from a column name: the
// operator points each one at a column, because a wrong guess imports the wrong thing quietly.
const FIELDS: { key: string; label: string; hint: string; required?: boolean }[] = [
  { key: "email", label: "Email address", hint: "Needed. This is how a contact is identified.", required: true },
  { key: "first_name", label: "First name", hint: "Suppliers usually split the name in two." },
  { key: "last_name", label: "Last name", hint: "Joined with the first name if there is no full name column." },
  { key: "full_name", label: "Full name", hint: "Only if their file has one column for the whole name." },
  { key: "title", label: "Job title", hint: "Optional, but useful: titles vary wildly." },
  { key: "role", label: "Role", hint: "Their own label is fine. Leave it if you set one role for the whole file below." },
  { key: "entity_name", label: "Government name", hint: "What their file calls the city or county." },
  { key: "state", label: "State", hint: "Two letters, or the full name." },
  { key: "entity_type", label: "Government type", hint: "city, county, township, and so on." },
  { key: "county", label: "County the government is in", hint: "Over a thousand township names repeat inside one state; this is what tells them apart." },
  { key: "geoid", label: "Census identifier", hint: "Optional, and the most reliable match there is." },
  { key: "phone", label: "Phone", hint: "Optional." },
];

type Profile = { name: string; columns: Record<string, string> };

export function ImportForm({ savedProfiles }: { savedProfiles: Profile[] }) {
  const [message, action, working] = useActionState(stageContacts, null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [fileName, setFileName] = useState<string | null>(null);

  // Read only the first line in the browser, to offer the real column names to click.
  async function onFile(file: File | null) {
    if (!file) {
      setHeaders([]);
      setFileName(null);
      return;
    }
    setFileName(file.name);
    const head = await file.slice(0, 64 * 1024).text();
    const firstLine = head.split(/\r?\n/)[0] ?? "";
    const columns = splitHeader(firstLine);
    setHeaders(columns);

    // Offer a saved profile that fits this file, rather than making them redo the clicking.
    const fitting = savedProfiles.find((p) =>
      Object.values(p.columns).every((c) => !c || columns.includes(c)),
    );
    if (fitting) setMapping(fitting.columns);
  }

  return (
    <form action={action} className="panel" style={{ marginTop: 16 }}>
      <Field id="contacts-file" label="The file" hint="A CSV export. Nothing is saved until you look at the preview.">
        <input
          id="contacts-file"
          type="file"
          name="file"
          accept=".csv,text/csv"
          required
          {...describedBy("contacts-file", "hint")}
          onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
        />
      </Field>

      {savedProfiles.length > 0 ? (
        <>
          <Field
            id="profile-pick"
            label="Use a saved mapping"
            hint="The column choices you made last time for this kind of file."
          >
          <select
            id="profile-pick"
            defaultValue=""
            {...describedBy("profile-pick", "hint")}
            onChange={(e) => {
              const found = savedProfiles.find((p) => p.name === e.target.value);
              if (found) setMapping(found.columns);
            }}
          >
            <option value="">Choose each column myself</option>
            {savedProfiles.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
          </Field>
        </>
      ) : null}

      {headers.length === 0 ? (
        <p className="note">Choose a file and its columns will appear here to match up.</p>
      ) : (
        <>
          <h2 style={{ fontSize: 17 }}>Which column is which</h2>
          <p className="note" style={{ marginTop: 0 }}>
            {fileName} has {headers.length} columns.
          </p>

          {FIELDS.map((f) => (
            <div key={f.key}>
              <Field id={`map_${f.key}`} label={f.label} hint={f.hint}>
              <select
                id={`map_${f.key}`}
                name={`map_${f.key}`}
                value={mapping[f.key] ?? ""}
                {...describedBy(`map_${f.key}`, f.hint)}
                onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value }))}
              >
                <option value="">{f.required ? "Pick a column" : "Not in this file"}</option>
                {headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
              </Field>
            </div>
          ))}

          <Field
            id="file_role"
            label="One role for everyone in this file"
            hint="Suppliers ship one file per list, so this is usually simpler and more reliable than mapping their role column."
          >
            <select id="file_role" name="file_role" defaultValue="" {...describedBy("file_role", "hint")}>
              <option value="">Work it out from the role column</option>
              {ROLE_CHOICES.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </select>
          </Field>

          <Field
            id="profile_name"
            label="Save these choices as"
            hint="Optional. Name it after the source, like power-almanac, and the next file from them fills itself in."
          >
            <input
              id="profile_name"
              name="profile_name"
              type="text"
              placeholder="power-almanac"
              {...describedBy("profile_name", "hint")}
            />
          </Field>
        </>
      )}

      {message ? (
        <p className="problem" role="alert">
          {message}
        </p>
      ) : null}

      <div className="nav">
        <span />
        <button className="btn" type="submit" disabled={working || headers.length === 0}>
          {working ? "Reading the file…" : "Preview this import"}
        </button>
      </div>
    </form>
  );
}

/** Enough CSV to read a header row: quoted names with commas in them still work. */
function splitHeader(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i]!;
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"' && field === "") {
      quoted = true;
    } else if (c === ",") {
      out.push(field.trim());
      field = "";
    } else {
      field += c;
    }
  }
  out.push(field.trim().replace(/^﻿/, ""));
  return out.filter((h) => h !== "");
}

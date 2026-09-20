// A small, strict CSV reader. Imports are the moment a study's frame is decided, so a
// quietly mangled row is worse than a refused file: quoted commas, quoted newlines, escaped
// quotes and a BOM all have to survive exactly.

export type Row = Record<string, string>;

export type ParsedCsv = {
  headers: string[];
  rows: Row[];
  /** Rows whose column count did not match the header, kept with why. */
  malformed: { line: number; reason: string }[];
};

function splitRecords(text: string): string[][] {
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let quoted = false;
  let i = 0;

  // A byte order mark from a spreadsheet export would otherwise become part of column one.
  if (text.charCodeAt(0) === 0xfeff) i = 1;

  for (; i < text.length; i += 1) {
    const c = text[i]!;

    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"' && field === "") {
      quoted = true;
    } else if (c === ",") {
      record.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i += 1;
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else {
      field += c;
    }
  }

  if (field !== "" || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  return records;
}

export function parseCsv(text: string): ParsedCsv {
  const records = splitRecords(text).filter((r) => !(r.length === 1 && r[0]!.trim() === ""));
  const headerRecord = records[0];
  if (!headerRecord) return { headers: [], rows: [], malformed: [] };

  const headers = headerRecord.map((h) => h.trim());
  const rows: Row[] = [];
  const malformed: { line: number; reason: string }[] = [];

  records.slice(1).forEach((record, index) => {
    const line = index + 2; // header is line 1
    if (record.length !== headers.length) {
      malformed.push({
        line,
        reason: `Expected ${headers.length} columns but found ${record.length}.`,
      });
      return;
    }
    const row: Row = {};
    headers.forEach((h, i) => {
      row[h] = (record[i] ?? "").trim();
    });
    rows.push(row);
  });

  return { headers, rows, malformed };
}

/**
 * A saved column-mapping profile: which column in their file feeds which field of ours.
 * Built by clicking in the console, never guessed, because a wrong guess silently imports
 * the wrong thing.
 */
export type Mapping = Record<string, string>;

export function applyMapping(row: Row, mapping: Mapping): Row {
  const out: Row = {};
  for (const [field, column] of Object.entries(mapping)) {
    if (!column) continue;
    out[field] = row[column] ?? "";
  }
  return out;
}

/** Columns a mapping names that the uploaded file does not actually have. */
export function missingColumns(headers: string[], mapping: Mapping): string[] {
  const have = new Set(headers);
  return Object.values(mapping).filter((c) => c && !have.has(c));
}

export function toCsv(headers: string[], rows: Row[]): string {
  const cell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v);
  return [headers.join(","), ...rows.map((r) => headers.map((h) => cell(r[h] ?? "")).join(","))].join("\n");
}

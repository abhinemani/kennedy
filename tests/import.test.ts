import { describe, expect, it } from "vitest";
import { applyMapping, missingColumns, parseCsv, toCsv } from "../src/core/csv";
import { looksLikeEmail, normalizeEmail, normalizeName, normalizeState, normalizeType, resolveEntity, type RegistryEntity } from "../src/core/resolve";

describe("reading a CSV a spreadsheet produced", () => {
  it("reads a plain file", () => {
    const { headers, rows } = parseCsv("name,state\nAnn Arbor,MI\nYpsilanti,MI");
    expect(headers).toEqual(["name", "state"]);
    expect(rows).toEqual([
      { name: "Ann Arbor", state: "MI" },
      { name: "Ypsilanti", state: "MI" },
    ]);
  });

  it("keeps a comma inside quotes, which is where naive splitting loses a government", () => {
    const { rows } = parseCsv('name,note\n"Springfield, the one in Illinois",fine');
    expect(rows[0]?.name).toBe("Springfield, the one in Illinois");
  });

  it("keeps a newline and an escaped quote inside a quoted field", () => {
    const { rows } = parseCsv('name,note\n"Ann Arbor","he said ""no"" twice\nthen left"');
    expect(rows[0]?.note).toBe('he said "no" twice\nthen left');
  });

  it("survives a byte order mark and carriage returns", () => {
    const { headers, rows } = parseCsv("﻿name,state\r\nAnn Arbor,MI\r\n");
    expect(headers[0]).toBe("name");
    expect(rows).toHaveLength(1);
  });

  it("sets a short row aside with its line number instead of importing nonsense", () => {
    const { rows, malformed } = parseCsv("name,state,email\nAnn Arbor,MI,a@b.gov\nYpsilanti,MI");
    expect(rows).toHaveLength(1);
    expect(malformed[0]?.line).toBe(3);
    expect(malformed[0]?.reason).toContain("3 columns");
  });

  it("ignores blank lines at the end of a file", () => {
    expect(parseCsv("name\nAnn Arbor\n\n\n").rows).toHaveLength(1);
  });

  it("returns nothing for an empty file rather than throwing", () => {
    expect(parseCsv("")).toEqual({ headers: [], rows: [], malformed: [] });
  });

  it("round-trips through writing", () => {
    const rows = [{ name: 'Springfield, "the" one', state: "IL" }];
    expect(parseCsv(toCsv(["name", "state"], rows)).rows).toEqual(rows);
  });
});

describe("column mapping", () => {
  const mapping = { entityName: "Agency", email: "Email Address", state: "ST" };

  it("pulls our fields out of their columns", () => {
    const row = { Agency: "Ann Arbor", "Email Address": "clerk@a2gov.org", ST: "MI", Extra: "ignored" };
    expect(applyMapping(row, mapping)).toEqual({
      entityName: "Ann Arbor",
      email: "clerk@a2gov.org",
      state: "MI",
    });
  });

  it("names a column the file does not have, rather than importing blanks", () => {
    expect(missingColumns(["Agency", "ST"], mapping)).toEqual(["Email Address"]);
    expect(missingColumns(["Agency", "ST", "Email Address"], mapping)).toEqual([]);
  });
});

describe("matching a row to a government", () => {
  const registry: RegistryEntity[] = [
    { id: "1", name: "City of Ann Arbor", state: "MI", type: "city", population: 123_000 },
    { id: "2", name: "Ann Arbor Township", state: "MI", type: "township", population: 4_500 },
    { id: "3", name: "Washtenaw County", state: "MI", type: "county", population: 372_000 },
    { id: "4", name: "Springfield", state: "IL", type: "city", population: 114_000 },
    { id: "5", name: "Springfield", state: "MA", type: "city", population: 155_000 },
  ];

  it("reduces the many ways a place writes its own name", () => {
    expect(normalizeName("City of Ann Arbor")).toBe("ann arbor");
    expect(normalizeName("Ann Arbor City")).toBe("ann arbor");
    expect(normalizeName("  ANN-ARBOR  ")).toBe("ann arbor");
    expect(normalizeName("St. Mary's Township")).toBe("st marys");
  });

  it("matches on state, type and name", () => {
    const r = resolveEntity({ entityName: "City of Ann Arbor", state: "mi", type: "city" }, registry);
    expect(r.kind).toBe("matched");
    if (r.kind === "matched") expect(r.entity.id).toBe("1");
  });

  it("tells a city from the township next to it", () => {
    const r = resolveEntity({ entityName: "Ann Arbor", state: "MI", type: "township" }, registry);
    if (r.kind !== "matched") throw new Error("should match");
    expect(r.entity.id).toBe("2");
  });

  it("does not let one state's Springfield answer for another's", () => {
    const r = resolveEntity({ entityName: "Springfield", state: "MA", type: "city" }, registry);
    if (r.kind !== "matched") throw new Error("should match");
    expect(r.entity.id).toBe("5");
  });

  it("asks rather than guessing when two governments fit", () => {
    const twins: RegistryEntity[] = [
      { id: "a", name: "Franklin", state: "OH", type: "city", population: 11_000 },
      { id: "b", name: "Franklin", state: "OH", type: "city", population: 2_000 },
    ];
    const r = resolveEntity({ entityName: "Franklin", state: "OH", type: "city" }, twins);
    expect(r.kind).toBe("ambiguous");
    if (r.kind === "ambiguous") expect(r.candidates).toHaveLength(2);
  });

  it("still matches when their file calls a city a town", () => {
    const r = resolveEntity({ entityName: "Springfield", state: "IL", type: "town" }, registry);
    expect(r.kind).toBe("matched");
  });

  it("matches on name alone when the type is wrong rather than losing the row", () => {
    const r = resolveEntity({ entityName: "Washtenaw County", state: "MI", type: "city" }, registry);
    if (r.kind !== "matched") throw new Error("should match");
    expect(r.entity.id).toBe("3");
  });

  it("says plainly why a row did not resolve", () => {
    const r = resolveEntity({ entityName: "Nowhere", state: "MI", type: "city" }, registry);
    expect(r.kind).toBe("unresolved");
    if (r.kind === "unresolved") expect(r.reason).toContain("Nowhere");
  });

  it("refuses a row with no state or no name", () => {
    expect(resolveEntity({ entityName: "Ann Arbor", state: "", type: "city" }, registry).kind).toBe("unresolved");
    expect(resolveEntity({ entityName: "  ", state: "MI", type: "city" }, registry).kind).toBe("unresolved");
  });

  it("knows the government types a file might use", () => {
    expect(normalizeType("Charter Township")).toBe("township");
    expect(normalizeType("Parish")).toBe("county");
    expect(normalizeType("Village")).toBe("city");
    expect(normalizeType("something else")).toBeNull();
    expect(normalizeState("michigan")).toBe("MI".slice(0, 2));
  });
});

describe("emails", () => {
  it("dedupes case-insensitively, because that is one person", () => {
    expect(normalizeEmail("  Clerk@A2GOV.org ")).toBe("clerk@a2gov.org");
  });

  it("recognises an address, and refuses what is not one", () => {
    expect(looksLikeEmail("clerk@a2gov.org")).toBe(true);
    expect(looksLikeEmail("clerk@localhost")).toBe(false);
    expect(looksLikeEmail("not an email")).toBe(false);
    expect(looksLikeEmail("")).toBe(false);
  });
});

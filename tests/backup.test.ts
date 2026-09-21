import { describe, expect, it } from "vitest";
import { backupFilename, backupZip, tableToCsv } from "../src/core/backup";

describe("full backup", () => {
  it("writes a table as CSV with every column seen, quoting what needs it", () => {
    const csv = tableToCsv([
      { id: 1, name: "City of Fairview", note: null },
      { id: 2, name: 'Town, "the small one"', extra: { a: 1 }, when: new Date("2026-09-20T00:00:00Z") },
    ]);
    const lines = csv.trimEnd().split("\r\n");
    expect(lines[0]).toBe("id,name,note,extra,when");
    expect(lines[1]).toBe("1,City of Fairview,,,");
    expect(lines[2]).toBe('2,"Town, ""the small one""",,"{""a"":1}",2026-09-20T00:00:00.000Z');
  });

  it("zips one CSV per table plus a note, as a real zip", () => {
    const zip = backupZip([{ name: "contacts", rows: [{ id: 1 }] }, { name: "studies", rows: [] }], new Date("2026-09-20T12:00:00Z"));
    const text = new TextDecoder("latin1").decode(zip);
    expect(zip[0]).toBe(0x50); // "PK"
    expect(zip[1]).toBe(0x4b);
    expect(text).toContain("README.txt");
    expect(text).toContain("contacts.csv");
    expect(text).toContain("studies.csv");
    expect(text).toContain("contacts.csv: 1 rows");
  });

  it("names the file by the moment it was taken", () => {
    expect(backupFilename(new Date("2026-09-20T12:34:56Z"))).toBe("kennedy-backup-2026-09-20-12-34-56.zip");
  });
});

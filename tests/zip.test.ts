import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { crc32, makeZip } from "../src/core/zip";

/**
 * The backup is what rescues the data when the host cannot, so these check the file with a
 * reader that is not this code: Python's zipfile, which implements the format properly and,
 * unlike Info-ZIP's unzip, does not treat a zero-entry archive as an error.
 */
function unzipped(bytes: Uint8Array): Record<string, string> {
  const dir = mkdtempSync(path.join(tmpdir(), "kennedy-zip-"));
  const archive = path.join(dir, "backup.zip");
  writeFileSync(archive, bytes);

  const read = `
import json, sys, zipfile
with zipfile.ZipFile(sys.argv[1]) as z:
    bad = z.testzip()
    if bad is not None:
        raise SystemExit(f"checksum failed for {bad}")
    print(json.dumps({n: z.read(n).decode("utf-8") for n in z.namelist()}))
`;
  return JSON.parse(execFileSync("python3", ["-c", read, archive], { encoding: "utf8" })) as Record<string, string>;
}

describe("the backup archive", () => {
  it("is a zip the system can open", () => {
    const zip = makeZip([
      { name: "answers.csv", body: "a,b\n1,2\n" },
      { name: "contacts.csv", body: "email\nclerk@example.org\n" },
    ]);
    expect(unzipped(zip)).toEqual({
      "answers.csv": "a,b\n1,2\n",
      "contacts.csv": "email\nclerk@example.org\n",
    });
  });

  it("keeps a file with commas, quotes and newlines inside it exactly", () => {
    const body = 'response_id,text\r\n"r1","he said ""no"", then\nleft"\r\n';
    expect(unzipped(makeZip([{ name: "free-text.csv", body }]))["free-text.csv"]).toBe(body);
  });

  it("keeps non-English characters", () => {
    const body = "name\nVille de Montréal\nCondado de Doña Ana\n";
    expect(unzipped(makeZip([{ name: "registry.csv", body }]))["registry.csv"]).toBe(body);
  });

  it("handles a large file without corrupting it", () => {
    const body = `n\n${Array.from({ length: 20_000 }, (_, i) => i).join("\n")}\n`;
    expect(unzipped(makeZip([{ name: "big.csv", body }]))["big.csv"]).toBe(body);
  });

  it("writes an empty file rather than skipping it", () => {
    expect(unzipped(makeZip([{ name: "nothing.csv", body: "" }]))).toEqual({ "nothing.csv": "" });
  });

  it("makes a valid, if empty, archive from nothing", () => {
    expect(unzipped(makeZip([]))).toEqual({});
  });

  it("computes the checksum the format expects", () => {
    // The standard check value for "123456789".
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });
});

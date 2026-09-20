import { describe, expect, it } from "vitest";
import { describeCensusParse, looksLikeCensusFile, parseCensusUnits, tidyName } from "../src/core/census";
import { decodeUpload, describeEncoding } from "../src/core/encoding";

/** Real public rows from the 2022 Individual Unit File, which is a list of governments. */
const REAL = [
  "011001100001AUTAUGA COUNTY                                                  Autauga                            99001    5614522             093022",
  "062001133033LOS ANGELES CITY                                                Los Angeles                        44000  397021922             063022",
  "015001100001PRATTVILLE CITY                                                 Autauga                            62328    3775722             093022",
  "014001100001PRATTVILLE HOUSING AUTHORITY                                    Autauga                                                          093022",
].join("\n");

const pad = (s: string, n: number) => s.padEnd(n, " ");

/** A record built to order, so a test can say exactly what it is testing. */
function record({
  state = "01",
  type = "2",
  rest = "001100001",
  name = "SOMEWHERE CITY",
  county = "Somewhere",
  population = "  12345",
  year = "22",
} = {}) {
  return (
    `${state}${type}${rest}` +
    pad(name, 64) +
    pad(county, 33) +
    "  " +
    pad("99001", 5) +
    " " +
    pad(population, 8) +
    year +
    pad("", 19)
  );
}

describe("recognising the file", () => {
  it("knows the Census unit file when it sees one", () => {
    expect(looksLikeCensusFile(REAL)).toBe(true);
  });

  it("does not mistake a CSV for one", () => {
    expect(looksLikeCensusFile("name,state,type,population\nAnn Arbor,MI,city,123000")).toBe(false);
  });

  it("does not mistake an empty file for one", () => {
    expect(looksLikeCensusFile("")).toBe(false);
    expect(looksLikeCensusFile("\n\n")).toBe(false);
  });
});

describe("reading the government units file", () => {
  it("reads the real rows", () => {
    const { governments, skipped } = parseCensusUnits(REAL);
    expect(skipped).toEqual([]);
    expect(governments).toHaveLength(4);

    const autauga = governments[0]!;
    expect(autauga).toMatchObject({ name: "Autauga County", state: "AL", type: "county", population: 56145 });
    expect(autauga.geoid).toBe("011001100001");
    expect(autauga.populationYear).toBe(2022);
  });

  it("gets a big city right, which is the easiest thing to check by hand", () => {
    const la = parseCensusUnits(REAL).governments.find((g) => g.name.startsWith("Los Angeles"));
    expect(la).toMatchObject({ state: "CA", type: "city", population: 3_970_219 });
  });

  it("gives a special district no population rather than a wrong one", () => {
    const authority = parseCensusUnits(REAL).governments.find((g) => g.type === "special_district");
    expect(authority?.population).toBeNull();
    expect(authority?.name).toBe("Prattville Housing Authority");
  });

  it("reads every type code the file uses", () => {
    const types = ["0", "1", "2", "3", "4", "5"].map((code) =>
      parseCensusUnits(record({ type: code })).governments[0]?.type,
    );
    expect(types).toEqual([
      "state_agency", "county", "city", "township", "special_district", "school_district",
    ]);
  });

  it("turns the state FIPS code into a state", () => {
    expect(parseCensusUnits(record({ state: "26" })).governments[0]?.state).toBe("MI");
    expect(parseCensusUnits(record({ state: "48" })).governments[0]?.state).toBe("TX");
  });

  it("sets aside a row it cannot read, with its line number and why", () => {
    const text = [record(), "not a government record at all", record({ state: "99" })].join("\n");
    const { governments, skipped } = parseCensusUnits(text);
    expect(governments).toHaveLength(1);
    expect(skipped[0]?.line).toBe(2);
    expect(skipped[1]?.reason).toContain("FIPS state code 99");
  });

  it("says a nameless government is nameless, not that the line is short", () => {
    // The real file has one of these: a full-length record with an identifier and nothing else.
    const nameless = "124097248405" + " ".repeat(134);
    const { governments, skipped } = parseCensusUnits(nameless);
    expect(governments).toHaveLength(0);
    expect(skipped[0]?.reason).toContain("has no name");
    expect(skipped[0]?.reason).toContain("124097248405");
  });

  it("ignores blank lines rather than counting them as failures", () => {
    expect(parseCensusUnits(`${record()}\n\n\n${record()}\n`).skipped).toEqual([]);
  });
});

describe("names a clerk would recognise", () => {
  it("turns shouting into a name", () => {
    expect(tidyName("AUTAUGA COUNTY")).toBe("Autauga County");
    expect(tidyName("CITY OF ANN ARBOR")).toBe("City of Ann Arbor");
  });

  it("keeps Mc and O' names, and hyphenated ones", () => {
    expect(tidyName("MCHENRY COUNTY")).toBe("McHenry County");
    expect(tidyName("O'FALLON CITY")).toBe("O'Fallon City");
    expect(tidyName("WILKES-BARRE CITY")).toBe("Wilkes-Barre City");
  });

  it("collapses the padding the file is full of", () => {
    expect(tidyName("   SOMEWHERE    CITY   ")).toBe("Somewhere City");
  });
});

describe("what the operator is told", () => {
  it("counts by type and says which have no population", () => {
    const said = describeCensusParse(parseCensusUnits(REAL));
    expect(said).toContain("4 governments");
    expect(said).toContain("carry a population");
    expect(said).toContain("cannot be sampled by size");
  });
});

describe("files that are not UTF-8", () => {
  const latin1 = (s: string) => Uint8Array.from([...s].map((c) => c.charCodeAt(0)));

  it("reads UTF-8 as UTF-8", () => {
    const bytes = new TextEncoder().encode("name\nVille de Montréal\n");
    expect(decodeUpload(bytes)).toEqual({ text: "name\nVille de Montréal\n", encoding: "utf-8" });
  });

  it("reads Windows-1252 rather than mangling the name", () => {
    // "Ureña" as a supplier's export actually wrote it.
    const decoded = decodeUpload(latin1("Erik,Ureña"));
    expect(decoded.encoding).toBe("windows-1252");
    expect(decoded.text).toBe("Erik,Ureña");
    expect(decoded.text).not.toContain("�");
  });

  it("says so when it had to fall back, and stays quiet when it did not", () => {
    expect(describeEncoding("windows-1252")).toContain("Windows-1252");
    expect(describeEncoding("utf-8")).toBeNull();
  });

  it("never fails, whatever the bytes are", () => {
    expect(() => decodeUpload(Uint8Array.from([0xff, 0xfe, 0x00, 0x81]))).not.toThrow();
  });
});

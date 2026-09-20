// Reading the Census Bureau's government units file.
//
// The registry is the backbone, and the Census publishes it as a fixed-width text file inside
// the Individual Unit File zip, not as a CSV. Asking the operator to convert it first would be
// exactly the command-line work rule 10 forbids, so this reads what the Census actually ships.
//
// Record layout, from the 2022 technical documentation and checked against the data:
//   1-2    FIPS state code
//   3      type code (0 state, 1 county, 2 municipality, 3 township, 4 special district,
//          5 school district)
//   4-6    FIPS county
//   7-12   unit identifier
//   13-76  name of government
//   77-109 county it sits in
//   112-116 FIPS place code
//   118-125 population
//   126-127 the year that population is from

export type CensusGovernment = {
  geoid: string;
  name: string;
  state: string;
  type: "state_agency" | "county" | "city" | "township" | "special_district" | "school_district";
  population: number | null;
  county: string | null;
  populationYear: number | null;
};

export const RECORD_LENGTH = 146;

const TYPE_BY_CODE: Record<string, CensusGovernment["type"]> = {
  "0": "state_agency",
  "1": "county",
  "2": "city",
  "3": "township",
  "4": "special_district",
  "5": "school_district",
};

/** FIPS state codes to postal abbreviations. Stable, and the file carries only the number. */
export const STATE_BY_FIPS: Record<string, string> = {
  "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA", "08": "CO", "09": "CT",
  "10": "DE", "11": "DC", "12": "FL", "13": "GA", "15": "HI", "16": "ID", "17": "IL",
  "18": "IN", "19": "IA", "20": "KS", "21": "KY", "22": "LA", "23": "ME", "24": "MD",
  "25": "MA", "26": "MI", "27": "MN", "28": "MS", "29": "MO", "30": "MT", "31": "NE",
  "32": "NV", "33": "NH", "34": "NJ", "35": "NM", "36": "NY", "37": "NC", "38": "ND",
  "39": "OH", "40": "OK", "41": "OR", "42": "PA", "44": "RI", "45": "SC", "46": "SD",
  "47": "TN", "48": "TX", "49": "UT", "50": "VT", "51": "VA", "53": "WA", "54": "WV",
  "55": "WI", "56": "WY", "60": "AS", "66": "GU", "69": "MP", "72": "PR", "78": "VI",
};

/**
 * The Census writes names in capitals with the kind of government on the end: "PRATTVILLE
 * CITY", "AUTAUGA COUNTY". Those read badly in an email to a person, so they are turned into
 * the form a clerk would recognise. The suffix is kept only where dropping it would lose the
 * difference between, say, a city and the township beside it — the type column carries that.
 */
export function tidyName(raw: string): string {
  const cleaned = raw.trim().replace(/\s+/g, " ");
  if (!cleaned) return "";

  return cleaned
    .toLowerCase()
    .split(" ")
    .map((word) => {
      if (word.length <= 2 && /^(of|in|at|on|de|la|el)$/.test(word)) return word;
      // Mc and O' names, and hyphenated ones, capitalise on both sides.
      return word
        .split("-")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join("-")
        .replace(/^(Mc|O')(.)/, (_, prefix: string, letter: string) => prefix + letter.toUpperCase());
    })
    .join(" ");
}

export type CensusParse = {
  governments: CensusGovernment[];
  skipped: { line: number; reason: string }[];
};

export function looksLikeCensusFile(text: string): boolean {
  const first = text.split(/\r?\n/).find((l) => l.trim().length > 0);
  if (!first) return false;
  // Twelve digits of identifier, then a name. A CSV would have a comma long before here.
  return first.length >= 100 && /^\d{12}\S?\s*[A-Z]/.test(first) && !first.includes(",");
}

export function parseCensusUnits(text: string): CensusParse {
  const governments: CensusGovernment[] = [];
  const skipped: { line: number; reason: string }[] = [];

  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.replace(/\s+$/, "");
    if (line.trim().length === 0) return;

    const at = index + 1;
    // The length check comes after the identifier, because a record that is all identifier
    // and blanks is a nameless government, not a truncated line, and saying so sends the
    // operator to the right place.
    const id = line.slice(0, 12);
    if (!/^\d{12}$/.test(id)) {
      skipped.push({ line: at, reason: `"${id}" is not a 12-digit government identifier.` });
      return;
    }

    const state = STATE_BY_FIPS[id.slice(0, 2)];
    if (!state) {
      skipped.push({ line: at, reason: `FIPS state code ${id.slice(0, 2)} is not one we know.` });
      return;
    }

    const type = TYPE_BY_CODE[id.slice(2, 3)];
    if (!type) {
      skipped.push({ line: at, reason: `Government type code ${id.slice(2, 3)} is not one we know.` });
      return;
    }

    const name = tidyName(line.slice(12, 76));
    if (!name) {
      skipped.push({ line: at, reason: `Government ${id} has no name in this file.` });
      return;
    }
    if (raw.replace(/[\r\n]+$/, "").length < 76) {
      skipped.push({ line: at, reason: "The line is too short to be a government record." });
      return;
    }

    const populationText = line.slice(117, 125).trim();
    const population = /^\d+$/.test(populationText) ? Number(populationText) : null;
    const yearText = line.slice(125, 127).trim();
    const populationYear = /^\d{2}$/.test(yearText) ? 2000 + Number(yearText) : null;
    const county = tidyName(line.slice(76, 109)) || null;

    governments.push({ geoid: id, name, state, type, population, county, populationYear });
  });

  return { governments, skipped };
}

/** What the operator is told after an upload, in counts they can sanity-check. */
export function describeCensusParse(parse: CensusParse): string {
  const byType = new Map<string, number>();
  for (const g of parse.governments) byType.set(g.type, (byType.get(g.type) ?? 0) + 1);

  const withPopulation = parse.governments.filter((g) => g.population !== null).length;
  const words: Record<string, string> = {
    county: "counties",
    city: "cities and municipalities",
    township: "townships",
    special_district: "special districts",
    school_district: "school districts",
    state_agency: "state governments",
  };

  const parts = [...byType.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([type, n]) => `${n.toLocaleString("en-US")} ${words[type] ?? type}`);

  return (
    `${parse.governments.length.toLocaleString("en-US")} governments: ${parts.join(", ")}. ` +
    `${withPopulation.toLocaleString("en-US")} of them carry a population, which is what the size bands are built from. ` +
    `Special districts and school districts have none in this file, and cannot be sampled by size.`
  );
}

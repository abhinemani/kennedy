import { describe, expect, it } from "vitest";
import { allRolesFromSupplier, roleFromSupplier } from "../src/core/supplier-roles";
import { normalizeType } from "../src/core/resolve";

// The values here are the ones a real Power Almanac export contains. Without these mappings
// every imported contact lands in "other" and the audience screen shows thirteen empty lists
// beside a database full of people.

describe("a supplier's role labels", () => {
  it("places the roles their files are actually about", () => {
    expect(roleFromSupplier("Head of Finance")).toBe("finance");
    expect(roleFromSupplier("Head of IT")).toBe("it");
    expect(roleFromSupplier("Head of Purchasing")).toBe("purchasing");
    expect(roleFromSupplier("Top Appointed Executive")).toBe("manager");
    expect(roleFromSupplier("Deputy Top Appointed Executive")).toBe("manager");
    expect(roleFromSupplier("Head Clerk")).toBe("clerk");
  });

  it("takes the first recognised role when someone holds several", () => {
    // Their files list the role the export is about first.
    expect(roleFromSupplier("Head of Finance,Head of Purchasing")).toBe("finance");
    expect(roleFromSupplier("Head of IT,Head of Geographic Information System")).toBe("it");
    expect(roleFromSupplier("Top Appointed Executive,Head Clerk")).toBe("manager");
  });

  it("skips past a role it does not know to one it does", () => {
    expect(roleFromSupplier("Head of Facilities Management,Head Clerk")).toBe("clerk");
  });

  it("says other rather than guessing", () => {
    expect(roleFromSupplier("Head of Facilities Management")).toBe("other");
    expect(roleFromSupplier("")).toBe("other");
    expect(roleFromSupplier("Something Nobody Has Heard Of")).toBe("other");
  });

  it("accepts a file that already uses our own names", () => {
    expect(roleFromSupplier("records_officer")).toBe("records_officer");
    expect(roleFromSupplier("clerk")).toBe("clerk");
  });

  it("does not care about case or spacing", () => {
    expect(roleFromSupplier("  HEAD OF finance  ")).toBe("finance");
  });

  it("can list every role a person holds, for showing what a file contains", () => {
    expect(allRolesFromSupplier("Head of Finance,Head of Purchasing,Head of Facilities Management"))
      .toEqual(["finance", "purchasing"]);
    expect(allRolesFromSupplier("Head of IT,Head of IT")).toEqual(["it"]);
  });
});

describe("a supplier's government categories", () => {
  it("knows the kinds their export contains", () => {
    for (const [given, want] of [
      ["City", "city"],
      ["County", "county"],
      ["Town", "city"],
      ["Township", "township"],
      ["Village", "city"],
      ["Parish", "county"],
      ["Charter township", "township"],
      ["Borough", "city"],
    ] as const) {
      expect(normalizeType(given), given).toBe(want);
    }
  });

  it("places a consolidated government rather than sending it to review", () => {
    // These are single places with a single clerk, written several ways.
    expect(normalizeType("City and county")).toBe("city");
    expect(normalizeType("Unified government")).toBe("city");
    expect(normalizeType("City-parish")).toBe("city");
    expect(normalizeType("Metropolitan government")).toBe("city");
  });

  it("still refuses something it genuinely does not know", () => {
    expect(normalizeType("Regional transit authority")).toBeNull();
    expect(normalizeType("")).toBeNull();
  });
});

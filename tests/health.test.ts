import { describe, expect, it } from "vitest";
import { buildChecklist, checklistReady, type HealthFacts } from "../src/core/health";

const green: HealthFacts = {
  databaseReachable: true,
  databaseError: null,
  passphraseSet: true,
  passphraseIsExample: false,
  linkDomain: "https://surveys.ethoslabs.us",
  postalAddress: "1 Example Street, Somewhere",
  replyTo: "research@example.org",
  registryEntities: 90_112,
  sendProvider: "dryrun",
  anthropicKeySet: true,
  anthropicModel: "claude-haiku-4-5-20251001",
};

const find = (f: HealthFacts, id: string) => {
  const c = buildChecklist(f).find((x) => x.id === id);
  if (!c) throw new Error(`no check ${id}`);
  return c;
};

describe("setup checklist", () => {
  it("is all green when everything is set", () => {
    const checks = buildChecklist(green);
    expect(checks).toHaveLength(7);
    expect(checklistReady(checks)).toBe(true);
  });

  it("flags a missing database and repeats the error", () => {
    const c = find({ ...green, databaseReachable: false, databaseError: "Connection refused." }, "database");
    expect(c.state).toBe("todo");
    expect(c.detail).toContain("Connection refused.");
    expect(c.detail).toContain("Neon");
  });

  it("flags the example passphrase as not set", () => {
    const c = find({ ...green, passphraseIsExample: true }, "passphrase");
    expect(c.state).toBe("todo");
    expect(c.detail).toContain("example value");
  });

  it("says no one can sign in when the passphrase is missing", () => {
    expect(find({ ...green, passphraseSet: false }, "passphrase").detail).toContain("no one can sign in");
  });

  it("names both missing addresses in one line", () => {
    const c = find({ ...green, postalAddress: null, replyTo: null }, "addresses");
    expect(c.detail).toContain("a postal address and a reply-to address");
  });

  it("names only the address that is missing", () => {
    const c = find({ ...green, replyTo: null }, "addresses");
    expect(c.detail).toContain("a reply-to address");
    expect(c.detail).not.toContain("a postal address and");
  });

  it("shows the link domain the way a respondent would see it", () => {
    expect(find(green, "link_domain").detail).toContain("https://surveys.ethoslabs.us/s/");
  });

  it("counts the registry and sends the operator to the upload screen when it is empty", () => {
    expect(find(green, "registry").detail).toContain("90,112");
    expect(find({ ...green, registryEntities: 0 }, "registry").fix?.href).toBe("/console/contacts/registry");
  });

  it("says plainly that dry run sends nothing", () => {
    expect(find(green, "provider").detail).toContain("nothing leaves the system");
  });

  it("separates a missing key from a missing model", () => {
    expect(find({ ...green, anthropicKeySet: false }, "ai").detail).toContain("ANTHROPIC_API_KEY");
    expect(find({ ...green, anthropicModel: null }, "ai").detail).toContain("ANTHROPIC_MODEL");
  });

  it("does not hardcode a model name", () => {
    expect(find({ ...green, anthropicModel: "some-other-model" }, "ai").detail).toContain("some-other-model");
  });

  it("every unfinished line says where to go next", () => {
    const facts: HealthFacts = {
      databaseReachable: false,
      databaseError: null,
      passphraseSet: false,
      passphraseIsExample: false,
      linkDomain: null,
      postalAddress: null,
      replyTo: null,
      registryEntities: 0,
      sendProvider: null,
      anthropicKeySet: false,
      anthropicModel: null,
    };
    const checks = buildChecklist(facts);
    expect(checklistReady(checks)).toBe(false);
    for (const c of checks) {
      expect(c.state).toBe("todo");
      expect(c.fix).not.toBeNull();
      expect(c.detail.length).toBeGreaterThan(20);
    }
  });
});

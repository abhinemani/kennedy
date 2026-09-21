import { describe, expect, it } from "vitest";
import { leadPayload, providerMessageId, touchesWithoutCampaign, touchForCampaign, translateWebhook } from "../src/core/instantly";

const message = {
  studyContactId: "sc-1",
  to: "Clerk@TestCity.gov",
  firstName: "Sam",
  subject: "Five questions",
  body: "Hi Sam,\n\nhttps://surveys.example/s/abc\n\nhttps://surveys.example/u/abc",
  touch: 1,
};

describe("instantly: naming a message", () => {
  it("names a message by its campaign and address, case-insensitively", () => {
    expect(providerMessageId("camp-1", "Clerk@TestCity.gov")).toBe("instantly:camp-1:clerk@testcity.gov");
    expect(providerMessageId("camp-1", " clerk@testcity.gov ")).toBe(providerMessageId("camp-1", "CLERK@TESTCITY.GOV"));
  });

  it("gives the campaign everything the template needs, and never adds the same person twice", () => {
    const lead = leadPayload(message, "camp-1", "https://surveys.example/s/abc", "https://surveys.example/u/abc");
    expect(lead.campaign).toBe("camp-1");
    expect(lead.email).toBe("Clerk@TestCity.gov");
    expect(lead.custom_variables.subject).toBe("Five questions");
    expect(lead.custom_variables.body).toContain("/s/abc");
    expect(lead.custom_variables.kennedy_touch).toBe("1");
    expect(lead.skip_if_in_campaign).toBe(true);
  });
});

describe("instantly: campaigns and touches", () => {
  const sequence = [{ touch: 1, campaign: "a" }, { touch: 2 }, { touch: 3, campaign: "CHANGE_ME" }];

  it("finds the touch a campaign stands for", () => {
    expect(touchForCampaign(sequence, "a")).toBe(1);
    expect(touchForCampaign(sequence, "zzz")).toBeNull();
  });

  it("names the touches that still need a campaign, including placeholders", () => {
    expect(touchesWithoutCampaign(sequence)).toEqual([2, 3]);
  });
});

describe("instantly: reading delivery reports", () => {
  it("turns a bounce into a bounced message it can find without a lookup", () => {
    const read = translateWebhook({ event_type: "email_bounced", campaign_id: "camp-1", lead_email: "Clerk@TestCity.gov" });
    expect(read.events).toEqual([{ providerMessageId: "instantly:camp-1:clerk@testcity.gov", type: "bounced" }]);
    expect(read.unsubscribed).toEqual([]);
  });

  it("treats an unsubscribe as a suppression, not a complaint", () => {
    const read = translateWebhook({ event_type: "lead_unsubscribed", campaign_id: "camp-1", lead_email: "x@y.gov" });
    expect(read.events).toEqual([]);
    expect(read.unsubscribed).toEqual(["x@y.gov"]);
  });

  it("leaves replies, opens and unknown events alone", () => {
    const read = translateWebhook([
      { event_type: "reply_received", campaign_id: "camp-1", lead_email: "x@y.gov" },
      { event_type: "email_opened", campaign_id: "camp-1", lead_email: "x@y.gov" },
      { event_type: "email_sent", campaign_id: "camp-1", lead_email: "x@y.gov" },
    ]);
    expect(read.events).toEqual([{ providerMessageId: "instantly:camp-1:x@y.gov", type: "delivered" }]);
    expect(read.ignored).toEqual(["reply_received", "email_opened"]);
  });

  it("ignores a report with no address or campaign, and nonsense", () => {
    expect(translateWebhook({ event_type: "email_bounced" }).events).toEqual([]);
    expect(translateWebhook("no").events).toEqual([]);
    expect(translateWebhook(null).events).toEqual([]);
  });
});

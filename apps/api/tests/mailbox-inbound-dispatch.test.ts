/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { describe, it, expect } from "vitest";
import { extractRecipientEmails, boxesForRecipients } from "../src/routes/mailboxInbound";

describe("extractRecipientEmails", () => {
  it("pulls addresses from MailerSend recipients.rcptTo[].email", () => {
    const data = { recipients: { rcptTo: [{ email: "Caleb@getsweepr.com" }] } };
    expect(extractRecipientEmails(data)).toContain("caleb@getsweepr.com");
  });

  it("pulls addresses from recipients.to.data[] and bare to string", () => {
    const data = { recipients: { to: { data: [{ email: "help@getsweepr.com" }] } }, to: "Ops <alerts@getsweepr.com>" };
    const got = extractRecipientEmails(data);
    expect(got).toEqual(expect.arrayContaining(["help@getsweepr.com", "alerts@getsweepr.com"]));
  });

  it("lowercases and dedupes", () => {
    const data = { to: ["news@getsweepr.com", "NEWS@getsweepr.com"] };
    expect(extractRecipientEmails(data)).toEqual(["news@getsweepr.com"]);
  });

  it("returns [] when nothing recognizable", () => {
    expect(extractRecipientEmails({ subject: "hi" })).toEqual([]);
  });
});

describe("boxesForRecipients — primary /inbound dispatch", () => {
  it("files to the single addressed box", () => {
    expect(boxesForRecipients(["caleb@getsweepr.com"], null)).toEqual(["caleb"]);
  });

  it("fans a multi-recipient message into each addressed box", () => {
    const got = boxesForRecipients(["help@getsweepr.com", "alerts@getsweepr.com"], null);
    expect(got).toEqual(expect.arrayContaining(["help", "alerts"]));
    expect(got).toHaveLength(2);
  });

  it("falls back to help rather than dropping unrecognized recipients", () => {
    expect(boxesForRecipients(["someone@example.com"], null)).toEqual(["help"]);
    expect(boxesForRecipients([], null)).toEqual(["help"]);
  });

  it("ignores IT@/security@ (they have their own ticket routes)", () => {
    // security@ isn't a Mail-tab box → no known box → help fallback, never a security store
    expect(boxesForRecipients(["security@getsweepr.com"], null)).toEqual(["help"]);
  });
});

describe("boxesForRecipients — legacy /:box dedup", () => {
  it("stores when addressed to its own box", () => {
    expect(boxesForRecipients(["news@getsweepr.com"], "news")).toEqual(["news"]);
  });

  it("ignores sibling fan-out deliveries not addressed to this box", () => {
    // combined route delivers a caleb@ message to the kristin & news webhooks too;
    // only caleb's handler stores it.
    expect(boxesForRecipients(["caleb@getsweepr.com"], "kristin")).toBe("ignore");
    expect(boxesForRecipients(["caleb@getsweepr.com"], "news")).toBe("ignore");
    expect(boxesForRecipients(["caleb@getsweepr.com"], "caleb")).toEqual(["caleb"]);
  });

  it("stores when no recipient is present (can't disprove addressing)", () => {
    expect(boxesForRecipients([], "help")).toEqual(["help"]);
  });
});

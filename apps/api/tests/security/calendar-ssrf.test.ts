/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

/**
 * SSRF hardening for customer-supplied calendar (.ics) URLs.
 * Covers IP classification, hostname/scheme denylist, and ICS parseability.
 */

import { describe, it, expect } from "vitest";
import {
  isPrivateIPv4,
  isPrivateIPv6,
  isBlockedLiteralIP,
  isBlockedHostname,
  validateCalendarUrlSyntax,
  parseIcs,
  CalendarValidationError,
} from "../../src/lib/calendarSecurity";

describe("isPrivateIPv4", () => {
  const priv = [
    "127.0.0.1",
    "0.0.0.0",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254", // cloud metadata
    "100.64.0.1", // CGNAT
    "255.255.255.255",
    "224.0.0.1",
  ];
  const pub = ["8.8.8.8", "1.1.1.1", "172.32.0.1", "11.0.0.1", "93.184.216.34"];
  for (const ip of priv) it(`blocks ${ip}`, () => expect(isPrivateIPv4(ip)).toBe(true));
  for (const ip of pub) it(`allows ${ip}`, () => expect(isPrivateIPv4(ip)).toBe(false));
});

describe("isPrivateIPv6", () => {
  const priv = [
    "::1",
    "::",
    "fe80::1",
    "fc00::1",
    "fd12:3456::1",
    "::ffff:127.0.0.1", // IPv4-mapped loopback
    "::ffff:169.254.169.254", // IPv4-mapped metadata
  ];
  const pub = ["2606:4700:4700::1111", "2001:4860:4860::8888"];
  for (const ip of priv) it(`blocks ${ip}`, () => expect(isPrivateIPv6(ip)).toBe(true));
  for (const ip of pub) it(`allows ${ip}`, () => expect(isPrivateIPv6(ip)).toBe(false));
});

describe("isBlockedLiteralIP", () => {
  it("blocks bracketed IPv6 loopback", () => expect(isBlockedLiteralIP("[::1]")).toBe(true));
  it("blocks metadata IP", () => expect(isBlockedLiteralIP("169.254.169.254")).toBe(true));
  it("allows public v4", () => expect(isBlockedLiteralIP("8.8.8.8")).toBe(false));
  it("treats a hostname as non-literal", () => expect(isBlockedLiteralIP("airbnb.com")).toBe(false));
});

describe("isBlockedHostname", () => {
  for (const h of ["localhost", "metadata.google.internal", "foo.local", "db.internal", "host.lan"])
    it(`blocks ${h}`, () => expect(isBlockedHostname(h)).toBe(true));
  for (const h of ["airbnb.com", "calendar.google.com", "www.vrbo.com"])
    it(`allows ${h}`, () => expect(isBlockedHostname(h)).toBe(false));
});

describe("validateCalendarUrlSyntax", () => {
  const bad: Array<[string, string]> = [
    ["file:///etc/passwd", "bad_scheme"],
    ["ftp://example.com/cal.ics", "bad_scheme"],
    ["http://127.0.0.1/cal.ics", "private_ip"],
    ["https://169.254.169.254/latest/meta-data", "private_ip"],
    ["https://[::1]/cal.ics", "private_ip"],
    ["https://localhost/cal.ics", "internal_host"],
    ["https://pms.internal/cal.ics", "internal_host"],
    ["https://user:pass@example.com/cal.ics", "has_credentials"],
    ["not a url", "invalid_url"],
  ];
  for (const [url, code] of bad) {
    it(`rejects ${url} (${code})`, () => {
      try {
        validateCalendarUrlSyntax(url);
        throw new Error("expected rejection");
      } catch (e) {
        expect(e).toBeInstanceOf(CalendarValidationError);
        expect((e as CalendarValidationError).code).toBe(code);
      }
    });
  }

  it("accepts a public https feed", () => {
    const { hostname } = validateCalendarUrlSyntax("https://www.airbnb.com/calendar/ical/123.ics?s=abc");
    expect(hostname).toBe("www.airbnb.com");
  });

  it("normalizes webcal:// to https", () => {
    const { url } = validateCalendarUrlSyntax("webcal://calendar.google.com/feed.ics");
    expect(url.protocol).toBe("https:");
  });
});

describe("parseIcs", () => {
  it("returns null for non-ICS payloads", () => {
    expect(parseIcs("<html>nope</html>")).toBeNull();
    expect(parseIcs("")).toBeNull();
  });

  it("parses events with checkout (DTEND) dates", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      "UID:abc-123@airbnb.com",
      "DTSTART;VALUE=DATE:20260710",
      "DTEND;VALUE=DATE:20260714",
      "SUMMARY:Reserved",
      "STATUS:CONFIRMED",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const events = parseIcs(ics);
    expect(events).not.toBeNull();
    expect(events).toHaveLength(1);
    expect(events![0].externalUid).toBe("abc-123@airbnb.com");
    expect(events![0].start).toBe("2026-07-10");
    expect(events![0].end).toBe("2026-07-14"); // checkout
    expect(events![0].summary).toBe("Reserved");
  });

  it("unfolds RFC 5545 folded lines", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:long",
      "SUMMARY:Reserved for a very",
      "  long guest name",
      "DTEND:20260714T110000Z",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const events = parseIcs(ics)!;
    expect(events[0].summary).toBe("Reserved for a very long guest name");
    expect(events[0].end).toBe("2026-07-14T11:00:00Z");
  });
});

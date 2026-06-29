/**
 * Compact ticket identifiers for Security Reports (SR) and IT tickets (IT).
 *
 * Canonical:  PREFIX_{base36 day-offset}:{base62 minute-of-day, 2ch}.{TYPE}_{HEX5}
 *   e.g. SR_7GS:NF.PHI_03FA9   IT_7GS:NF.SLK_A92F1
 * Short form: PREFIX_{HEX5}  (convenience only; not guaranteed unique).
 *
 * Date base36 from 2000-01-01; time base62 minute-of-day; all UTC.
 */

const DATE_EPOCH = Date.UTC(2000, 0, 1);
const BASE62_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

export type TicketPrefix = "SR" | "IT";

export interface ParsedTicketId {
  prefix: TicketPrefix;
  encodedDate: string;
  encodedTime: string;
  createdDate: string;
  createdTime: string;
  issueType: string;
  hex: string;
  /** Public-facing Case Code (PREFIX_HEX5). */
  caseCode: string;
}

export function encodeBase62(value: number): string {
  if (!Number.isInteger(value) || value < 0) throw new Error("Base62 value must be a non-negative integer.");
  if (value === 0) return "0";
  let result = "";
  while (value > 0) {
    result = BASE62_CHARS[value % 62] + result;
    value = Math.floor(value / 62);
  }
  return result;
}

export function decodeBase62(encoded: string): number {
  let value = 0;
  for (const char of encoded) {
    const index = BASE62_CHARS.indexOf(char);
    if (index === -1) throw new Error("Invalid Base62 character.");
    value = value * 62 + index;
  }
  return value;
}

export function encodeTicketDate(date: Date): string {
  const utc = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const days = Math.floor((utc - DATE_EPOCH) / 86_400_000);
  if (days < 0) throw new Error("Ticket date cannot be before 2000-01-01.");
  return days.toString(36).toUpperCase();
}

export function encodeTicketTime(date: Date): string {
  const minuteOfDay = date.getUTCHours() * 60 + date.getUTCMinutes();
  return encodeBase62(minuteOfDay).padStart(2, "0");
}

export function randomHex5(): string {
  return Math.floor(Math.random() * 0x100000).toString(16).toUpperCase().padStart(5, "0");
}

export interface GeneratedTicket {
  /** Internal canonical Ticket ID (PREFIX_DATE:TIME.TYPE_HEX). */
  ticketId: string;
  /** Public-facing Case Code (PREFIX_HEX5). */
  caseCode: string;
  prefix: TicketPrefix;
  encodedDate: string;
  encodedTime: string;
  issueType: string;
  hex: string;
  createdAt: string;
}

export function generateTicketId(prefix: TicketPrefix, issueType: string, date = new Date()): GeneratedTicket {
  if (!/^(SR|IT)$/.test(prefix)) throw new Error("Prefix must be SR or IT.");
  if (!/^[A-Z]{3}$/.test(issueType)) throw new Error("Issue type must be exactly three uppercase letters.");
  const encodedDate = encodeTicketDate(date);
  const encodedTime = encodeTicketTime(date);
  const hex = randomHex5();
  return {
    ticketId: `${prefix}_${encodedDate}:${encodedTime}.${issueType}_${hex}`,
    caseCode: `${prefix}_${hex}`,
    prefix,
    encodedDate,
    encodedTime,
    issueType,
    hex,
    createdAt: date.toISOString(),
  };
}

const TICKET_REGEX = /^(SR|IT)_([0-9A-Z]+):([0-9A-Za-z]{2})\.([A-Z]{3})_([0-9A-F]{5})$/;

export function parseTicketId(ticketId: string): ParsedTicketId {
  const match = ticketId.match(TICKET_REGEX);
  if (!match) throw new Error("Invalid ticket ID format.");
  const [, prefix, encodedDate, encodedTime, issueType, hex] = match;
  const days = parseInt(encodedDate, 36);
  const minuteOfDay = decodeBase62(encodedTime);
  const dt = new Date(DATE_EPOCH + days * 86_400_000 + minuteOfDay * 60_000);
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  const hh = String(dt.getUTCHours()).padStart(2, "0");
  const mi = String(dt.getUTCMinutes()).padStart(2, "0");
  return {
    prefix: prefix as TicketPrefix,
    encodedDate, encodedTime, issueType, hex,
    createdDate: `${mm}/${dd}/${dt.getUTCFullYear()}`,
    createdTime: `${hh}:${mi}`,
    caseCode: `${prefix}_${hex}`,
  };
}

// ── Issue-type code maps ───────────────────────────────────────────────────────

/** Map a security classification label to its 3-letter SR issue code. */
export const SECURITY_TYPE_CODE: Record<string, string> = {
  "Account Security": "ACC",
  "Authentication": "AUT",
  "Credential Exposure": "CRE",
  "Phishing Report": "PHI",
  "Malware": "MAL",
  "Potential Vulnerability": "VUL",
  "Security Bug": "BUG",
  "Privacy Concern": "PRI",
  "Fraud Report": "FRD",
  "Abuse Report": "ABU",
  "Policy Violation": "POL",
  "Misdirected Email": "MIS",
  "Suspicious Email": "SPM",
  "Spam": "SPM",
  "Internal Security Matter": "INT",
  "Responsible Disclosure": "VUL",
  "Bug Bounty Submission": "VUL",
  "General Inquiry": "OTH",
  "Other": "OTH",
};

/** Map an IT ticket category to its 3-letter IT issue code. */
export const IT_TYPE_CODE: Record<string, string> = {
  account: "ACC",
  authentication: "AUT",
  device: "DEV",
  network: "NET",
  email: "EML",
  application: "APP",
  technical: "APP",
  database: "DBA",
  api: "API",
  integration: "API",
  operations: "OPS",
  slack: "SLK",
  payments: "PAY",
  billing: "PAY",
  printer: "PRN",
  security: "SEC",
  safety: "SEC",
  bug: "BUG",
  config: "CFG",
  feature_request: "OTH",
  other: "OTH",
};

export function securityTypeCode(classification: string): string {
  return SECURITY_TYPE_CODE[classification] ?? "OTH";
}

export function itTypeCode(category: string): string {
  return IT_TYPE_CODE[category?.toLowerCase()] ?? "OTH";
}

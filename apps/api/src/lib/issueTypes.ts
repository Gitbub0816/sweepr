/**
 * Canonical issue types for IT and Security reporting.
 *
 * These human-readable labels are the source of truth shown in the
 * "Report a problem" form and the admin consoles. Each maps to the 3-letter
 * code used inside the canonical Ticket ID, and (for IT) to the it_tickets
 * category CHECK enum.
 */

export interface ITIssueType {
  label: string;
  code: string;       // 3-letter Ticket-ID code
  dbCategory: string; // it_tickets.category enum: bug|billing|account|technical|safety|feature_request|other
}

export const IT_ISSUE_TYPES: ITIssueType[] = [
  { label: "Account Access", code: "ACC", dbCategory: "account" },
  { label: "Authentication", code: "AUT", dbCategory: "account" },
  { label: "Device Issue", code: "DEV", dbCategory: "technical" },
  { label: "Network", code: "NET", dbCategory: "technical" },
  { label: "Email", code: "EML", dbCategory: "technical" },
  { label: "Application", code: "APP", dbCategory: "technical" },
  { label: "Database", code: "DBA", dbCategory: "technical" },
  { label: "API / Integration", code: "API", dbCategory: "technical" },
  { label: "Operations Tooling", code: "OPS", dbCategory: "technical" },
  { label: "Slack", code: "SLK", dbCategory: "technical" },
  { label: "Payments System", code: "PAY", dbCategory: "billing" },
  { label: "Printer / Peripheral", code: "PRN", dbCategory: "technical" },
  { label: "Security-Related IT", code: "SEC", dbCategory: "safety" },
  { label: "Software Bug", code: "BUG", dbCategory: "bug" },
  { label: "Configuration", code: "CFG", dbCategory: "technical" },
  { label: "Other", code: "OTH", dbCategory: "other" },
];

export interface SecurityIssueType {
  label: string;
  code: string;
}

export const SECURITY_ISSUE_TYPES: SecurityIssueType[] = [
  { label: "Account Security", code: "ACC" },
  { label: "Authentication", code: "AUT" },
  { label: "Credential Exposure", code: "CRE" },
  { label: "Phishing", code: "PHI" },
  { label: "Malware", code: "MAL" },
  { label: "Vulnerability", code: "VUL" },
  { label: "Security Bug", code: "BUG" },
  { label: "Privacy Concern", code: "PRI" },
  { label: "Fraud", code: "FRD" },
  { label: "Abuse Report", code: "ABU" },
  { label: "Policy Violation", code: "POL" },
  { label: "Misdirected Email", code: "MIS" },
  { label: "Spam", code: "SPM" },
  { label: "Internal Security Matter", code: "INT" },
  { label: "Other", code: "OTH" },
];

export const IT_LABELS = IT_ISSUE_TYPES.map((t) => t.label);
export const SECURITY_LABELS = SECURITY_ISSUE_TYPES.map((t) => t.label);

export function itTypeFromLabel(label: string): ITIssueType {
  return IT_ISSUE_TYPES.find((t) => t.label === label) ?? IT_ISSUE_TYPES[IT_ISSUE_TYPES.length - 1];
}

export function securityTypeFromLabel(label: string): SecurityIssueType {
  return SECURITY_ISSUE_TYPES.find((t) => t.label === label) ?? SECURITY_ISSUE_TYPES[SECURITY_ISSUE_TYPES.length - 1];
}

/** Keyword classifier → canonical Security label (for inbound email). */
export function classifySecurity(subject: string, body: string): string {
  const t = `${subject} ${body}`.toLowerCase();
  if (/phish/.test(t)) return "Phishing";
  if (/vuln|exploit|xss|sqli|cve|disclosure/.test(t)) return "Vulnerability";
  if (/malware|virus|ransom/.test(t)) return "Malware";
  if (/password|credential|leak|exposed|token/.test(t)) return "Credential Exposure";
  if (/fraud|scam/.test(t)) return "Fraud";
  if (/abuse|harass/.test(t)) return "Abuse Report";
  if (/privacy|gdpr|ccpa|data request/.test(t)) return "Privacy Concern";
  if (/account|login|2fa|locked/.test(t)) return "Account Security";
  if (/misdirect|wrong (address|recipient)/.test(t)) return "Misdirected Email";
  if (/spam|unsolicited/.test(t)) return "Spam";
  return "Other";
}

/** Keyword classifier → canonical IT label (for inbound email). */
export function classifyIT(subject: string, body: string): string {
  const t = `${subject} ${body}`.toLowerCase();
  if (/slack/.test(t)) return "Slack";
  if (/email|smtp|mailbox|inbox/.test(t)) return "Email";
  if (/network|wifi|connection|dns|vpn/.test(t)) return "Network";
  if (/printer|peripheral/.test(t)) return "Printer / Peripheral";
  if (/database|\bsql\b|neon/.test(t)) return "Database";
  if (/\bapi\b|integration|webhook/.test(t)) return "API / Integration";
  if (/payment|payout|stripe|billing|invoice/.test(t)) return "Payments System";
  if (/login|password|account|locked|access/.test(t)) return "Account Access";
  if (/auth|sso|token|2fa/.test(t)) return "Authentication";
  if (/bug|error|crash|broken|exception/.test(t)) return "Software Bug";
  if (/device|laptop|hardware|phone/.test(t)) return "Device Issue";
  if (/config|setting/.test(t)) return "Configuration";
  return "Other";
}

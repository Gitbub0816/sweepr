/**
 * Classification inference for inbound IT and Security email.
 *
 * Deterministic, weighted keyword scoring over the subject (weighted higher)
 * and body. Returns the best canonical label, a 0–100 confidence, and the
 * signals that fired. No external calls — safe and explainable.
 */

interface Rule { re: RegExp; w: number }
type RuleSet = Record<string, Rule[]>;

export interface ClassifyResult {
  label: string;        // canonical label
  confidence: number;   // 0–100
  signals: string[];    // matched keywords
  scores: Record<string, number>;
  /** True when confidence cleared the auto-apply threshold. */
  auto: boolean;
}

const AUTO_THRESHOLD = 45;

function r(pattern: string, w = 1): Rule {
  return { re: new RegExp(`\\b(${pattern})\\b`, "i"), w };
}

// ── Security rules (canonical SECURITY labels) ────────────────────────────────
const SECURITY_RULES: RuleSet = {
  "Phishing": [r("phish(ing)?", 3), r("spoof(ed|ing)?", 2), r("fake (email|login|site)", 2), r("impersonat(e|ion)", 2)],
  "Vulnerability": [r("vulnerabilit(y|ies)", 3), r("exploit", 3), r("xss|sqli|csrf|rce|ssrf", 3), r("\\bcve\\b", 3), r("responsible disclosure", 3), r("bug bounty", 2), r("proof[- ]of[- ]concept|poc", 2)],
  "Malware": [r("malware", 3), r("virus", 2), r("ransom(ware)?", 3), r("trojan|keylogger|spyware", 2)],
  "Credential Exposure": [r("credential(s)?", 3), r("password(s)?", 2), r("api[- ]?key|secret key|access token", 3), r("leak(ed)?|exposed|dump", 2)],
  "Account Security": [r("account (takeover|hacked|compromis)", 3), r("unauthorized (access|login)", 3), r("2fa|mfa|otp", 2), r("locked out|reset", 1)],
  "Authentication": [r("authentication|auth", 2), r("\\bsso\\b|oauth|saml", 2), r("session (hijack|fixation)", 2)],
  "Privacy Concern": [r("privacy", 3), r("gdpr|ccpa|cpra", 3), r("data (subject|request|deletion)", 2), r("\\bpii\\b|personal (data|information)", 2)],
  "Fraud": [r("fraud(ulent)?", 3), r("scam", 3), r("charge ?back", 2), r("stolen (card|payment)", 2)],
  "Abuse Report": [r("abuse", 3), r("harass(ment)?", 3), r("threat(ening)?", 2), r("spam(ming)?", 1)],
  "Policy Violation": [r("policy violation", 3), r("terms (of service|violation)", 2), r("acceptable use", 2)],
  "Misdirected Email": [r("wrong (recipient|address|person)", 3), r("not (the )?intended", 2), r("received by mistake|misdirected", 3)],
  "Spam": [r("\\bspam\\b", 3), r("unsubscribe|bulk (mail|email)", 1)],
  "Internal Security Matter": [r("internal (security|incident)", 3), r("insider", 2)],
};

// ── IT rules (canonical IT labels) ────────────────────────────────────────────
const IT_RULES: RuleSet = {
  "Account Access": [r("can'?t (log ?in|sign ?in|access)", 3), r("locked out", 3), r("password reset", 2), r("access (denied|request)", 2), r("permission(s)?", 2)],
  "Authentication": [r("2fa|mfa|otp|authenticator", 3), r("\\bsso\\b|oauth|saml", 3), r("session expired|token", 2)],
  "Device Issue": [r("laptop|desktop|computer|device", 3), r("hardware|screen|keyboard|battery", 2), r("phone|mobile|tablet", 2)],
  "Network": [r("network|wifi|internet|connection", 3), r("\\bvpn\\b", 3), r("\\bdns\\b|latency|slow", 2)],
  "Email": [r("email|e-mail|mailbox|inbox|smtp|imap", 3), r("can'?t (send|receive)", 2), r("mailersend|deliverability|bounce", 2)],
  "Application": [r("app (crash|error|broken)|application", 3), r("page (won'?t load|broken)|ui", 2), r("button|form|feature", 1)],
  "Database": [r("database|\\bsql\\b|postgres|neon", 3), r("query|migration|schema", 2)],
  "API / Integration": [r("\\bapi\\b|integration|webhook", 3), r("endpoint|rest|graphql", 2), r("stripe|clerk|twilio|mapbox", 2)],
  "Operations Tooling": [r("operations|ops tool|dashboard|admin (panel|console)", 3), r("report(ing)?|export", 1)],
  "Slack": [r("slack", 3), r("channel|workspace", 1)],
  "Payments System": [r("payment(s)?|payout(s)?|stripe|billing|invoice", 3), r("refund|charge|transaction", 2)],
  "Printer / Peripheral": [r("printer|scanner|peripheral", 3), r("usb|monitor|webcam", 2)],
  "Security-Related IT": [r("security (patch|update|setting)", 3), r("firewall|antivirus|endpoint", 2)],
  "Software Bug": [r("\\bbug\\b|error|crash|exception|broken", 3), r("stack ?trace|500|404|null", 2)],
  "Configuration": [r("config(uration)?|setting(s)?|setup", 3), r("environment|env var|toggle", 1)],
};

function score(ruleSet: RuleSet, subject: string, body: string): ClassifyResult {
  const subj = subject || "";
  const text = body || "";
  const scores: Record<string, number> = {};
  const matched: Record<string, Set<string>> = {};

  for (const [label, rules] of Object.entries(ruleSet)) {
    let s = 0;
    const sig = new Set<string>();
    for (const rule of rules) {
      const inSubject = rule.re.test(subj);
      const inBody = rule.re.test(text);
      if (inSubject) { s += rule.w * 2; sig.add(rule.re.source.replace(/\\b|[()]/g, "").split("|")[0]); }
      else if (inBody) { s += rule.w; sig.add(rule.re.source.replace(/\\b|[()]/g, "").split("|")[0]); }
    }
    if (s > 0) { scores[label] = s; matched[label] = sig; }
  }

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0) {
    return { label: "Other", confidence: 0, signals: [], scores, auto: false };
  }
  const [topLabel, topScore] = ranked[0];
  const runnerUp = ranked[1]?.[1] ?? 0;
  // Confidence blends absolute strength and the margin over the runner-up.
  const strength = Math.min(1, topScore / 8);
  const margin = topScore > 0 ? (topScore - runnerUp) / topScore : 0;
  const confidence = Math.round(Math.min(100, (strength * 0.6 + margin * 0.4) * 100));
  return {
    label: topLabel,
    confidence,
    signals: [...(matched[topLabel] ?? [])],
    scores,
    auto: confidence >= AUTO_THRESHOLD,
  };
}

export function inferSecurity(subject: string, body: string): ClassifyResult {
  return score(SECURITY_RULES, subject, body);
}

export function inferIT(subject: string, body: string): ClassifyResult {
  return score(IT_RULES, subject, body);
}

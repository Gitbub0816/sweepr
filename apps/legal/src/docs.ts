export const COMPANY_NAME = "ClearKey Solutions, LLC DBA Sweepr";
export const COMPANY_SHORT = "Sweepr";
export const STATE_OF_INCORPORATION = "California";
export const REGISTERED_ADDRESS = "832 B St, Apt B, Hayward, California 94541";
export const CONTACT_EMAIL = "contact@getsweepr.com";
export const SUPPORT_EMAIL = "support@getsweepr.com";
export const PRIVACY_EMAIL = "privacy@getsweepr.com";
export const LEGAL_EMAIL = "legal@getsweepr.com";
export const SECURITY_EMAIL = "security@getsweepr.com";
export const SMS_SHORT_CODE = "SWEEPR";
export const LEGAL_URL = "https://legal.getsweepr.com";
export const MAIN_URL = "https://getsweepr.com";
export const LAST_UPDATED = "June 2026";
export const DOC_VERSION = "1.0";

export type DocCategory =
  | "Core"
  | "Customers"
  | "Cleaners"
  | "Payments & Tax"
  | "Trust & Safety"
  | "Privacy & Data"
  | "Platform Policies";

export const CATEGORY_ORDER: DocCategory[] = [
  "Core",
  "Customers",
  "Cleaners",
  "Payments & Tax",
  "Trust & Safety",
  "Privacy & Data",
  "Platform Policies",
];

export interface DocMeta {
  slug: string;
  title: string;
  description: string;
  category: DocCategory;
  /** Document version. */
  version?: string;
  /** Effective date label. */
  effectiveDate?: string;
}

export const DOCS: DocMeta[] = [
  // ── Core ──────────────────────────────────────────────────────────────────
  {
    slug: "terms",
    title: "Terms of Service",
    description: "The terms governing your use of the Sweepr platform.",
    category: "Core",
  },
  {
    slug: "privacy",
    title: "Privacy Policy",
    description:
      "How we collect, use, and protect your personal information (CCPA & GDPR).",
    category: "Core",
  },
  {
    slug: "eula",
    title: "End User License Agreement",
    description: "License terms for the Sweepr applications.",
    category: "Core",
  },
  {
    slug: "dispute-resolution",
    title: "Dispute Resolution",
    description: "How disputes are resolved, including arbitration.",
    category: "Core",
  },
  {
    slug: "accessibility",
    title: "Accessibility Statement",
    description: "Our commitment to an accessible platform.",
    category: "Core",
  },
  {
    slug: "e-sign",
    title: "Electronic Communications & E-Sign Consent",
    description: "Consent to receive and sign documents electronically.",
    category: "Core",
  },

  // ── Customers ───────────────────────────────────────────────────────────────
  {
    slug: "customer-agreement",
    title: "Customer Agreement",
    description: "Terms for customers booking cleaning services through Sweepr.",
    category: "Customers",
  },
  {
    slug: "service-scope",
    title: "Service Scope Policy",
    description: "What is and is not included in Sweepr cleanings.",
    category: "Customers",
  },
  {
    slug: "refund-policy",
    title: "Refund & Cancellation Policy",
    description: "Refunds, cancellations, no-shows, and re-clean rules.",
    category: "Customers",
  },
  {
    slug: "damage-claims",
    title: "Damage Claims Policy",
    description: "How property damage claims are reported and reviewed.",
    category: "Customers",
  },
  {
    slug: "subscription-terms",
    title: "Subscription Terms",
    description: "Recurring service and subscription billing terms.",
    category: "Customers",
  },

  // ── Cleaners ────────────────────────────────────────────────────────────────
  {
    slug: "cleaner-agreement",
    title: "Cleaner Platform Agreement",
    description: "Terms for independent cleaners (Sweeprs) using the platform.",
    category: "Cleaners",
  },
  {
    slug: "contractor-agreement",
    title: "Independent Contractor Agreement",
    description: "Independent-business status, taxes, and contractor terms.",
    category: "Cleaners",
  },
  {
    slug: "background-check-disclosure",
    title: "Background Check Disclosure",
    description: "Disclosure that a consumer report may be obtained.",
    category: "Cleaners",
  },
  {
    slug: "background-check-authorization",
    title: "Background Check Authorization",
    description: "Cleaner authorization for background screening.",
    category: "Cleaners",
  },
  {
    slug: "background-check-adverse-action",
    title: "Background Check Adverse Action Policy",
    description: "Pre-adverse and adverse action process under the FCRA.",
    category: "Cleaners",
  },

  // ── Payments & Tax ──────────────────────────────────────────────────────────
  {
    slug: "payment-terms",
    title: "Payment Services Terms",
    description:
      "Payment processing, payouts, chargebacks, and payment authorization.",
    category: "Payments & Tax",
  },
  {
    slug: "platform-fee-policy",
    title: "Platform Fee Policy",
    description: "How customer-facing fees and cleaner platform fees may change.",
    category: "Payments & Tax",
  },
  {
    slug: "tax-reporting",
    title: "Tax Reporting Policy",
    description: "Tax forms, W-9s, 1099s, and cleaner tax obligations.",
    category: "Payments & Tax",
  },

  // ── Trust & Safety ──────────────────────────────────────────────────────────
  {
    slug: "trust-safety",
    title: "Trust & Safety Policy",
    description: "Rules for safer customer and cleaner interactions.",
    category: "Trust & Safety",
  },
  {
    slug: "community-guidelines",
    title: "Community Guidelines",
    description: "Behavior standards for everyone on Sweepr.",
    category: "Trust & Safety",
  },
  {
    slug: "reviews",
    title: "Review Policy",
    description: "Rules for honest, fair, and compliant reviews.",
    category: "Trust & Safety",
  },
  {
    slug: "acceptable-use",
    title: "Acceptable Use Policy",
    description: "Rules against misuse of the platform.",
    category: "Trust & Safety",
  },
  {
    slug: "insurance-protection",
    title: "Insurance & Protection Policy",
    description: "Insurance-related claim limitations and expectations.",
    category: "Trust & Safety",
  },

  // ── Privacy & Data ──────────────────────────────────────────────────────────
  {
    slug: "privacy-notice-at-collection",
    title: "California Notice at Collection",
    description: "California privacy notice for data collected by Sweepr.",
    category: "Privacy & Data",
  },
  {
    slug: "cookie-policy",
    title: "Cookie Policy",
    description: "Cookies, analytics, and tracking technologies.",
    category: "Privacy & Data",
  },
  {
    slug: "subprocessors",
    title: "Subprocessors",
    description: "Third-party service providers used by Sweepr.",
    category: "Privacy & Data",
  },
  {
    slug: "dpa",
    title: "Data Processing Addendum",
    description: "Controller/processor terms for business and enterprise data.",
    category: "Privacy & Data",
  },
  {
    slug: "security",
    title: "Security Policy",
    description: "How Sweepr protects platform and user data.",
    category: "Privacy & Data",
  },
  {
    slug: "ai-disclosure",
    title: "AI Disclosure",
    description: "How automated systems and AI may support Sweepr operations.",
    category: "Privacy & Data",
  },

  // ── Platform Policies ───────────────────────────────────────────────────────
  {
    slug: "sms-policy",
    title: "SMS Policy",
    description: "Our TCPA-compliant text messaging program terms.",
    category: "Platform Policies",
  },
  {
    slug: "sms/consent",
    title: "SMS Consent",
    description: "What you agree to when you opt in to Sweepr text messages.",
    category: "Platform Policies",
  },
  {
    slug: "legal-updates",
    title: "Legal Updates Policy",
    description: "How and when Sweepr updates its legal terms and policies.",
    category: "Platform Policies",
  },
  {
    slug: "copyright",
    title: "Copyright / DMCA Policy",
    description: "Copyright complaints and takedown requests.",
    category: "Platform Policies",
  },
  {
    slug: "vulnerability-disclosure",
    title: "Vulnerability Disclosure",
    description: "How to report security vulnerabilities.",
    category: "Platform Policies",
  },
  {
    slug: "law-enforcement",
    title: "Law Enforcement Requests",
    description: "How legal process and emergency requests are handled.",
    category: "Platform Policies",
  },
];

/** Returns docs grouped by category, in CATEGORY_ORDER. */
export function docsByCategory(): Array<{ category: DocCategory; docs: DocMeta[] }> {
  return CATEGORY_ORDER.map((category) => ({
    category,
    docs: DOCS.filter((d) => d.category === category),
  })).filter((g) => g.docs.length > 0);
}

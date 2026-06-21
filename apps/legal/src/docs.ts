export const COMPANY_NAME = "[COMPANY_NAME]";
export const STATE_OF_INCORPORATION = "[STATE_OF_INCORPORATION]";
export const REGISTERED_ADDRESS = "[REGISTERED_ADDRESS]";
export const CONTACT_EMAIL = "[CONTACT_EMAIL]";
export const SUPPORT_EMAIL = "[SUPPORT_EMAIL]";
export const PRIVACY_EMAIL = "[PRIVACY_EMAIL]";
export const LAST_UPDATED = "June 2025";

export interface DocMeta {
  slug: string;
  title: string;
  description: string;
}

export const DOCS: DocMeta[] = [
  {
    slug: "terms",
    title: "Terms of Service",
    description: "The terms governing your use of the Sweepr platform.",
  },
  {
    slug: "privacy",
    title: "Privacy Policy",
    description: "How we collect, use, and protect your personal information (CCPA & GDPR).",
  },
  {
    slug: "eula",
    title: "End User License Agreement",
    description: "License terms for the Sweepr applications.",
  },
  {
    slug: "contractor-agreement",
    title: "Independent Contractor Agreement",
    description: "The agreement between cleaners and Sweepr (AB5 / Prop 22 compliant).",
  },
  {
    slug: "sms-policy",
    title: "SMS Policy",
    description: "Our TCPA-compliant text messaging program terms.",
  },
  {
    slug: "cookie-policy",
    title: "Cookie Policy",
    description: "The cookies we use and how to manage them.",
  },
  {
    slug: "refund-policy",
    title: "Refund Policy",
    description: "Cancellations, refunds, and our satisfaction guarantee.",
  },
  {
    slug: "dispute-resolution",
    title: "Dispute Resolution",
    description: "How disputes are resolved, including arbitration.",
  },
  {
    slug: "accessibility",
    title: "Accessibility Statement",
    description: "Our commitment to an accessible platform.",
  },
];

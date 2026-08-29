/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

// DRAFT — attorney review required before production use.
import { Link } from "react-router-dom";
import { DocPage } from "../components/DocPage";
import { Section } from "../components/Section";
import { PRIVACY_EMAIL, LAST_UPDATED, DOC_VERSION } from "../docs";

const toc = [
  { id: "about", title: "About This List" },
  { id: "list", title: "Subprocessors" },
  { id: "changes", title: "Changes" },
];

interface Sub {
  vendor: string;
  purpose: string;
  data: string;
  region: string;
  role: "Processor" | "Controller";
  status: "Active" | "Planned" | "Optional";
}

const SUBS: Sub[] = [
  { vendor: "Clerk", purpose: "Authentication & accounts", data: "Identifiers, auth metadata", region: "US", role: "Processor", status: "Active" },
  { vendor: "Stripe", purpose: "Payments & payouts (Connect)", data: "Billing, payment tokens, payout/KYC", region: "US", role: "Controller", status: "Active" },
  { vendor: "Yardstik", purpose: "Background checks", data: "Identity, screening results", region: "US", role: "Controller", status: "Active" },
  { vendor: "Didit", purpose: "Identity verification", data: "Identity/verification data", region: "US/EU", role: "Processor", status: "Active" },
  { vendor: "Neon", purpose: "Application database", data: "Application data", region: "US", role: "Processor", status: "Active" },
  { vendor: "Cloudflare", purpose: "Hosting, CDN, security", data: "Network/usage metadata", region: "Global", role: "Processor", status: "Active" },
  { vendor: "Fly.io", purpose: "Central sign-in service hosting (auth broker)", data: "Session identifiers, auth metadata", region: "US", role: "Processor", status: "Active" },
  { vendor: "Cloudflare R2", purpose: "File/photo storage", data: "Uploaded photos & files", region: "Global", role: "Processor", status: "Active" },
  { vendor: "Firebase / Google", purpose: "Push notifications & services", data: "Device tokens", region: "US", role: "Processor", status: "Active" },
  { vendor: "MailerSend", purpose: "Transactional email & SMS", data: "Email, phone numbers, message content", region: "US/EU", role: "Processor", status: "Active" },
  { vendor: "OpenAI", purpose: "AI photo scope review (customer-uploaded cleaning photos analyzed for scope/quality)", data: "Uploaded photos, related booking metadata", region: "US", role: "Processor", status: "Active" },
  { vendor: "Anthropic", purpose: "AI assistance for background-check adjudication (human-reviewed)", data: "Screening/adjudication data", region: "US", role: "Processor", status: "Active" },
  { vendor: "Twilio", purpose: "Masked voice calling", data: "Phone numbers, call metadata", region: "US", role: "Processor", status: "Optional" },
  { vendor: "Mapbox", purpose: "Map rendering, geocoding, and directions", data: "Address/location data", region: "US", role: "Processor", status: "Active" },
  { vendor: "PostHog", purpose: "Product analytics", data: "Usage & device data", region: "US/EU", role: "Processor", status: "Active" },
  { vendor: "IPinfo", purpose: "IP classification for site analytics & fraud prevention (ISP, VPN/proxy detection)", data: "IP-derived network metadata", region: "US", role: "Processor", status: "Active" },
];

export function Subprocessors() {
  return (
    <DocPage
      title="Subprocessors"
      version={DOC_VERSION}
      intro="This page lists the third-party service providers (subprocessors) Sweepr uses to operate the platform. It supplements the Privacy Policy and any Data Processing Addendum."
      toc={toc}
    >
      <Section id="about" title="1. About This List">
        <p>
          The vendors below help us provide and secure the services. Each vendor
          processes only the data needed for its purpose. For more on how we handle
          data, see the{" "}
          <Link className="text-seafoam-700 underline" to="/privacy">
            Privacy Policy
          </Link>{" "}
          and{" "}
          <Link className="text-seafoam-700 underline" to="/dpa">
            Data Processing Addendum
          </Link>
          .
        </p>
      </Section>

      <Section id="list" title="2. Subprocessors">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-600">
                <th scope="col" className="py-2 pr-4">Vendor</th>
                <th scope="col" className="py-2 pr-4">Purpose</th>
                <th scope="col" className="py-2 pr-4">Data</th>
                <th scope="col" className="py-2 pr-4">Region</th>
                <th scope="col" className="py-2 pr-4">Role</th>
                <th scope="col" className="py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {SUBS.map((s) => (
                <tr key={s.vendor} className="border-b border-slate-100 align-top">
                  <th scope="row" className="py-2 pr-4 text-left font-semibold">{s.vendor}</th>
                  <td className="py-2 pr-4 text-slate-600">{s.purpose}</td>
                  <td className="py-2 pr-4 text-slate-600">{s.data}</td>
                  <td className="py-2 pr-4 text-slate-600">{s.region}</td>
                  <td className="py-2 pr-4 text-slate-600">{s.role}</td>
                  <td className="py-2 text-slate-600">{s.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-slate-500">Last reviewed: {LAST_UPDATED}.</p>
      </Section>

      <Section id="changes" title="3. Changes">
        <p>
          We may add or replace subprocessors as the platform evolves and will
          update this page accordingly. Questions?{" "}
          <a className="text-seafoam-700 underline" href={`mailto:${PRIVACY_EMAIL}`}>
            {PRIVACY_EMAIL}
          </a>
          .
        </p>
      </Section>
    </DocPage>
  );
}

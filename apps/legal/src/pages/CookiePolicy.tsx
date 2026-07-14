/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { DocPage } from "../components/DocPage";
import { Section } from "../components/Section";
import { PRIVACY_EMAIL } from "../docs";

const toc = [
  { id: "what", title: "What Are Cookies" },
  { id: "engine", title: "How Sweepr Manages Cookies" },
  { id: "categories", title: "Cookie Categories" },
  { id: "which", title: "Cookies We Use" },
  { id: "advertising", title: "Advertising Cookies" },
  { id: "gpc", title: "Global Privacy Control" },
  { id: "manage", title: "Managing Cookies" },
  { id: "changes", title: "Changes to This Policy" },
  { id: "contact", title: "Contact" },
];

/** Keep this table in sync with COOKIE_REGISTRY in packages/ui
 * (src/lib/cookieEngine.ts) whenever an integration is added or removed. */
const COOKIE_TABLE: Array<{
  name: string;
  provider: string;
  category: string;
  purpose: string;
  duration: string;
}> = [
  { name: "sweepr_* / __Host-sweepr_*", provider: "Sweepr", category: "Strictly necessary", purpose: "Signed-in session, security state, and your consent record", duration: "Session to 72 hours" },
  { name: "__session, __client, __clerk*", provider: "Clerk", category: "Strictly necessary", purpose: "Authentication (signing you in and keeping you signed in)", duration: "Session to 1 year" },
  { name: "__cf*, cf_clearance", provider: "Cloudflare", category: "Strictly necessary", purpose: "Bot and abuse protection", duration: "Up to 1 year" },
  { name: "__stripe_mid, __stripe_sid, m", provider: "Stripe", category: "Functional (payment security)", purpose: "Fraud prevention on card payments; never used for advertising", duration: "30 minutes to 1 year" },
  { name: "theme, lang", provider: "Sweepr", category: "Functional", purpose: "Light/dark mode and language preferences", duration: "Persistent" },
  { name: "ph_*", provider: "PostHog", category: "Analytics (opt-in)", purpose: "Product analytics: which features are used and where visitors struggle", duration: "Up to 1 year" },
];

export function CookiePolicy() {
  return (
    <DocPage
      title="Cookie Policy"
      intro="This Cookie Policy explains how Sweepr uses cookies and similar technologies, exactly which cookies appear on our sites, and how our consent engine enforces your choices."
      toc={toc}
    >
      <Section id="what" title="1. What Are Cookies">
        <p>
          Cookies are small text files stored on your device that help websites
          function and remember information about your visit. Related
          technologies (such as localStorage) are covered by this policy in the
          same way.
        </p>
      </Section>

      <Section id="engine" title="2. How Sweepr Manages Cookies">
        <p>
          Sweepr operates its own in-house consent and cookie engine rather
          than a third-party consent platform. It works in two directions:
        </p>
        <ul className="list-disc space-y-1 pl-6">
          <li>
            <strong>Before a cookie is written</strong>, our code checks your
            consent for that cookie's category. If you haven't consented, the
            cookie is never set.
          </li>
          <li>
            <strong>After the page loads and continuously afterwards</strong>,
            the engine inventories every cookie present, classifies it against
            our registry, and deletes anything in a category you have declined,
            including cookies dropped by third-party scripts. Cookies our
            registry does not recognize are treated as advertising cookies and
            removed unless you have consented to advertising, so unknown
            cookies fail closed, never open.
          </li>
        </ul>
        <p>
          Your consent choice itself is stored on your device and recorded
          server-side (with a random anonymous identifier, not your name) so we
          can demonstrate the choice you made, as required by GDPR Article 7.
        </p>
      </Section>

      <Section id="categories" title="3. Cookie Categories">
        <ul className="list-disc space-y-1 pl-6">
          <li>
            <strong>Strictly Necessary</strong>, required for the Platform to
            function, including authentication, security, and abuse
            protection. These cannot be disabled.
          </li>
          <li>
            <strong>Functional</strong>, remember your preferences (theme,
            language) and support payment fraud prevention. These keep the
            Platform working correctly and are not used to track you across
            other sites.
          </li>
          <li>
            <strong>Analytics</strong>, help us understand how the Platform is
            used so we can improve it. Off until you opt in.
          </li>
          <li>
            <strong>Advertising</strong>, used to deliver and measure offers.
            Sweepr runs no advertising cookies today; this category exists so
            that if an advertising partner is ever added, its cookies are
            blocked until you consent.
          </li>
        </ul>
      </Section>

      <Section id="which" title="4. Cookies We Use">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-300 dark:border-slate-700">
                <th className="py-2 pr-4 font-semibold">Cookie</th>
                <th className="py-2 pr-4 font-semibold">Provider</th>
                <th className="py-2 pr-4 font-semibold">Category</th>
                <th className="py-2 pr-4 font-semibold">Purpose</th>
                <th className="py-2 font-semibold">Duration</th>
              </tr>
            </thead>
            <tbody>
              {COOKIE_TABLE.map((c) => (
                <tr key={c.name} className="border-b border-slate-200 align-top dark:border-slate-800">
                  <td className="py-2 pr-4 font-mono text-xs">{c.name}</td>
                  <td className="py-2 pr-4">{c.provider}</td>
                  <td className="py-2 pr-4">{c.category}</td>
                  <td className="py-2 pr-4">{c.purpose}</td>
                  <td className="py-2 whitespace-nowrap">{c.duration}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Stripe's fraud-prevention cookies are set when the payment form
          loads. They exist solely to protect you and Sweepr from card fraud;
          Stripe's use of them is described in Stripe's own privacy policy.
        </p>
      </Section>

      <Section id="advertising" title="5. Advertising Cookies">
        <p>
          Sweepr does not currently run advertising or cross-site tracking
          cookies. If we introduce advertising in the future, its cookies will
          be classified under the Advertising category, blocked by default,
          set only after you opt in through the consent manager, and listed in
          the table above before they are activated. Consenting to advertising
          will never be required to use the Platform.
        </p>
      </Section>

      <Section id="gpc" title="6. Global Privacy Control">
        <p>
          We honor the Global Privacy Control (GPC) browser signal as a valid
          opt-out. When your browser sends GPC, analytics and advertising
          cookies are treated as declined automatically, the consent prompt is
          not shown, and the opt-out is recorded, consistent with the
          CCPA/CPRA.
        </p>
      </Section>

      <Section id="manage" title="7. Managing Cookies">
        <p>
          You can manage non-essential cookies through our cookie consent
          manager, shown on your first visit and accessible from the site
          footer, and through your browser settings. Changing your choice takes
          effect immediately: the engine deletes any cookies in categories you
          turn off. Disabling strictly necessary cookies through your browser
          may impair Platform functionality, including the ability to stay
          signed in.
        </p>
      </Section>

      <Section id="changes" title="8. Changes to This Policy">
        <p>
          When we add or remove an integration that sets cookies, we update
          the registry in our cookie engine and the table in this policy
          together. Material changes are announced under our Legal Updates
          Policy.
        </p>
      </Section>

      <Section id="contact" title="9. Contact">
        <p>
          Questions about cookies? Contact{" "}
          <a className="text-seafoam-700 underline" href={`mailto:${PRIVACY_EMAIL}`}>
            {PRIVACY_EMAIL}
          </a>
          .
        </p>
      </Section>
    </DocPage>
  );
}

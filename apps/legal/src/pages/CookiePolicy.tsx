import { DocPage } from "../components/DocPage";
import { Section } from "../components/Section";
import { PRIVACY_EMAIL } from "../docs";

const toc = [
  { id: "what", title: "What Are Cookies" },
  { id: "categories", title: "Cookie Categories" },
  { id: "which", title: "Cookies We Use" },
  { id: "manage", title: "Managing Cookies" },
  { id: "contact", title: "Contact" },
];

export function CookiePolicy() {
  return (
    <DocPage
      title="Cookie Policy"
      intro="This Cookie Policy explains how Sweepr uses cookies and similar technologies."
      toc={toc}
    >
      <Section id="what" title="1. What Are Cookies">
        <p>
          Cookies are small text files stored on your device that help websites
          function and remember information about your visit.
        </p>
      </Section>

      <Section id="categories" title="2. Cookie Categories">
        <ul className="list-disc space-y-1 pl-6">
          <li>
            <strong>Strictly Necessary</strong> — required for the Platform to
            function, including authentication and security. These cannot be
            disabled.
          </li>
          <li>
            <strong>Functional</strong> — remember your preferences (e.g., theme,
            saved addresses).
          </li>
          <li>
            <strong>Analytics</strong> — help us understand how the Platform is
            used so we can improve it.
          </li>
          <li>
            <strong>Marketing</strong> — used to deliver and measure relevant
            offers (only with your consent).
          </li>
        </ul>
      </Section>

      <Section id="which" title="3. Cookies We Use">
        <ul className="list-disc space-y-1 pl-6">
          <li>Session and authentication cookies (Clerk) — strictly necessary;</li>
          <li>Theme and preference cookies — functional;</li>
          <li>Aggregated usage analytics — analytics;</li>
          <li>Fraud-prevention cookies (Stripe) — strictly necessary.</li>
        </ul>
      </Section>

      <Section id="manage" title="4. Managing Cookies">
        <p>
          You can manage non-essential cookies through our cookie consent
          manager, accessible from the site footer, and through your browser
          settings. Disabling strictly necessary cookies may impair Platform
          functionality.
        </p>
      </Section>

      <Section id="contact" title="5. Contact">
        <p>
          Questions about cookies? Contact{" "}
          <a className="text-seafoam-600 underline" href={`mailto:${PRIVACY_EMAIL}`}>
            {PRIVACY_EMAIL}
          </a>
          .
        </p>
      </Section>
    </DocPage>
  );
}

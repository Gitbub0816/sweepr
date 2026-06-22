import { MarketingShell, Button } from "@sweepr/ui";

const updated = "June 21, 2026";

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-10 text-2xl font-bold text-charcoal dark:text-white">
      {children}
    </h2>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-slate-600 dark:text-slate-300">{children}</p>;
}

export default function PrivacyPolicy() {
  return (
    <MarketingShell
      navLinks={[]}
      cta={
        <Button onClick={() => (window.location.href = "/")}>Back home</Button>
      }
    >
      <article className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-4xl font-black text-charcoal dark:text-white">
          Privacy Policy
        </h1>
        <p className="mt-2 text-sm text-slate-400">Last updated: {updated}</p>

        <P>
          This Privacy Policy explains how Sweepr, Inc. ("Sweepr", "we", "us")
          collects, uses, discloses, and protects personal information. It is
          designed to meet the California Consumer Privacy Act (CCPA, Cal. Civ.
          Code &sect; 1798.100 et seq.) and the EU General Data Protection
          Regulation (GDPR, including the disclosures required by Article 13).
        </P>

        <Heading>1. Information We Collect</Heading>
        <P>
          Account data (name, email, phone), booking details (address, home
          details, scheduling), payment information (processed by Stripe — we do
          not store full card numbers), device and usage data, and approximate
          location to match you with nearby cleaners.
        </P>
        <P>
          For cleaners, we additionally process identity verification data via
          Didit and background-check results via Checkr. We retain only the
          verification/candidate identifiers and pass/fail status — we do not
          store the underlying background-check report contents beyond what is
          legally required.
        </P>

        <Heading>2. How We Use Information</Heading>
        <P>
          To provide and improve the service, process payments and payouts,
          match bookings to cleaners, prevent fraud, comply with legal
          obligations, and (with consent) send marketing communications.
        </P>

        <Heading>3. How We Share Information</Heading>
        <P>
          With cleaners assigned to your booking (limited to what's needed to
          perform the job), with service providers (Stripe, Clerk, Mapbox,
          MailerSend, Checkr, Didit, Firebase, Neon), and where required by law.
          We do not sell personal information for monetary value.
        </P>

        <Heading>4. Data Retention</Heading>
        <P>
          Account and booking records are retained for the life of your account
          and up to 7 years thereafter for tax, accounting, and legal purposes.
          Background-check identifiers are retained only as long as required by
          applicable law. You may request deletion at any time (see below).
        </P>

        <Heading>5. Your Rights (CCPA)</Heading>
        <P>
          California residents have the right to know what personal information
          we collect, the right to delete it, the right to correct it, and the
          right to opt out of any sharing for cross-context behavioral
          advertising. We will not discriminate against you for exercising these
          rights.
        </P>

        <Heading>6. Your Rights (GDPR)</Heading>
        <P>
          If you are in the EEA/UK, you have the rights of access, rectification,
          erasure, restriction, portability, and objection, and the right to
          lodge a complaint with a supervisory authority. Our legal bases are
          contract performance, legitimate interests, legal obligation, and
          consent.
        </P>

        <Heading>7. Cookies</Heading>
        <P>
          We use essential cookies to run the service and, with your consent,
          analytics/marketing cookies. You can manage your choices any time via
          the "Cookie Settings" link in the footer.
        </P>

        <Heading>8. Independent Contractor Cleaners</Heading>
        <P>
          Cleaners on Sweepr are independent contractors, not employees. Data
          processing relating to cleaners reflects this relationship.
        </P>

        <Heading>9. Contact</Heading>
        <P>
          To exercise any right or ask a question, contact privacy@getsweepr.com.
          We respond to verifiable requests within the timeframes required by
          law.
        </P>
      </article>
    </MarketingShell>
  );
}

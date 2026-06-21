import { MarketingShell, Button } from "@sweepr/ui";

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

export default function Terms() {
  return (
    <MarketingShell
      navLinks={[]}
      cta={<Button onClick={() => (window.location.href = "/")}>Back home</Button>}
    >
      <article className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-4xl font-black text-charcoal dark:text-white">
          Terms of Service
        </h1>
        <p className="mt-2 text-sm text-slate-400">Last updated: June 21, 2026</p>

        <P>
          These Terms of Service ("Terms") govern your access to and use of
          Sweepr. By using Sweepr you agree to these Terms.
        </P>

        <Heading>1. The Sweepr Marketplace</Heading>
        <P>
          Sweepr is a marketplace that connects customers seeking cleaning
          services with independent cleaning professionals. Sweepr does not
          itself provide cleaning services.
        </P>

        <Heading>2. Independent Contractor Status</Heading>
        <P>
          Cleaners are independent contractors and not employees, agents, or
          partners of Sweepr. Cleaners control the manner and means of providing
          services, supply their own equipment, and are responsible for their own
          taxes. Nothing in these Terms creates an employment, partnership, or
          joint-venture relationship.
        </P>

        <Heading>3. Payments</Heading>
        <P>
          Payments are processed by Stripe. You authorize Sweepr to charge your
          payment method for the total shown at checkout, including the service
          price, the Sweepr service fee, and applicable taxes. Cleaner payouts
          are remitted via Stripe after job completion.
        </P>

        <Heading>4. Cancellations &amp; Refunds</Heading>
        <P>
          You may cancel free of charge up to 24 hours before a scheduled
          cleaning. Later cancellations may incur a fee. If you are not satisfied,
          report it within 48 hours and we will arrange a re-clean or refund at
          our discretion.
        </P>

        <Heading>5. Dispute Resolution</Heading>
        <P>
          Disputes between customers and cleaners are first handled through
          Sweepr support. Any dispute with Sweepr will be resolved by binding
          arbitration on an individual basis, except where prohibited by law.
        </P>

        <Heading>6. Limitation of Liability</Heading>
        <P>
          To the maximum extent permitted by law, Sweepr is not liable for
          indirect, incidental, or consequential damages. Our aggregate liability
          will not exceed the amounts you paid to Sweepr in the 12 months
          preceding the claim.
        </P>

        <Heading>7. Governing Law</Heading>
        <P>
          These Terms are governed by the laws of the State of California,
          without regard to conflict-of-laws principles.
        </P>

        <Heading>8. Changes</Heading>
        <P>
          We may update these Terms. Material changes will be communicated, and
          continued use after changes constitutes acceptance.
        </P>
      </article>
    </MarketingShell>
  );
}

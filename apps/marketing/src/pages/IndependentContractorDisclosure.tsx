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

export default function IndependentContractorDisclosure() {
  return (
    <MarketingShell
      navLinks={[]}
      cta={<Button onClick={() => (window.location.href = "/")}>Back home</Button>}
    >
      <article className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-4xl font-black text-charcoal dark:text-white">
          Independent Contractor Disclosure
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          Required gig-economy disclosure
        </p>

        <P>
          This disclosure is provided to cleaners ("you") who offer services
          through the Sweepr marketplace, in the interest of transparency and to
          support compliance with applicable independent-contractor laws
          (including California AB5 and similar frameworks).
        </P>

        <Heading>You Are an Independent Contractor</Heading>
        <P>
          When you accept jobs on Sweepr, you do so as an independent contractor
          running your own cleaning business. You are not an employee of Sweepr.
        </P>

        <Heading>What This Means</Heading>
        <P>
          You decide which jobs to accept and when to work. You control how you
          perform the work and supply your own equipment and cleaning products.
          You are responsible for your own income and self-employment taxes, and
          for maintaining any licenses or insurance required in your area. You are
          free to provide services to other platforms or clients.
        </P>

        <Heading>What Sweepr Provides</Heading>
        <P>
          Sweepr provides the marketplace technology that connects you with
          customers, handles payment collection and payout, and offers support
          tools. Sweepr does not direct the details of how you clean.
        </P>

        <Heading>Acknowledgement</Heading>
        <P>
          By completing cleaner onboarding you acknowledge that you have read and
          understand this disclosure and agree to your status as an independent
          contractor.
        </P>
      </article>
    </MarketingShell>
  );
}

// DRAFT — attorney review required before production use.
import { Link } from "react-router-dom";
import { DocPage } from "../components/DocPage";
import { Section } from "../components/Section";
import { PRIVACY_EMAIL, DOC_VERSION } from "../docs";

const toc = [
  { id: "intro", title: "About This Notice" },
  { id: "categories", title: "Categories Collected" },
  { id: "sensitive", title: "Sensitive Personal Information" },
  { id: "purposes", title: "Purposes" },
  { id: "retention", title: "Retention" },
  { id: "sale", title: "Sale / Sharing" },
  { id: "rights", title: "Your Rights" },
];

function Row({ c, ex }: { c: string; ex: string }) {
  return (
    <tr className="border-b border-slate-100 align-top">
      <td className="py-2 pr-4 font-semibold">{c}</td>
      <td className="py-2 text-slate-600">{ex}</td>
    </tr>
  );
}

export function NoticeAtCollection() {
  return (
    <DocPage
      title="California Notice at Collection"
      version={DOC_VERSION}
      intro="This notice describes the categories of personal information Sweepr collects and the purposes for which they are used, as required by the California Consumer Privacy Act (CCPA/CPRA). It supplements the Privacy Policy."
      toc={toc}
    >
      <Section id="intro" title="1. About This Notice">
        <p>
          This Notice at Collection is provided at or before the point of
          collection. For full details on sources, disclosures, and rights, see the{" "}
          <Link className="text-seafoam-600 underline" to="/privacy">
            Privacy Policy
          </Link>
          .
        </p>
      </Section>

      <Section id="categories" title="2. Categories of Personal Information Collected">
        <table className="w-full border-collapse text-sm">
          <tbody>
            <Row c="Identifiers" ex="Name, email, phone, account ID, IP address." />
            <Row c="Customer records" ex="Billing details, payment tokens (via Stripe), service address." />
            <Row c="Commercial information" ex="Bookings, service history, transactions." />
            <Row c="Geolocation" ex="Service-address geocoding; Cleaner location during active jobs." />
            <Row c="Visual information" ex="Profile photos and before/after cleaning photos." />
            <Row c="Internet activity" ex="App/site usage, device and analytics data." />
            <Row c="Professional / verification" ex="Cleaner onboarding, identity and background-check status." />
          </tbody>
        </table>
      </Section>

      <Section id="sensitive" title="3. Sensitive Personal Information">
        <p>
          Sweepr may process certain sensitive personal information, including
          precise geolocation (for Cleaners during active jobs and for service-area
          geocoding) and identity-verification data handled by our vendors. Sweepr
          does not use sensitive personal information for purposes that would
          require an opt-out right beyond providing and securing the services.
        </p>
      </Section>

      <Section id="purposes" title="4. Purposes">
        <ul className="list-disc space-y-1 pl-6">
          <li>Provide, match, and operate the cleaning marketplace;</li>
          <li>Process payments and payouts;</li>
          <li>Safety, fraud prevention, and dispute/claims handling;</li>
          <li>Communications and service updates;</li>
          <li>Legal compliance.</li>
        </ul>
      </Section>

      <Section id="retention" title="5. Retention">
        <p>
          We retain each category for as long as needed for the purposes above and
          to meet legal, tax, safety, and dispute obligations, then delete or
          de-identify it. See the{" "}
          <Link className="text-seafoam-600 underline" to="/privacy">
            Privacy Policy
          </Link>{" "}
          for details.
        </p>
      </Section>

      <Section id="sale" title="6. Sale / Sharing">
        <p>
          Sweepr does not sell or share personal information as those terms are
          defined under California law. We honor Global Privacy Control signals
          where applicable.
        </p>
      </Section>

      <Section id="rights" title="7. Your Rights">
        <p>
          California residents may request to know, delete, or correct their
          personal information, and may use an authorized agent. To exercise
          rights, use the in-app privacy controls or contact{" "}
          <a className="text-seafoam-600 underline" href={`mailto:${PRIVACY_EMAIL}`}>
            {PRIVACY_EMAIL}
          </a>
          .
        </p>
      </Section>
    </DocPage>
  );
}

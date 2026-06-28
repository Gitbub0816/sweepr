// DRAFT — attorney review required before production use.
import { Link } from "react-router-dom";
import { DocPage } from "../components/DocPage";
import { Section } from "../components/Section";
import { SUPPORT_EMAIL, DOC_VERSION } from "../docs";

const toc = [
  { id: "standard", title: "Standard Cleaning" },
  { id: "deep", title: "Deep Cleaning" },
  { id: "move", title: "Move-In / Move-Out" },
  { id: "recurring", title: "Recurring Cleaning" },
  { id: "excluded", title: "Excluded Services" },
  { id: "fragile", title: "Fragile & Specialty Surfaces" },
  { id: "limits", title: "Safety & Physical Limits" },
  { id: "addons", title: "Requesting Add-Ons" },
];

export function ServiceScopePolicy() {
  return (
    <DocPage
      title="Service Scope Policy"
      version={DOC_VERSION}
      intro="This policy describes what is and is not included in a Sweepr cleaning. It is intended to set clear expectations for customers and Cleaners and to reduce disputes."
      toc={toc}
    >
      <Section id="standard" title="1. Standard Cleaning — Typical Inclusions">
        <ul className="list-disc space-y-1 pl-6">
          <li>Dusting accessible surfaces, sills, and fixtures;</li>
          <li>Vacuuming and mopping floors;</li>
          <li>Kitchen counters, sinks, exterior of appliances, stovetop;</li>
          <li>Bathroom sinks, toilets, showers/tubs, mirrors;</li>
          <li>Emptying trash and general tidying of cleaned areas.</li>
        </ul>
      </Section>

      <Section id="deep" title="2. Deep Cleaning — Additional Inclusions">
        <p>
          Deep cleaning includes standard cleaning plus more detailed work such
          as baseboards, door frames, additional grime removal, and more
          attention to build-up. Specific inclusions are shown at booking.
        </p>
      </Section>

      <Section id="move" title="3. Move-In / Move-Out Cleaning">
        <p>
          Move-in/move-out cleaning assumes an empty or near-empty home and may
          include interior of cabinets and appliances where selected. It does not
          include repairs, painting, or removal of large debris.
        </p>
      </Section>

      <Section id="recurring" title="4. Recurring Cleaning">
        <p>
          Recurring cleanings maintain a home cleaned to standard. The first
          visit of a heavily soiled home may require a deep clean. See{" "}
          <Link className="text-seafoam-600 underline" to="/subscription-terms">
            Subscription Terms
          </Link>
          .
        </p>
      </Section>

      <Section id="excluded" title="5. Excluded Services">
        <p>Unless expressly purchased as an add-on, cleanings do not include:</p>
        <ul className="list-disc space-y-1 pl-6">
          <li>Biohazards, bodily fluids, or animal waste;</li>
          <li>Mold remediation;</li>
          <li>Pest, insect, or rodent removal;</li>
          <li>Hoarding or unsafe-condition cleanup;</li>
          <li>Heavy lifting of furniture or items beyond reasonable limits;</li>
          <li>Work requiring ladders or heights beyond a small step stool;</li>
          <li>Exterior windows or exterior surfaces;</li>
          <li>Hazardous chemicals or illegal substances;</li>
          <li>Interior of appliances unless selected as an add-on;</li>
          <li>Laundry or dishes unless selected as an add-on.</li>
        </ul>
      </Section>

      <Section id="fragile" title="6. Fragile & Specialty Surfaces">
        <p>
          Antiques, marble, natural stone, hardwood, electronics, art, and
          musical instruments may require specialized care. Cleaners may decline
          to clean specialty surfaces to avoid damage. Customers should disclose
          and, where appropriate, protect such items in advance.
        </p>
      </Section>

      <Section id="limits" title="7. Safety & Physical Limits">
        <p>
          Cleaners may skip unsafe areas and are not required to move heavy items,
          clean unsafe heights, or handle hazardous materials. See the{" "}
          <Link className="text-seafoam-600 underline" to="/trust-safety">
            Trust &amp; Safety Policy
          </Link>
          .
        </p>
      </Section>

      <Section id="addons" title="8. Requesting Add-Ons">
        <p>
          Additional tasks (such as inside oven, inside fridge, interior windows,
          laundry, or pet-hair removal) may be added at booking for an additional
          charge. Add-ons requested on-site may not be accommodated and may affect
          price and payout. Pricing is described in the{" "}
          <Link className="text-seafoam-600 underline" to="/platform-fee-policy">
            Platform Fee Policy
          </Link>
          .
        </p>
        <p>
          Questions? Contact{" "}
          <a className="text-seafoam-600 underline" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </Section>
    </DocPage>
  );
}

import { DocPage } from "../components/DocPage";
import { Section } from "../components/Section";
import { COMPANY_NAME, CONTACT_EMAIL } from "../docs";

const toc = [
  { id: "license", title: "License Grant" },
  { id: "restrictions", title: "Restrictions" },
  { id: "ownership", title: "Ownership" },
  { id: "updates", title: "Updates" },
  { id: "termination", title: "Termination" },
  { id: "warranty", title: "No Warranty" },
  { id: "contact", title: "Contact" },
];

export function EULA() {
  return (
    <DocPage
      title="End User License Agreement"
      intro={`This End User License Agreement ("EULA") governs your use of the Sweepr applications and software provided by ${COMPANY_NAME}.`}
      toc={toc}
    >
      <Section id="license" title="1. License Grant">
        <p>
          Subject to your compliance with this EULA and our Terms of Service,
          Sweepr grants you a limited, non-exclusive, non-transferable,
          revocable license to download, install, and use the Sweepr
          applications for your personal or business use of the Platform.
        </p>
      </Section>

      <Section id="restrictions" title="2. Restrictions">
        <p>You may not:</p>
        <ul className="list-disc space-y-1 pl-6">
          <li>Reverse engineer, decompile, or disassemble the software;</li>
          <li>Copy, modify, or create derivative works of the software;</li>
          <li>Rent, lease, sell, or sublicense the software;</li>
          <li>Remove proprietary notices or labels.</li>
        </ul>
      </Section>

      <Section id="ownership" title="3. Ownership">
        <p>
          The software is licensed, not sold. {COMPANY_NAME} retains all right,
          title, and interest in and to the software and all related
          intellectual property.
        </p>
      </Section>

      <Section id="updates" title="4. Updates">
        <p>
          We may provide updates, patches, and new versions of the software.
          This EULA governs any such updates unless they are accompanied by a
          separate license.
        </p>
      </Section>

      <Section id="termination" title="5. Termination">
        <p>
          This license terminates automatically if you breach this EULA. Upon
          termination, you must cease use and delete the software.
        </p>
      </Section>

      <Section id="warranty" title="6. No Warranty">
        <p>
          THE SOFTWARE IS PROVIDED "AS IS" WITHOUT WARRANTY OF ANY KIND. TO THE
          EXTENT PERMITTED BY LAW, SWEEPR DISCLAIMS ALL WARRANTIES, EXPRESS OR
          IMPLIED.
        </p>
      </Section>

      <Section id="contact" title="7. Contact">
        <p>
          Questions? Contact{" "}
          <a className="text-seafoam-600 underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </Section>
    </DocPage>
  );
}

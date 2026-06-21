import { DocPage } from "../components/DocPage";
import { Section } from "../components/Section";
import { STATE_OF_INCORPORATION, SUPPORT_EMAIL } from "../docs";

const toc = [
  { id: "informal", title: "Informal Resolution" },
  { id: "arbitration", title: "Binding Arbitration" },
  { id: "classwaiver", title: "Class Action Waiver" },
  { id: "exceptions", title: "Exceptions" },
  { id: "governing", title: "Governing Law" },
];

export function DisputeResolution() {
  return (
    <DocPage
      title="Dispute Resolution"
      intro="This policy describes how disputes between you and Sweepr are resolved. Please read it carefully, as it affects your legal rights."
      toc={toc}
    >
      <Section id="informal" title="1. Informal Resolution First">
        <p>
          Before initiating formal proceedings, you agree to first contact our
          support team at{" "}
          <a className="text-seafoam-600 underline" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>{" "}
          and attempt to resolve the dispute informally. Most issues can be
          resolved quickly this way.
        </p>
      </Section>

      <Section id="arbitration" title="2. Binding Arbitration">
        <p>
          If informal resolution fails, any dispute arising out of or relating to
          the Platform or these policies shall be resolved by binding
          arbitration administered by JAMS in {STATE_OF_INCORPORATION}, under its
          applicable rules. The arbitrator's decision is final and binding. You
          and Sweepr waive the right to a trial by jury.
        </p>
      </Section>

      <Section id="classwaiver" title="3. Class Action Waiver">
        <p>
          You and Sweepr agree that each may bring claims against the other only
          in an individual capacity, and not as a plaintiff or class member in
          any purported class or representative proceeding.
        </p>
      </Section>

      <Section id="exceptions" title="4. Exceptions">
        <p>
          Notwithstanding the above, either party may: (a) bring an individual
          claim in small claims court; and (b) seek injunctive or equitable
          relief in a court of competent jurisdiction for intellectual property
          disputes or unauthorized use of the Platform.
        </p>
      </Section>

      <Section id="governing" title="5. Governing Law">
        <p>
          This policy is governed by the laws of the State of{" "}
          {STATE_OF_INCORPORATION}, except that arbitration is governed by the
          Federal Arbitration Act.
        </p>
      </Section>
    </DocPage>
  );
}

import { DocPage } from "../components/DocPage";
import { Section } from "../components/Section";
import { SUPPORT_EMAIL } from "../docs";

const toc = [
  { id: "program", title: "Program Description" },
  { id: "optin", title: "Opt-In" },
  { id: "optout", title: "Opt-Out" },
  { id: "help", title: "Help" },
  { id: "frequency", title: "Message Frequency" },
  { id: "rates", title: "Carrier Rates" },
  { id: "carriers", title: "Supported Carriers" },
  { id: "privacy", title: "Privacy" },
];

export function SMSPolicy() {
  return (
    <DocPage
      title="SMS Policy"
      intro="This SMS Policy describes Sweepr's text messaging program and is provided to comply with the Telephone Consumer Protection Act (TCPA) and carrier requirements."
      toc={toc}
    >
      <Section id="program" title="1. Program Description">
        <p>
          Sweepr sends text (SMS) messages related to your use of the Platform,
          including booking confirmations, cleaner notifications and offers,
          status updates (e.g., "your cleaner is on the way"), and, where you
          have consented, promotional offers.
        </p>
      </Section>

      <Section id="optin" title="2. Opt-In">
        <p>
          By providing your mobile number and checking the opt-in box, you
          expressly consent to receive text messages from Sweepr at the number
          provided, including messages sent using an automatic telephone dialing
          system. Consent is not a condition of purchase.
        </p>
      </Section>

      <Section id="optout" title="3. Opt-Out">
        <p>
          Reply <strong>STOP</strong> to any message to opt out. You will
          receive one confirmation message, after which no further messages will
          be sent. You may also opt out by contacting support.
        </p>
      </Section>

      <Section id="help" title="4. Help">
        <p>
          Reply <strong>HELP</strong> for help, or contact{" "}
          <a className="text-seafoam-600 underline" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </Section>

      <Section id="frequency" title="5. Message Frequency">
        <p>
          Message frequency varies based on your activity. You may receive up to
          several messages per booking (for example, confirmation, reminder, en
          route, and completion notifications).
        </p>
      </Section>

      <Section id="rates" title="6. Carrier Rates">
        <p>Message and data rates may apply, according to your mobile plan.</p>
      </Section>

      <Section id="carriers" title="7. Supported Carriers">
        <p>
          Supported carriers include major US carriers such as AT&amp;T, Verizon,
          T-Mobile, and their affiliates and resellers. Carriers are not liable
          for delayed or undelivered messages.
        </p>
      </Section>

      <Section id="privacy" title="8. Privacy">
        <p>
          Your mobile number will not be shared with third parties for marketing
          purposes. See our{" "}
          <a className="text-seafoam-600 underline" href="/privacy">
            Privacy Policy
          </a>{" "}
          for details on how we handle your information.
        </p>
      </Section>
    </DocPage>
  );
}

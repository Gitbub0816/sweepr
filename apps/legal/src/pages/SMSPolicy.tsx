import { DocPage } from "../components/DocPage";
import { Section } from "../components/Section";
import { COMPANY_NAME, SUPPORT_EMAIL, LEGAL_URL, SMS_SHORT_CODE } from "../docs";

const toc = [
  { id: "overview",   title: "1. Program Overview" },
  { id: "optin",      title: "2. How to Opt In" },
  { id: "messages",   title: "3. Message Types & Frequency" },
  { id: "rates",      title: "4. Message & Data Rates" },
  { id: "optout",     title: "5. How to Opt Out" },
  { id: "help",       title: "6. Help" },
  { id: "carriers",   title: "7. Carrier Limitations" },
  { id: "privacy",    title: "8. Privacy" },
  { id: "contact",    title: "9. Contact" },
];

export function SMSPolicy() {
  return (
    <DocPage
      title="SMS Policy"
      intro={`This SMS Policy describes the text messaging program operated by ${COMPANY_NAME} ("Sweepr," "we," "us," or "our") and is provided in compliance with the Telephone Consumer Protection Act (TCPA), 47 U.S.C. § 227, and applicable carrier requirements.`}
      toc={toc}
    >
      <Section id="overview" title="1. Program Overview">
        <p><strong>1.1</strong> Sweepr operates an SMS messaging program (the "Program") to communicate with registered users regarding their use of the Sweepr Platform.</p>
        <p><strong>1.2</strong> The Program name and sender identifier is <strong>{SMS_SHORT_CODE}</strong>.</p>
        <p><strong>1.3</strong> Participation in the Program requires express written consent. <strong>Consent to receive SMS messages is never a condition of purchase or use of the Sweepr Platform.</strong></p>
      </Section>

      <Section id="optin" title="2. How to Opt In">
        <p><strong>2.1</strong> To enroll in the Program, you must affirmatively check the SMS opt-in box during account registration or in your account settings and provide a valid U.S. mobile telephone number.</p>
        <p><strong>2.2</strong> By opting in, you expressly consent to receive text messages from Sweepr at the mobile number provided, including messages that may be sent using an automatic telephone dialing system or pre-recorded voice, subject to applicable law.</p>
        <p><strong>2.3</strong> The opt-in checkbox is never pre-checked. Consent must be affirmatively given.</p>
      </Section>

      <Section id="messages" title="3. Message Types and Frequency">
        <p><strong>3.1</strong> Messages sent through the Program may include:</p>
        <ul className="list-disc space-y-1 pl-6">
          <li>Booking confirmations and reminders;</li>
          <li>Cleaner dispatch and en-route notifications;</li>
          <li>Booking completion and review requests;</li>
          <li>Account alerts (e.g., payment updates, scheduling changes);</li>
          <li>Promotional offers and service announcements (only where you have separately consented to marketing messages).</li>
        </ul>
        <p><strong>3.2</strong> Message frequency varies based on your account activity. You may receive up to five (5) or more messages per Booking (e.g., confirmation, reminder, cleaner en route, completion, review request). Promotional messages, if opted in, may be sent up to four (4) times per month.</p>
      </Section>

      <Section id="rates" title="4. Message and Data Rates">
        <p><strong>4.1</strong> Message and data rates may apply according to your mobile carrier plan. Sweepr does not charge separately for SMS messages; however, your carrier's standard messaging rates apply.</p>
        <p><strong>4.2</strong> You are solely responsible for any charges imposed by your mobile carrier.</p>
      </Section>

      <Section id="optout" title="5. How to Opt Out">
        <p><strong>5.1</strong> You may opt out of the Program at any time by:</p>
        <ul className="list-disc space-y-1 pl-6">
          <li>Replying <strong>STOP</strong> to any message from Sweepr;</li>
          <li>Updating your communication preferences in your account settings; or</li>
          <li>Contacting support at <a className="text-seafoam-600 underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</li>
        </ul>
        <p><strong>5.2</strong> After you reply STOP, you will receive a single confirmation message confirming your opt-out. No further messages will be sent to that number unless you re-enroll.</p>
        <p><strong>5.3</strong> Opting out of marketing messages does not affect transactional messages necessary for the performance of a confirmed Booking (e.g., cleaner en-route notifications), which may be sent pursuant to our legitimate interest in fulfilling your service contract.</p>
      </Section>

      <Section id="help" title="6. Help">
        <p><strong>6.1</strong> Reply <strong>HELP</strong> to any Sweepr message to receive assistance information.</p>
        <p><strong>6.2</strong> For additional support, contact us at <a className="text-seafoam-600 underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</p>
      </Section>

      <Section id="carriers" title="7. Carrier Limitations">
        <p><strong>7.1</strong> Supported carriers include major U.S. carriers including AT&amp;T, Verizon, T-Mobile, US Cellular, and their affiliates and resellers.</p>
        <p><strong>7.2</strong> Carriers are not liable for delayed or undelivered messages. Sweepr is not responsible for any delays or failures in message delivery caused by carrier routing, network conditions, or other factors outside our control.</p>
      </Section>

      <Section id="privacy" title="8. Privacy">
        <p><strong>8.1</strong> Your mobile number and SMS consent status are stored securely and used only as described in this Policy and our <a className="text-seafoam-600 underline" href={`${LEGAL_URL}/privacy`}>Privacy Policy</a>.</p>
        <p><strong>8.2</strong> We do not share your mobile number with unaffiliated third parties for their own marketing purposes. Your number may be shared with SMS delivery providers (e.g., Twilio) solely to transmit messages on our behalf.</p>
      </Section>

      <Section id="contact" title="9. Contact">
        <p>
          For questions or concerns regarding this SMS Policy, contact us at{" "}
          <a className="text-seafoam-600 underline" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </Section>
    </DocPage>
  );
}

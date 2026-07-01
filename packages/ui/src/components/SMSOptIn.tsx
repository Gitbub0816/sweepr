export interface SMSOptInProps {
  value: boolean;
  onChange: (opted: boolean) => void;
  /** Base URL of the legal site for the SMS policy link. */
  legalUrl?: string;
}

/**
 * TCPA-compliant SMS opt-in. The checkbox is NEVER pre-checked — express
 * consent must be affirmatively given by the user.
 */
export function SMSOptIn({ value, onChange, legalUrl }: SMSOptInProps) {
  const base = legalUrl ?? "https://legal.getsweepr.com";
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-700">
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-seafoam-500 focus:ring-seafoam-400"
      />
      <span className="text-slate-600 dark:text-slate-300">
        I agree to receive text message updates about my bookings from Sweepr.
        Message and data rates may apply. Reply STOP to opt out.{" "}
        <a
          href={`${base}/sms-policy`}
          target="_blank"
          rel="noreferrer"
          className="text-seafoam-600 underline"
        >
          SMS Policy
        </a>{" "}
        ·{" "}
        <a
          href={`${base}/privacy`}
          target="_blank"
          rel="noreferrer"
          className="text-seafoam-600 underline"
        >
          Privacy
        </a>
      </span>
    </label>
  );
}

export interface SMSOptInProps {
  value: boolean;
  onChange: (opted: boolean) => void;
  /** Base URL of the legal site for the policy links. */
  legalUrl?: string;
}

/**
 * TCPA/A2P-compliant SMS opt-in. The checkbox is NEVER pre-checked — express
 * consent must be affirmatively given by the user, and consent is not a
 * condition of using Sweepr.
 */
export function SMSOptIn({ value, onChange, legalUrl }: SMSOptInProps) {
  const base = legalUrl ?? "https://legal.getsweepr.com";
  const link = "text-seafoam-600 underline";
  return (
    <div className="space-y-2">
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-700">
        <input
          type="checkbox"
          checked={value}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-seafoam-500 focus:ring-seafoam-400"
        />
        <span className="text-slate-600 dark:text-slate-300">
          I agree to receive SMS messages from Sweepr regarding account
          verification, one-time passcodes (OTP), booking confirmations,
          cleaner assignment, arrival notifications, service updates, receipts,
          and customer support. Message frequency varies. Message and data
          rates may apply. Reply STOP to opt out or HELP for assistance.
        </span>
      </label>
      <p className="px-1 text-xs text-slate-400 dark:text-slate-500">
        By continuing you agree to the{" "}
        <a href={`${base}/terms`} target="_blank" rel="noreferrer" className={link}>
          Terms of Service
        </a>
        ,{" "}
        <a href={`${base}/privacy`} target="_blank" rel="noreferrer" className={link}>
          Privacy Policy
        </a>{" "}
        and{" "}
        <a href={`${base}/sms/consent`} target="_blank" rel="noreferrer" className={link}>
          SMS Consent Policy
        </a>
        .
      </p>
    </div>
  );
}

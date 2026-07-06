import { useNavigate } from "react-router-dom";
import { Mail } from "lucide-react";
import { buildMailDeepLink } from "./emailReporter";

/**
 * "Email reporter" — a mailto-like button that deep-links into the admin Mail
 * tab with the reporter's address, a Re: [CASE-CODE] subject, and a body
 * (either a chosen response-template body or a generic greeting) prefilled.
 * This REPLACES inline "send email from this console" flows — all outgoing
 * mail is composed/sent from the Mail tab so it lands in one place.
 */
export function EmailReporterButton({
  box,
  to,
  caseCode,
  subject,
  body,
  disabled,
  className,
}: {
  box: "it" | "security";
  to: string | null | undefined;
  caseCode?: string | null;
  subject?: string | null;
  body?: string | null;
  disabled?: boolean;
  className?: string;
}) {
  const navigate = useNavigate();
  const isDisabled = disabled || !to;
  return (
    <button
      type="button"
      disabled={isDisabled}
      aria-label={to ? `Email reporter at ${to}` : "No reporter email on file"}
      title={to ? `Email ${to}` : "No reporter email on file"}
      onClick={() => {
        if (!to) return;
        navigate(buildMailDeepLink({ box, to, caseCode, subject, body }));
      }}
      className={
        className ??
        "flex items-center gap-1.5 rounded-lg bg-seafoam-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-seafoam-600 disabled:cursor-not-allowed disabled:opacity-50"
      }
    >
      <Mail className="h-4 w-4" aria-hidden="true" /> Email reporter
    </button>
  );
}

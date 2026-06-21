import { useRef, useState } from "react";
import { CheckCircle2, ShieldCheck, Upload } from "lucide-react";
import { Input, Select } from "@sweepr/ui";

export const US_STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado",
  "Connecticut", "Delaware", "Florida", "Georgia", "Hawaii", "Idaho",
  "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine",
  "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi",
  "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey",
  "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio",
  "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina",
  "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia",
  "Washington", "West Virginia", "Wisconsin", "Wyoming",
] as const;

export const EIN_REGEX = /^\d{2}-\d{7}$/;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

function formatEin(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 9);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}-${digits.slice(2)}`;
}

function FileUpload({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string;
  onChange: (name: string) => void;
  required?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-5 text-sm text-slate-400 transition-colors hover:border-seafoam-400 dark:border-slate-700"
      >
        {value ? (
          <span className="flex items-center gap-2 text-seafoam-600">
            <CheckCircle2 className="h-5 w-5" /> {value}
          </span>
        ) : (
          <>
            <Upload className="h-5 w-5" />
            <span>
              {label}
              {required ? " *" : " (optional)"}
            </span>
            <span className="text-xs">Image or PDF, max 10MB</span>
          </>
        )}
      </button>
      {error && <p className="mt-1 text-xs text-rose-500">{error}</p>}
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          if (file.size > MAX_FILE_BYTES) {
            setError("File exceeds the 10MB limit.");
            return;
          }
          setError("");
          // In production: request a Firebase signed URL and upload directly.
          onChange(file.name);
        }}
      />
    </div>
  );
}

export interface BusinessVerificationValue {
  ein: string;
  legalName: string;
  stateOfIncorporation: string;
  articlesDoc: string;
  einDoc: string;
  insuranceDoc: string;
}

export function BusinessVerificationStep({
  n,
  value,
  onChange,
}: {
  n: number;
  value: BusinessVerificationValue;
  onChange: (next: Partial<BusinessVerificationValue>) => void;
}) {
  const einValid = value.ein === "" || EIN_REGEX.test(value.ein);
  return (
    <div className="space-y-4">
      <div className="mb-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-seafoam-600">
          Step {n}
        </span>
        <h2 className="mt-1 text-xl font-bold text-charcoal dark:text-white">
          Business verification
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Verify your business so you can receive payouts.
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-xl bg-seafoam-50 p-4 text-sm text-seafoam-800 dark:bg-seafoam-900/20 dark:text-seafoam-200">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
        <p>
          Your business information is reviewed by our team and verified through
          Stripe's Know Your Business (KYB) process. This is required to receive
          payouts.
        </p>
      </div>

      <Input
        label="EIN (Employer Identification Number)"
        placeholder="12-3456789"
        inputMode="numeric"
        value={value.ein}
        onChange={(e) => onChange({ ein: formatEin(e.target.value) })}
        hint={
          einValid
            ? "Format: XX-XXXXXXX. Sent securely to Stripe; never stored."
            : undefined
        }
        error={!einValid ? "EIN must be in the format XX-XXXXXXX." : undefined}
      />
      <Input
        label="Business legal name"
        value={value.legalName}
        onChange={(e) => onChange({ legalName: e.target.value })}
      />
      <Select
        label="State of incorporation"
        placeholder="Select a state"
        options={US_STATES.map((s) => ({ value: s, label: s }))}
        value={value.stateOfIncorporation}
        onChange={(e) => onChange({ stateOfIncorporation: e.target.value })}
      />

      <FileUpload
        label="Upload Articles of Incorporation or Business License"
        required
        value={value.articlesDoc}
        onChange={(name) => onChange({ articlesDoc: name })}
      />
      <FileUpload
        label="Upload Proof of EIN (IRS EIN letter or SS-4)"
        required
        value={value.einDoc}
        onChange={(name) => onChange({ einDoc: name })}
      />
      <FileUpload
        label="Business liability insurance certificate"
        value={value.insuranceDoc}
        onChange={(name) => onChange({ insuranceDoc: name })}
      />
    </div>
  );
}

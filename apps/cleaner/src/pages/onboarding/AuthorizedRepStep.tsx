/**
 * Authorized representative step — business onboarding.
 *
 * We collect only name, title, email, and phone here.
 * DOB, SSN, and address are collected directly by Checkr's hosted form
 * in the subsequent Background Check step — they never pass through Sweepr.
 */
import { Info } from "lucide-react";
import { Input, Select } from "@sweepr/ui";

export interface AuthorizedRepValue {
  name: string;
  title: string;
  email: string;
  phone: string;
}

const TITLES = [
  { value: "Owner", label: "Owner" },
  { value: "Manager", label: "Manager" },
  { value: "Authorized Signatory", label: "Authorized Signatory" },
];

export function AuthorizedRepStep({
  n,
  value,
  onChange,
}: {
  n: number;
  value: AuthorizedRepValue;
  onChange: (next: Partial<AuthorizedRepValue>) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="mb-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-seafoam-600">
          Step {n}
        </span>
        <h2 className="mt-1 text-xl font-bold text-charcoal dark:text-white">
          Authorized representative
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          The owner or manager who will manage this account.
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-xl bg-seafoam-50 p-4 text-sm text-seafoam-800 dark:bg-seafoam-900/20 dark:text-seafoam-200">
        <Info className="mt-0.5 h-5 w-5 shrink-0" />
        <p>
          This person will undergo a background check in the next step. Their
          date of birth, SSN, and address will be collected securely by our
          background-check partner Checkr — they never pass through Sweepr.
        </p>
      </div>

      <Input
        label="Full legal name"
        value={value.name}
        onChange={(e) => onChange({ name: e.target.value })}
        autoComplete="name"
      />
      <Select
        label="Job title"
        placeholder="Select a title"
        options={TITLES}
        value={value.title}
        onChange={(e) => onChange({ title: e.target.value })}
      />
      <Input
        label="Email"
        type="email"
        value={value.email}
        onChange={(e) => onChange({ email: e.target.value })}
        hint="Checkr will send the background check invitation to this address."
        autoComplete="email"
      />
      <Input
        label="Phone"
        value={value.phone}
        onChange={(e) => onChange({ phone: e.target.value })}
        placeholder="(555) 123-4567"
        autoComplete="tel"
      />
    </div>
  );
}

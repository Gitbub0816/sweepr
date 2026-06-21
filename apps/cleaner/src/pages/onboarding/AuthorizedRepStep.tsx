import { Info } from "lucide-react";
import { Input, Select } from "@sweepr/ui";

export interface AuthorizedRepValue {
  name: string;
  title: string;
  email: string;
  phone: string;
  dob: string;
  address: string;
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
          This person will be the primary point of contact and will undergo a
          background check and identity verification.
        </p>
      </div>

      <Input
        label="Full legal name"
        value={value.name}
        onChange={(e) => onChange({ name: e.target.value })}
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
      />
      <Input
        label="Phone"
        value={value.phone}
        onChange={(e) => onChange({ phone: e.target.value })}
        placeholder="(555) 123-4567"
      />
      <Input
        label="Date of birth"
        type="date"
        value={value.dob}
        onChange={(e) => onChange({ dob: e.target.value })}
        hint="Required for the background check."
      />
      <Input
        label="Home address"
        value={value.address}
        onChange={(e) => onChange({ address: e.target.value })}
        hint="Required for the background check."
      />
    </div>
  );
}

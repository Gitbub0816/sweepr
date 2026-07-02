import { useState } from "react";
import { useUser } from "@clerk/clerk-react";
import { Card, Input, Button, toast } from "@sweepr/ui";
import { Mail, Phone } from "lucide-react";

type Kind = "email" | "phone";

/**
 * Change email or phone with Clerk verification (OTP). New contact is only made
 * primary after the code is verified, so ownership is always proven.
 */
export function ContactSettings() {
  const { user } = useUser();
  if (!user) return null;

  const currentEmail = user.primaryEmailAddress?.emailAddress ?? "—";
  const currentPhone = user.primaryPhoneNumber?.phoneNumber ?? "—";

  return (
    <Card className="space-y-6">
      <h3 className="font-semibold text-charcoal dark:text-white">Contact details</h3>
      <ChangeField kind="email" current={currentEmail} />
      <ChangeField kind="phone" current={currentPhone} />
    </Card>
  );
}

function ChangeField({ kind, current }: { kind: Kind; current: string }) {
  const { user } = useUser();
  const [stage, setStage] = useState<"idle" | "code">("idle");
  const [value, setValue] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  // The pending Clerk resource awaiting verification.
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function sendCode() {
    if (!user || !value.trim()) return;
    setBusy(true);
    try {
      if (kind === "email") {
        const e = await user.createEmailAddress({ email: value.trim() });
        await e.prepareVerification({ strategy: "email_code" });
        setPendingId(e.id);
      } else {
        const p = await user.createPhoneNumber({ phoneNumber: value.trim() });
        await p.prepareVerification();
        setPendingId(p.id);
      }
      setStage("code");
      toast.success("Verification code sent.");
    } catch (err) {
      toast.error((err as { errors?: { message: string }[] })?.errors?.[0]?.message ?? "Could not send code.");
    } finally { setBusy(false); }
  }

  async function verify() {
    if (!user || !pendingId) return;
    setBusy(true);
    try {
      if (kind === "email") {
        const e = user.emailAddresses.find((x) => x.id === pendingId);
        await e?.attemptVerification({ code });
        await user.update({ primaryEmailAddressId: pendingId });
      } else {
        const p = user.phoneNumbers.find((x) => x.id === pendingId);
        await p?.attemptVerification({ code });
        await user.update({ primaryPhoneNumberId: pendingId });
      }
      toast.success(`${kind === "email" ? "Email" : "Phone"} updated.`);
      setStage("idle"); setValue(""); setCode(""); setPendingId(null);
    } catch (err) {
      toast.error((err as { errors?: { message: string }[] })?.errors?.[0]?.message ?? "Invalid code.");
    } finally { setBusy(false); }
  }

  const Icon = kind === "email" ? Mail : Phone;
  return (
    <div>
      <label className="mb-1 flex items-center gap-1.5 text-sm font-medium text-charcoal dark:text-slate-200">
        <Icon className="h-4 w-4" /> {kind === "email" ? "Email" : "Phone"}
      </label>
      <p className="mb-2 text-sm text-slate-500">Current: {current}</p>
      {stage === "idle" ? (
        <div className="flex gap-2">
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={kind === "email" ? "new@email.com" : "+1 555 123 4567"}
          />
          <Button className="shrink-0 whitespace-nowrap" onClick={sendCode} loading={busy} disabled={!value.trim()}>Change</Button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Verification code" />
          <Button className="shrink-0 whitespace-nowrap" onClick={verify} loading={busy} disabled={!code.trim()}>Verify</Button>
          <Button className="shrink-0 whitespace-nowrap" variant="ghost" onClick={() => { setStage("idle"); setPendingId(null); }}>Cancel</Button>
        </div>
      )}
    </div>
  );
}

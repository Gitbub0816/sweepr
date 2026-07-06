import { useState } from "react";
import { validateEmail, validatePhone } from "../lib/validation";

interface WaitlistFormProps {
  type: "cleaner" | "customer";
  apiUrl: string;
  onSuccess?: () => void;
}

export function WaitlistForm({ type, apiUrl, onSuccess }: WaitlistFormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [zip, setZip] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const emailErr = validateEmail(email);
    if (emailErr) { setError(emailErr); return; }
    const phoneErr = validatePhone(phone);
    if (phoneErr) { setError(phoneErr); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/status/waitlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          name: name.trim() || undefined,
          phone: phone.trim() || undefined,
          zipCode: zip.trim() || undefined,
          type,
        }),
      });
      if (!res.ok) throw new Error("Failed to join waitlist");
      setSubmitted(true);
      onSuccess?.();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <p className="text-sm text-seafoam-700 font-medium text-center">
        You're on the list! We'll reach out when we launch.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 w-full max-w-sm mx-auto">
      <input
        type="text"
        aria-label="Your name"
        placeholder="Your name (optional)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-seafoam-400"
      />
      <input
        type="email"
        aria-label="Email address"
        aria-invalid={!!error}
        placeholder="Email address *"
        required
        value={email}
        onChange={(e) => { setEmail(e.target.value); if (error) setError(null); }}
        onBlur={() => { const m = validateEmail(email); if (m) setError(m); }}
        className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-seafoam-400"
      />
      <input
        type="tel"
        aria-label="Phone number"
        placeholder="Phone (optional)"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-seafoam-400"
      />
      <input
        type="text"
        aria-label="ZIP code"
        placeholder="ZIP code (optional)"
        value={zip}
        onChange={(e) => setZip(e.target.value)}
        className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-seafoam-400"
      />
      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="rounded-lg bg-seafoam-700 px-4 py-2 text-sm font-semibold text-white hover:bg-seafoam-800 disabled:opacity-50 transition-colors"
      >
        {loading ? "Joining…" : "Join Waitlist"}
      </button>
    </form>
  );
}

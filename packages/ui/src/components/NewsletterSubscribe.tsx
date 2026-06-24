import { useState } from "react";

interface NewsletterSubscribeProps {
  apiUrl: string;
  className?: string;
}

export function NewsletterSubscribe({ apiUrl, className }: NewsletterSubscribeProps) {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/status/newsletter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error("Failed to subscribe");
      setSubmitted(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className={`rounded-lg bg-seafoam-50 border border-seafoam-200 px-4 py-3 text-center ${className ?? ""}`}>
        <p className="text-sm font-semibold text-seafoam-700">You're on the list! 🎉</p>
        <p className="text-xs text-seafoam-600 mt-0.5">We'll be in touch as soon as it's ready.</p>
      </div>
    );
  }

  return (
    <div className={className}>
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <input
          type="email"
          placeholder="Your email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-seafoam-400"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-seafoam-500 px-4 py-2 text-sm font-semibold text-white hover:bg-seafoam-600 disabled:opacity-50 transition-colors whitespace-nowrap"
        >
          {loading ? "…" : "Subscribe"}
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
    </div>
  );
}

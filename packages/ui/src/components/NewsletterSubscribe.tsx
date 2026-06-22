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
      <p className={`text-sm text-seafoam-600 font-medium ${className ?? ""}`}>
        You're subscribed!
      </p>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={`flex items-center gap-2 ${className ?? ""}`}
    >
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
      {error && <p className="text-sm text-red-500 ml-2">{error}</p>}
    </form>
  );
}

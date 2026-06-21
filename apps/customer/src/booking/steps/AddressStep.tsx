import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { MapPin, Search } from "lucide-react";
import { Input } from "@sweepr/ui";
import { useBookingStore } from "../../store/booking";
import { ADDRESS_SUGGESTIONS } from "../../data/mock";
import { StepShell } from "../StepShell";

export function AddressStep() {
  const navigate = useNavigate();
  const address = useBookingStore((s) => s.address);
  const setAddress = useBookingStore((s) => s.setAddress);
  const [query, setQuery] = useState(address?.line1 ?? "");

  const results = ADDRESS_SUGGESTIONS.filter((a) =>
    `${a.line1} ${a.city} ${a.zip}`
      .toLowerCase()
      .includes(query.toLowerCase())
  );

  return (
    <StepShell
      title="Where should we clean?"
      subtitle="Search for your address to check availability near you."
      onNext={() => navigate("/book/home")}
      nextDisabled={!address}
    >
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          className="pl-10"
          placeholder="Start typing your address…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {/* Mock map */}
      <div className="mt-4 flex h-40 items-center justify-center rounded-2xl border border-slate-200 bg-[radial-gradient(circle_at_30%_30%,#ccfbf1,transparent_60%),radial-gradient(circle_at_70%_70%,#5eead4,transparent_55%)] dark:border-slate-700">
        <MapPin className="h-8 w-8 text-seafoam-500" />
      </div>

      <div className="mt-4 space-y-2">
        {query &&
          results.map((r) => {
            const selected = address?.line1 === r.line1;
            return (
              <button
                key={r.line1}
                onClick={() =>
                  setAddress({ id: `addr_${r.zip}`, ...r })
                }
                className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors ${
                  selected
                    ? "border-seafoam-400 bg-seafoam-50 dark:bg-seafoam-900/20"
                    : "border-slate-200 hover:border-seafoam-300 dark:border-slate-700"
                }`}
              >
                <MapPin className="h-4 w-4 text-seafoam-500" />
                <span>
                  <span className="font-medium text-charcoal dark:text-white">
                    {r.line1}
                  </span>
                  <span className="block text-xs text-slate-500">
                    {r.city}, {r.state} {r.zip}
                  </span>
                </span>
              </button>
            );
          })}
      </div>
    </StepShell>
  );
}

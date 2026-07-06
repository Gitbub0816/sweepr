import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Card, Button, Input, toast } from "@sweepr/ui";
import {
  calculateHomeCleaningPrice,
  type HomeCleaningPricingConfig,
  type ShortTermRentalPricingConfig,
} from "@sweepr/utils";
import type { RoomConditionLevel, RoomType } from "@sweepr/types";

const API = import.meta.env.VITE_API_URL ?? "https://api.getsweepr.com";

const ROOMS: RoomType[] = ["kitchen", "bathroom", "bedroom", "living_room"];
const LEVELS: RoomConditionLevel[] = ["level_1", "level_2", "level_3", "level_4"];

/** Cents ↔ dollars helpers for the money inputs. */
const toDollars = (c: number) => (c / 100).toString();
const toCents = (d: string) => Math.round((parseFloat(d) || 0) * 100);

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-charcoal dark:text-white">{title}</h2>
        {desc && <p className="text-sm text-slate-500">{desc}</p>}
      </div>
      {children}
    </Card>
  );
}

function Money({ label, cents, onChange }: { label: string; cents: number; onChange: (c: number) => void }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">{label}</label>
      <div className="flex items-center gap-1">
        <span className="text-slate-400">$</span>
        <Input type="number" step="1" value={toDollars(cents)} onChange={(e) => onChange(toCents(e.target.value))} />
      </div>
    </div>
  );
}

export function CleaningPricingPage() {
  const { getToken } = useAuth();
  const [home, setHome] = useState<HomeCleaningPricingConfig | null>(null);
  const [str, setStr] = useState<ShortTermRentalPricingConfig | null>(null);
  const [saving, setSaving] = useState(false);

  const authed = useCallback(
    async (path: string, init?: RequestInit) => {
      const token = await getToken();
      return fetch(`${API}${path}`, {
        ...init,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init?.headers as Record<string, string>) },
      });
    },
    [getToken],
  );

  useEffect(() => {
    void (async () => {
      const res = await authed("/admin-pricing-config");
      if (res.ok) {
        const data = (await res.json()) as { home: HomeCleaningPricingConfig; str: ShortTermRentalPricingConfig };
        setHome(data.home);
        setStr(data.str);
      }
    })();
  }, [authed]);

  async function save() {
    if (!home || !str) return;
    setSaving(true);
    try {
      const [r1, r2] = await Promise.all([
        authed("/admin-pricing-config/home", { method: "PUT", body: JSON.stringify(home) }),
        authed("/admin-pricing-config/str", { method: "PUT", body: JSON.stringify(str) }),
      ]);
      if (!r1.ok || !r2.ok) throw new Error("Save failed");
      toast.success("Pricing saved");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!home || !str) {
    return <div className="p-6"><div className="h-40 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" /></div>;
  }

  // Live preview: a representative 2bd/2ba home with mixed conditions.
  const preview = calculateHomeCleaningPrice(
    {
      property: { homeType: "house", sqft: 1500, bedrooms: 2, bathrooms: 2 },
      rooms: [
        { roomType: "kitchen", level: "level_3" },
        { roomType: "bathroom", level: "level_2" },
        { roomType: "bedroom", level: "level_1" },
        { roomType: "living_room", level: "level_2" },
      ],
      addOnKeys: [],
    },
    home,
  );

  const patchHome = (p: Partial<HomeCleaningPricingConfig>) => setHome({ ...home, ...p });

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-charcoal dark:text-white">Cleaning Pricing</h1>
          <p className="text-sm text-slate-500">Room-condition home cleaning and short-term rental turnarounds.</p>
        </div>
        <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save all"}</Button>
      </div>

      <Card className="flex items-center justify-between bg-seafoam-50 dark:bg-seafoam-900/20">
        <span className="text-sm text-slate-600 dark:text-slate-300">Preview — 1,500 sqft, 2bd/2ba, mixed conditions</span>
        <span className="text-2xl font-bold text-charcoal dark:text-white">${preview.customerVisible.totalOwed.toFixed(0)}</span>
      </Card>

      {/* 1. Normal Home Cleaning */}
      <Section title="Normal Home Cleaning" desc="Base fee, home-size tiers, and bedroom/bathroom counts.">
        <div className="grid grid-cols-2 gap-3">
          <Money label="Base fee" cents={home.baseFeeCents} onChange={(c) => patchHome({ baseFeeCents: c })} />
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Included sqft</label>
            <Input type="number" value={home.sqftIncluded} onChange={(e) => patchHome({ sqftIncluded: Number(e.target.value) })} />
          </div>
          <Money label="Per extra bedroom" cents={home.perExtraBedroomCents} onChange={(c) => patchHome({ perExtraBedroomCents: c })} />
          <Money label="Per extra bathroom" cents={home.perExtraBathroomCents} onChange={(c) => patchHome({ perExtraBathroomCents: c })} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Square-footage tiers (added fee once size exceeds included)</label>
          <div className="space-y-2">
            {home.sqftTiers.map((tier, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-24 text-xs text-slate-500">{tier.maxSqft === null ? "> top" : `≤ ${tier.maxSqft}`}</span>
                <Input
                  type="number"
                  value={toDollars(tier.addCents)}
                  onChange={(e) => {
                    const tiers = [...home.sqftTiers];
                    tiers[i] = { ...tier, addCents: toCents(e.target.value) };
                    patchHome({ sqftTiers: tiers });
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* 2. Room Condition */}
      <Section title="Room Condition" desc="Added charge per room type as conditions worsen (level 1 is baseline).">
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            checked={home.roomCondition.applyPerRoom}
            onChange={(e) => patchHome({ roomCondition: { ...home.roomCondition, applyPerRoom: e.target.checked } })}
          />
          Apply per room (multiply by the number of rooms of that type)
        </label>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500">
                <th className="py-1">Room</th>
                {LEVELS.map((l) => <th key={l} className="py-1">{l.replace("level_", "Lvl ")}</th>)}
              </tr>
            </thead>
            <tbody>
              {ROOMS.map((room) => (
                <tr key={room} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="py-1 capitalize">{room.replace("_", " ")}</td>
                  {LEVELS.map((level) => (
                    <td key={level} className="py-1 pr-2">
                      <Input
                        type="number"
                        value={toDollars(home.roomCondition.rules[room].levelCents[level])}
                        onChange={(e) => {
                          const rules = { ...home.roomCondition.rules };
                          rules[room] = { levelCents: { ...rules[room].levelCents, [level]: toCents(e.target.value) } };
                          patchHome({ roomCondition: { ...home.roomCondition, rules } });
                        }}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* 3. Add-Ons */}
      <Section title="Add-Ons" desc="Optional extras a customer can add to a clean.">
        <div className="grid grid-cols-2 gap-3">
          {Object.entries(home.addOnCents).map(([key, cents]) => (
            <Money
              key={key}
              label={key.replace(/_/g, " ")}
              cents={cents}
              onChange={(c) => patchHome({ addOnCents: { ...home.addOnCents, [key]: c } })}
            />
          ))}
        </div>
      </Section>

      {/* 4. Short-Term Rental Turnaround */}
      <Section title="Short-Term Rental Turnaround" desc="Monthly connection fee per property plus a flat per-turnaround fee.">
        <div className="grid grid-cols-2 gap-3">
          <Money label="Monthly connection fee" cents={str.monthlyConnectionFeeCents} onChange={(c) => setStr({ ...str, monthlyConnectionFeeCents: c })} />
          <Money label="Per-turnaround fee" cents={str.perTurnaroundFeeCents} onChange={(c) => setStr({ ...str, perTurnaroundFeeCents: c })} />
        </div>
      </Section>

      {/* 5. Rounding / Taxes / Fees */}
      <Section title="Rounding, Taxes & Fees" desc="Applied to the final customer total.">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Tax rate (%)</label>
            <Input type="number" step="0.01" value={(home.taxRate * 100).toString()} onChange={(e) => { const v = (parseFloat(e.target.value) || 0) / 100; patchHome({ taxRate: v }); setStr({ ...str, taxRate: v }); }} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Service fee (%)</label>
            <Input type="number" step="0.01" value={(home.serviceFeeRate * 100).toString()} onChange={(e) => patchHome({ serviceFeeRate: (parseFloat(e.target.value) || 0) / 100 })} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Round to end in</label>
            <Input type="number" min="0" max="9" value={home.roundToEndingDigit} onChange={(e) => { const d = Math.max(0, Math.min(9, Number(e.target.value))); patchHome({ roundToEndingDigit: d }); setStr({ ...str, roundToEndingDigit: d }); }} />
          </div>
        </div>
      </Section>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save all"}</Button>
      </div>
    </div>
  );
}

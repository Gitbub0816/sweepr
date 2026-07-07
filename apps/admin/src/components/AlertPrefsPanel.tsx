/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

/**
 * "Alerts & notifications" — the signed-in admin's personal alert preferences:
 * a category × channel (In-app / Email / SMS) toggle grid, their SMS number,
 * and a self-test button that fires a test alert through each enabled channel.
 */
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, Input, Button, toast } from "@sweepr/ui";
import {
  ALERT_CATEGORIES,
  ALERT_CHANNELS,
  ALERT_BADGES_KEY,
  ALERT_FEED_KEY,
  CATEGORY_LABELS,
  useAuthedFetch,
  type AlertCategory,
  type AlertChannel,
} from "../lib/alerts";

const CHANNEL_LABELS: Record<AlertChannel, string> = {
  inapp: "In-app",
  email: "Email",
  sms: "SMS",
};

const E164_HINT = /^\+?[0-9()\-.\s]{7,20}$/;

interface PrefRow {
  category: string;
  channel: string;
  enabled: boolean;
}

type Grid = Record<AlertCategory, Record<AlertChannel, boolean>>;

function emptyGrid(): Grid {
  const grid = {} as Grid;
  for (const cat of ALERT_CATEGORIES) {
    grid[cat] = { inapp: true, email: false, sms: false };
  }
  return grid;
}

export function AlertPrefsPanel() {
  const authed = useAuthedFetch();
  const queryClient = useQueryClient();
  const [grid, setGrid] = useState<Grid>(emptyGrid);
  const [smsPhone, setSmsPhone] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await authed("/admin/alerts/prefs");
        if (!res.ok) throw new Error();
        const data = (await res.json()) as { prefs: PrefRow[]; smsPhone: string | null };
        setGrid(() => {
          const next = emptyGrid();
          for (const p of data.prefs) {
            const cat = p.category as AlertCategory;
            const ch = p.channel as AlertChannel;
            if (next[cat] && ch in next[cat]) next[cat][ch] = p.enabled;
          }
          return next;
        });
        setSmsPhone(data.smsPhone ?? "");
      } catch {
        toast.error("Couldn't load your alert preferences.");
      } finally {
        setLoading(false);
      }
    })();
  }, [authed]);

  function toggle(category: AlertCategory, channel: AlertChannel) {
    setGrid((g) => ({
      ...g,
      [category]: { ...g[category], [channel]: !g[category][channel] },
    }));
  }

  async function save() {
    const phone = smsPhone.trim();
    if (phone && !E164_HINT.test(phone)) {
      toast.error("SMS phone must be a valid number, e.g. +1 555 123 4567.");
      return;
    }
    setSaving(true);
    try {
      const prefs = ALERT_CATEGORIES.flatMap((category) =>
        ALERT_CHANNELS.map((channel) => ({ category, channel, enabled: grid[category][channel] })),
      );
      const res = await authed("/admin/alerts/prefs", {
        method: "PUT",
        body: JSON.stringify({ prefs, smsPhone: phone === "" ? null : phone }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Save failed");
      toast.success("Alert preferences saved");
      queryClient.invalidateQueries({ queryKey: ALERT_BADGES_KEY });
    } catch (err: unknown) {
      toast.error((err as Error).message ?? "Couldn't save alert preferences.");
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    setTesting(true);
    try {
      const res = await authed("/admin/alerts/test", { method: "POST" });
      const data = (await res.json()) as { ok?: boolean; channels?: Record<string, string> };
      if (!res.ok || !data.ok) throw new Error();
      const summary = Object.entries(data.channels ?? {})
        .map(([ch, status]) => `${CHANNEL_LABELS[ch as AlertChannel] ?? ch}: ${status}`)
        .join(" · ");
      toast.success(`Test alert sent — ${summary}`);
      queryClient.invalidateQueries({ queryKey: ALERT_BADGES_KEY });
      queryClient.invalidateQueries({ queryKey: ALERT_FEED_KEY });
    } catch {
      toast.error("Couldn't send the test alert.");
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return (
      <Card className="max-w-2xl space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
        ))}
      </Card>
    );
  }

  return (
    <Card className="max-w-2xl space-y-5">
      <div>
        <h2 className="text-sm font-semibold text-charcoal dark:text-white">Alerts &amp; notifications</h2>
        <p className="mt-0.5 text-sm text-gray-500">
          Choose how you personally receive operational alerts. These settings only affect your account.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left dark:border-slate-700">
              <th className="py-2 pr-4 font-medium text-slate-600 dark:text-slate-400">Category</th>
              {ALERT_CHANNELS.map((ch) => (
                <th key={ch} className="px-3 py-2 text-center font-medium text-slate-600 dark:text-slate-400">
                  {CHANNEL_LABELS[ch]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {ALERT_CATEGORIES.map((cat) => (
              <tr key={cat}>
                <td className="py-2.5 pr-4 font-medium text-charcoal dark:text-white">
                  {CATEGORY_LABELS[cat]}
                </td>
                {ALERT_CHANNELS.map((ch) => (
                  <td key={ch} className="px-3 py-2.5 text-center">
                    <input
                      type="checkbox"
                      checked={grid[cat][ch]}
                      onChange={() => toggle(cat, ch)}
                      aria-label={`${CATEGORY_LABELS[cat]} via ${CHANNEL_LABELS[ch]}`}
                      className="h-4 w-4 rounded border-slate-300 accent-teal-600"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="max-w-xs">
        <Input
          label="SMS phone (E.164, e.g. +15551234567)"
          type="tel"
          placeholder="+15551234567"
          value={smsPhone}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSmsPhone(e.target.value)}
        />
        <p className="mt-1 text-xs text-slate-500">
          Required for SMS alerts. Saving a number opts you in to alert texts.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save alert preferences"}
        </Button>
        <button
          onClick={sendTest}
          disabled={testing}
          className="text-sm font-medium text-seafoam-700 hover:underline disabled:opacity-50 dark:text-seafoam-300"
        >
          {testing ? "Sending…" : "Send test alert"}
        </button>
      </div>
    </Card>
  );
}

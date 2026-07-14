/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { DashboardShell, Card, Button, Modal, toast } from "@sweepr/ui";
import {
  Briefcase,
  Building2,
  Users,
  CreditCard,
  MapPin,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  ExternalLink,
  Clock,
} from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL ?? "";

type TransitionType = "convert_customer_to_business" | "create_business_workspace";
type Mode = "full" | "partition" | "fresh";

interface SavedAddress {
  id: string;
  label: string | null;
  line1: string;
  city: string;
  state: string;
  zip: string;
  isDefault: boolean;
  propertyType: string;
}

/** What each choice sends to POST /account/business-transition. */
function toRequestBody(mode: Mode, workspaceName: string, addressIds: string[]) {
  if (mode === "fresh") {
    return {
      transitionType: "create_business_workspace" as TransitionType,
      workspaceName,
    };
  }
  return {
    transitionType: "convert_customer_to_business" as TransitionType,
    workspaceName,
    mode: mode === "full" ? ("full" as const) : ("partition" as const),
    ...(mode === "partition" ? { addressIds } : {}),
  };
}

const MODE_OPTIONS: Array<{
  mode: Mode;
  title: string;
  description: string;
  icon: typeof Briefcase;
}> = [
  {
    mode: "full",
    title: "Move everything",
    description:
      "Convert your account: all saved properties move into your new business workspace, managed together going forward.",
    icon: Building2,
  },
  {
    mode: "partition",
    title: "Move selected properties",
    description:
      "Pick which properties move to the business workspace. The rest stay on your personal account.",
    icon: MapPin,
  },
  {
    mode: "fresh",
    title: "Start fresh",
    description:
      "Create an empty business workspace. Nothing moves, add properties and teammates later.",
    icon: Sparkles,
  },
];

export function BusinessPage() {
  const { getToken } = useAuth();

  const [mode, setMode] = useState<Mode | null>(null);
  const [workspaceName, setWorkspaceName] = useState("");
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [addressesLoading, setAddressesLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [transitionUrl, setTransitionUrl] = useState<string | null>(null);

  const authed = useCallback(
    async (path: string, init?: RequestInit) => {
      const token = await getToken();
      return fetch(`${API_URL}${path}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(init?.headers as Record<string, string>),
        },
      });
    },
    [getToken],
  );

  // Load saved addresses once partition mode is a possibility the user picked.
  useEffect(() => {
    if (mode !== "partition" || addresses.length > 0) return;
    let cancelled = false;
    setAddressesLoading(true);
    (async () => {
      try {
        const res = await authed("/customer-profile/addresses");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { addresses: SavedAddress[] };
        if (!cancelled) setAddresses(data.addresses);
      } catch {
        if (!cancelled) toast.error("Couldn't load your saved addresses. Please try again.");
      } finally {
        if (!cancelled) setAddressesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, addresses.length, authed]);

  function toggleAddress(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const nameValid = workspaceName.trim().length >= 2;
  const canContinue =
    mode !== null && nameValid && (mode !== "partition" || selectedIds.size > 0);

  async function submit() {
    if (!mode || submitting) return;
    setSubmitting(true);
    try {
      const res = await authed("/account/business-transition", {
        method: "POST",
        body: JSON.stringify(
          toRequestBody(mode, workspaceName.trim(), Array.from(selectedIds)),
        ),
      });
      if (res.status === 404 || res.status === 405) {
        // Endpoint not live yet — friendly, no scary details.
        toast.error(
          "Sweepr Business setup isn't available quite yet. Please check back soon.",
        );
        return;
      }
      if (!res.ok) {
        let message = "Something went wrong setting up your workspace. Please try again.";
        try {
          const body = (await res.json()) as { error?: string; message?: string };
          if (body.error || body.message) message = body.error ?? body.message ?? message;
        } catch {
          /* keep generic message */
        }
        toast.error(message);
        return;
      }
      const data = (await res.json()) as { transitionUrl?: string };
      if (!data.transitionUrl) {
        toast.error("We couldn't create your secure link. Please try again.");
        return;
      }
      setTransitionUrl(data.transitionUrl);
      setConfirmOpen(false);
      toast.success("Your business workspace is ready to claim.");
    } catch {
      toast.error("We couldn't reach Sweepr right now. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ------- Success state: hand-off into business.getsweepr.com -------
  if (transitionUrl) {
    return (
      <DashboardShell
        title="Sweepr Business"
        description="Your workspace is ready, finish setup in Sweepr Business."
      >
        <div className="max-w-lg space-y-6">
          <Card className="space-y-4 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-seafoam-100 dark:bg-seafoam-900/40">
              <CheckCircle2 className="h-7 w-7 text-seafoam-700 dark:text-seafoam-300" />
            </div>
            <div>
              <p className="text-lg font-semibold text-charcoal dark:text-white">
                “{workspaceName.trim()}” is ready
              </p>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                Continue in Sweepr Business to claim your workspace and finish setup.
              </p>
            </div>
            <a href={transitionUrl} target="_blank" rel="noopener noreferrer" className="block">
              <Button size="lg" fullWidth>
                Continue in Sweepr Business <ExternalLink className="h-4 w-4" />
              </Button>
            </a>
            <p className="flex items-center justify-center gap-1.5 text-xs text-slate-500">
              <Clock className="h-3.5 w-3.5" />
              This link is single-use and expires in 15 minutes.
            </p>
          </Card>
          <p className="text-center text-xs text-slate-500">
            Your personal account keeps working exactly as before.
          </p>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell
      title="Sweepr for Business"
      description="Manage multiple properties, your team, and billing in one place."
    >
      <div className="max-w-2xl space-y-6">
        {/* Explainer */}
        <Card className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-seafoam-700 text-white">
              <Briefcase className="h-5 w-5" />
            </div>
            <p className="text-base font-semibold text-charcoal dark:text-white">
              Why Sweepr Business?
            </p>
          </div>
          <ul className="space-y-3">
            {[
              {
                icon: Users,
                title: "Team access",
                text: "Invite teammates to book and manage cleanings, property managers, assistants, co-hosts.",
              },
              {
                icon: MapPin,
                title: "Multiple properties",
                text: "Keep every rental, office, or listing organized under one workspace.",
              },
              {
                icon: CreditCard,
                title: "Consolidated billing",
                text: "One place for payment methods, receipts, and spend across all your properties.",
              },
            ].map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex items-start gap-3">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-seafoam-500" />
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  <span className="font-medium text-charcoal dark:text-white">{title}.</span>{" "}
                  {text}
                </p>
              </li>
            ))}
          </ul>
          <p className="text-xs text-slate-500">
            Your personal Sweepr account keeps working, and your booking history stays intact, 
            this only changes how your properties are managed going forward.
          </p>
        </Card>

        {/* Workspace name */}
        <Card className="space-y-2">
          <label
            htmlFor="workspace-name"
            className="text-sm font-semibold text-charcoal dark:text-white"
          >
            Business name
          </label>
          <input
            id="workspace-name"
            type="text"
            value={workspaceName}
            onChange={(e) => setWorkspaceName(e.target.value)}
            placeholder="e.g. Lakeside Rentals LLC"
            maxLength={120}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-charcoal placeholder:text-slate-400 focus:border-seafoam-500 focus:outline-none focus:ring-1 focus:ring-seafoam-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
          <p className="text-xs text-slate-500">This becomes your workspace name in Sweepr Business.</p>
        </Card>

        {/* Mode choice */}
        <div className="space-y-3">
          <p className="text-sm font-semibold text-charcoal dark:text-white">
            How would you like to start?
          </p>
          {MODE_OPTIONS.map(({ mode: m, title, description, icon: Icon }) => {
            const active = mode === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                aria-pressed={active}
                className={`w-full rounded-2xl border p-4 text-left transition ${
                  active
                    ? "border-seafoam-500 bg-seafoam-50 ring-1 ring-seafoam-500 dark:bg-seafoam-900/20"
                    : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-600"
                }`}
              >
                <div className="flex items-start gap-3">
                  <Icon
                    className={`mt-0.5 h-5 w-5 shrink-0 ${
                      active ? "text-seafoam-700 dark:text-seafoam-300" : "text-slate-400"
                    }`}
                  />
                  <div>
                    <p className="text-sm font-semibold text-charcoal dark:text-white">{title}</p>
                    <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
                      {description}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Partition: address picker */}
        {mode === "partition" && (
          <Card className="space-y-3">
            <p className="text-sm font-semibold text-charcoal dark:text-white">
              Choose properties to move
            </p>
            {addressesLoading ? (
              <div className="space-y-2">
                <div className="h-12 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
                <div className="h-12 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
              </div>
            ) : addresses.length === 0 ? (
              <p className="text-sm text-slate-500">
                No saved addresses yet. Add addresses from your Profile first, or choose
                “Start fresh”.
              </p>
            ) : (
              addresses.map((a) => {
                const checked = selectedIds.has(a.id);
                return (
                  <label
                    key={a.id}
                    className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleAddress(a.id)}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-seafoam-700 focus:ring-seafoam-500"
                    />
                    <span className="min-w-0">
                      {a.label && (
                        <span className="block text-sm font-semibold text-charcoal dark:text-white">
                          {a.label}
                        </span>
                      )}
                      <span className="block text-sm text-slate-600 dark:text-slate-300">
                        {[a.line1, a.city, a.state, a.zip].filter(Boolean).join(", ")}
                      </span>
                    </span>
                  </label>
                );
              })
            )}
          </Card>
        )}

        <Button size="lg" disabled={!canContinue} onClick={() => setConfirmOpen(true)}>
          Review and continue <ArrowRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Confirmation */}
      <Modal
        open={confirmOpen}
        onOpenChange={(o) => {
          if (!submitting) setConfirmOpen(o);
        }}
        title="Confirm your business setup"
        description={`Workspace: ${workspaceName.trim() || ", "}`}
        footer={
          <div className="flex w-full justify-end gap-2">
            <Button variant="ghost" disabled={submitting} onClick={() => setConfirmOpen(false)}>
              Go back
            </Button>
            <Button loading={submitting} onClick={() => void submit()}>
              Create my workspace
            </Button>
          </div>
        }
      >
        <div className="space-y-4 text-sm">
          <div>
            <p className="font-semibold text-charcoal dark:text-white">What moves</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-slate-600 dark:text-slate-300">
              {mode === "fresh" ? (
                <li>Nothing yet, you'll start with an empty business workspace.</li>
              ) : mode === "partition" ? (
                <li>
                  {selectedIds.size} selected {selectedIds.size === 1 ? "property" : "properties"}{" "}
                  and management of their future bookings.
                </li>
              ) : (
                <li>All your saved properties and management of their future bookings.</li>
              )}
            </ul>
          </div>
          <div>
            <p className="font-semibold text-charcoal dark:text-white">What stays</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-slate-600 dark:text-slate-300">
              <li>Your personal account keeps working, same sign-in, same app.</li>
              <li>Your booking history stays intact and visible.</li>
            </ul>
          </div>
          <p className="text-xs text-slate-500">
            Next, we'll give you a secure one-time link to claim your workspace in Sweepr
            Business.
          </p>
        </div>
      </Modal>
    </DashboardShell>
  );
}

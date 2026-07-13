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
import { Home as HomeIcon, MapPin } from "lucide-react";
import { Card, LoadingState, EmptyState, ErrorState } from "@sweepr/ui";
import { apiFetch, asList } from "../lib/api";

interface Property {
  id?: string;
  label?: string | null;
  nickname?: string | null;
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  postalCode?: string | null;
}

function formatAddress(p: Property): string {
  const parts = [p.line1, p.line2, p.city, p.state, p.zip ?? p.postalCode].filter(Boolean);
  return parts.join(", ") || "Address on file";
}

export function PropertiesPage() {
  const { getToken } = useAuth();
  const [properties, setProperties] = useState<Property[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  const load = useCallback(async () => {
    const res = await apiFetch<unknown>(getToken, "/business/properties");
    if (res.ok) {
      setProperties(asList<Property>(res.data, "properties", "addresses"));
      setStatus("ready");
    } else {
      setStatus("error");
    }
  }, [getToken]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-charcoal dark:text-white">Properties</h1>
        <p className="mt-1 text-sm text-slate-500">
          Addresses your workspace manages cleanings for.
        </p>
      </div>

      {status === "loading" && <LoadingState rows={4} />}

      {status === "error" && (
        <ErrorState
          title="Couldn't load properties"
          description="The workspace service isn't reachable right now. Please try again shortly."
        />
      )}

      {status === "ready" && properties.length === 0 && (
        <EmptyState
          icon={<HomeIcon className="h-10 w-10" />}
          title="No properties yet"
          description="Properties added to your workspace will appear here."
        />
      )}

      {status === "ready" && properties.length > 0 && (
        <div className="space-y-3">
          {properties.map((p, i) => (
            <Card key={p.id ?? i} className="flex items-start gap-4">
              <div className="rounded-xl bg-platinum-50 p-2.5 text-platinum-700 dark:bg-slate-800 dark:text-platinum-400">
                <MapPin className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-charcoal dark:text-white">
                  {p.label ?? p.nickname ?? p.line1 ?? "Property"}
                </p>
                <p className="mt-0.5 truncate text-sm text-slate-500">{formatAddress(p)}</p>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

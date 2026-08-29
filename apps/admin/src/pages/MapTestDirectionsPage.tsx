/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { useEffect, useRef, useState } from "react";
import { MapPin, Moon, Sun } from "lucide-react";
import { DashboardShell, Card, Input, NavigationMap, getMapboxToken } from "@sweepr/ui";

/** Shape of a feature from the Mapbox Geocoding API (v5 places endpoint). */
interface MapboxFeature {
  id: string;
  place_name?: string;
  text?: string;
  center: [number, number];
}

interface Suggestion {
  id: string;
  label: string;
  lat: number;
  lng: number;
}

/** Fallback origin (downtown San Francisco) used when geolocation is denied
 *  or unavailable, so the turn-by-turn can still be exercised in a desktop
 *  browser without a real GPS fix. */
const FALLBACK_ORIGIN = { lat: 37.7749, lng: -122.4194 };

function isDarkTheme(): boolean {
  if (typeof document !== "undefined" && document.documentElement.classList.contains("dark")) return true;
  try {
    return localStorage.getItem("theme") === "dark";
  } catch {
    return false;
  }
}

/**
 * Internal QA tool: type an address, get live turn-by-turn directions to it
 * rendered by the same NavigationMap component cleaners see on a real job,
 * so Mapbox GL directions + dark/light basemap switching can be
 * verified without waiting for a live booking to reach en_route.
 */
export function MapTestDirectionsPage() {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [destination, setDestination] = useState<Suggestion | null>(null);
  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(null);
  const [originSource, setOriginSource] = useState<"gps" | "fallback" | null>(null);
  const [dark, setDark] = useState(isDarkTheme());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Live position, same as the real cleaner day-of-service flow.
  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setOrigin(FALLBACK_ORIGIN);
      setOriginSource("fallback");
      return;
    }
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setOriginSource("gps");
      },
      () => {
        setOrigin(FALLBACK_ORIGIN);
        setOriginSource("fallback");
      },
      { enableHighAccuracy: true, maximumAge: 10_000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Track the app's theme so this page reports honestly whether the map
  // actually flipped colorScheme when dark mode toggled.
  useEffect(() => {
    const apply = () => setDark(isDarkTheme());
    const observer = new MutationObserver(apply);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    window.addEventListener("storage", apply);
    return () => {
      observer.disconnect();
      window.removeEventListener("storage", apply);
    };
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  async function fetchSuggestions(q: string) {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }
    const token = getMapboxToken();
    if (!token) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }
    setLoading(true);
    try {
      const url =
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(trimmed)}.json` +
        `?access_token=${token}&autocomplete=true&country=us&types=address&limit=5`;
      const res = await fetch(url);
      const features: MapboxFeature[] = res.ok
        ? ((await res.json()) as { features?: MapboxFeature[] }).features ?? []
        : [];
      setSuggestions(
        features.map((feature, i) => ({
          id: feature.id || `${feature.place_name ?? feature.text ?? "place"}-${i}`,
          label: feature.place_name ?? feature.text ?? trimmed,
          lat: feature.center[1],
          lng: feature.center[0],
        }))
      );
      setShowDropdown(features.length > 0);
    } catch {
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }

  function handleChange(value: string) {
    setQuery(value);
    setDestination(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(value), 200);
  }

  function handleSelect(s: Suggestion) {
    setShowDropdown(false);
    setSuggestions([]);
    setQuery(s.label);
    setDestination(s);
  }

  return (
    <DashboardShell
      title="Map test — turn-by-turn directions"
      description="QA tool: type an address and watch a live Mapbox route preview render, in both light and dark mode."
    >
      <div className="space-y-6">
        <Card className="p-5">
          <div ref={wrapperRef} className="relative">
            <Input
              label="Destination address"
              placeholder="Start typing an address…"
              value={query}
              onChange={(e) => handleChange(e.target.value)}
              onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
              autoComplete="off"
              role="combobox"
              aria-expanded={showDropdown && suggestions.length > 0}
              aria-controls="map-test-suggestions"
              aria-autocomplete="list"
            />

            {loading && (
              <div
                className="absolute right-3 top-9 h-4 w-4 animate-spin motion-reduce:animate-none rounded-full border-2 border-seafoam-400 border-t-transparent"
                role="status"
              >
                <span className="sr-only">Loading…</span>
              </div>
            )}

            {showDropdown && suggestions.length > 0 && (
              <ul
                id="map-test-suggestions"
                role="listbox"
                className="absolute z-50 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900"
              >
                {suggestions.map((s) => (
                  <li key={s.id} role="option" aria-selected="false">
                    <button
                      type="button"
                      onMouseDown={() => handleSelect(s)}
                      className="flex w-full items-start gap-3 px-4 py-3 text-left text-sm hover:bg-seafoam-50 dark:hover:bg-slate-800"
                    >
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-seafoam-500" aria-hidden="true" />
                      <span className="text-slate-700 dark:text-slate-200">{s.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1 dark:border-slate-700">
              {dark ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
              App theme: {dark ? "dark" : "light"} — map basemap should match
            </span>
            {originSource === "gps" && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-seafoam-200 bg-seafoam-50 px-3 py-1 text-seafoam-700 dark:border-seafoam-700 dark:bg-seafoam-900/30 dark:text-seafoam-300">
                Origin: live device GPS
              </span>
            )}
            {originSource === "fallback" && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-amber-700 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                Origin: simulated (San Francisco) — GPS unavailable or denied
              </span>
            )}
          </div>
        </Card>

        {destination && origin && (
          <Card className="overflow-hidden p-0">
            <NavigationMap
              destination={{ lat: destination.lat, lng: destination.lng, label: destination.label }}
              currentLat={origin.lat}
              currentLng={origin.lng}
            />
          </Card>
        )}

        {!destination && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Search for an address above to render live turn-by-turn directions from your current
            location (or the simulated fallback) to that address.
          </p>
        )}
      </div>
    </DashboardShell>
  );
}

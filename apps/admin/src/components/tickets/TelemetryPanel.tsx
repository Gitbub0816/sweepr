/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { Globe2, MapPin, MonitorSmartphone, ShieldOff } from "lucide-react";

export interface ReporterGeo {
  country?: string | null;
  region?: string | null;
  city?: string | null;
  timezone?: string | null;
  colo?: string | null;
  lat?: number | null;
  lng?: number | null;
}
export interface ReporterDevice {
  platform?: string | null;
  userAgent?: string | null;
  viewport?: { width?: number; height?: number } | null;
  screen?: { width?: number; height?: number } | null;
  language?: string | null;
  deviceMemory?: number | null;
  hardwareConcurrency?: number | null;
  touch?: boolean | null;
}

/** WHO/telemetry fields shared by it_tickets and security_tickets. Everything is optional — old rows have none of it. */
export interface TelemetrySource {
  reporter_ip?: string | null;
  reporter_user_agent?: string | null;
  reporter_geo?: ReporterGeo | string | null;
  reporter_device?: ReporterDevice | string | null;
  telemetry_consent?: boolean | null;
}

function parseMaybeJson<T>(v: T | string | null | undefined): T | null {
  if (v == null) return null;
  if (typeof v === "string") {
    try { return JSON.parse(v) as T; } catch { return null; }
  }
  return v;
}

function summarizeUserAgent(ua?: string | null): { browser: string; os: string } {
  if (!ua) return { browser: "Unknown", os: "Unknown" };
  let browser = "Unknown";
  if (/edg\//i.test(ua)) browser = "Edge";
  else if (/chrome\//i.test(ua)) browser = "Chrome";
  else if (/safari\//i.test(ua) && !/chrome/i.test(ua)) browser = "Safari";
  else if (/firefox\//i.test(ua)) browser = "Firefox";
  let os = "Unknown";
  if (/windows/i.test(ua)) os = "Windows";
  else if (/mac os|macintosh/i.test(ua)) os = "macOS";
  else if (/android/i.test(ua)) os = "Android";
  else if (/iphone|ipad|ios/i.test(ua)) os = "iOS";
  else if (/linux/i.test(ua)) os = "Linux";
  return { browser, os };
}

/**
 * Renders WHO/telemetry info for a ticket reporter: IP, geo, device.
 * Only shown if the reporter allowed tracking (telemetry_consent === true).
 * Renders defensively — pre-migration tickets carry none of these fields.
 */
export function TelemetryPanel({ source }: { source: TelemetrySource }) {
  const { reporter_ip, reporter_user_agent, telemetry_consent } = source;
  const geo = parseMaybeJson<ReporterGeo>(source.reporter_geo);
  const device = parseMaybeJson<ReporterDevice>(source.reporter_device);

  if (telemetry_consent !== true) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800/50">
        <ShieldOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>
          {telemetry_consent === false
            ? "Tracking not permitted by this user."
            : "Tracking not permitted by this user (or consent unknown)."}
        </span>
      </div>
    );
  }

  const ua = summarizeUserAgent(reporter_user_agent ?? device?.userAgent ?? null);
  const locationParts = [geo?.city, geo?.region, geo?.country].filter(Boolean);

  return (
    <div className="space-y-2 text-xs">
      {reporter_ip && (
        <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 p-2 dark:border-slate-700">
          <Globe2 className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden="true" />
          <span className="font-mono text-slate-700 dark:text-slate-200">{reporter_ip}</span>
          {geo?.colo && <span className="text-slate-500">via {geo.colo}</span>}
        </div>
      )}
      {(locationParts.length > 0 || geo?.timezone) && (
        <div className="flex items-start gap-1.5 rounded-lg border border-slate-200 p-2 dark:border-slate-700">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden="true" />
          <div>
            <p className="text-slate-700 dark:text-slate-200">{locationParts.length > 0 ? locationParts.join(", ") : "Unknown location"}</p>
            {geo?.timezone && <p className="text-slate-500">{geo.timezone}</p>}
          </div>
        </div>
      )}
      {(reporter_user_agent || device) && (
        <div className="flex items-start gap-1.5 rounded-lg border border-slate-200 p-2 dark:border-slate-700">
          <MonitorSmartphone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden="true" />
          <div className="space-y-0.5 text-slate-700 dark:text-slate-200">
            <p>{ua.browser} on {device?.platform ?? ua.os}</p>
            {device?.viewport?.width && device?.viewport?.height && (
              <p className="text-slate-500">Viewport {device.viewport.width}×{device.viewport.height}{device.screen?.width ? ` (screen ${device.screen.width}×${device.screen.height})` : ""}</p>
            )}
            {device?.language && <p className="text-slate-500">Language: {device.language}</p>}
            {(device?.deviceMemory || device?.hardwareConcurrency) && (
              <p className="text-slate-500">
                {device?.deviceMemory ? `${device.deviceMemory}GB RAM` : ""}
                {device?.deviceMemory && device?.hardwareConcurrency ? " · " : ""}
                {device?.hardwareConcurrency ? `${device.hardwareConcurrency} cores` : ""}
              </p>
            )}
            {device?.touch != null && <p className="text-slate-500">Touch: {device.touch ? "yes" : "no"}</p>}
          </div>
        </div>
      )}
      {!reporter_ip && locationParts.length === 0 && !reporter_user_agent && !device && (
        <p className="text-slate-500">Consent given, but no telemetry was captured for this report.</p>
      )}
    </div>
  );
}

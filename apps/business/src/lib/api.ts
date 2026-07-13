/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

/** API base. Falls back to production API in prod builds so the app still
 * works when VITE_API_URL is missing from the build environment. */
export const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined) ||
  (import.meta.env.PROD ? "https://api.getsweepr.com" : "");

export type GetToken = () => Promise<string | null>;

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  /** Human-friendly error message extracted from the response, if any. */
  error?: string;
}

/**
 * Authenticated fetch against the Sweepr API (Clerk Bearer token).
 * Never throws — the /business surface may not be deployed yet, so callers
 * always get a result they can render friendly empty/error states from.
 */
export async function apiFetch<T>(
  getToken: GetToken,
  path: string,
  init?: RequestInit & { json?: unknown }
): Promise<ApiResult<T>> {
  if (!API_URL) return { ok: false, status: 0, data: null, error: "API not configured" };
  try {
    const token = await getToken();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      ...(init?.json !== undefined ? { "Content-Type": "application/json" } : {}),
    };
    const res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) },
      body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
    });
    let data: T | null = null;
    let error: string | undefined;
    try {
      const body = (await res.json()) as unknown;
      if (res.ok) data = body as T;
      else error = (body as { error?: string; message?: string })?.error
        ?? (body as { message?: string })?.message;
    } catch {
      /* non-JSON body (e.g. 404 HTML) — leave data null */
    }
    return { ok: res.ok, status: res.status, data, error };
  } catch {
    return { ok: false, status: 0, data: null, error: "Network error" };
  }
}

/** Defensive list extraction — accepts a bare array or common envelope keys. */
export function asList<T>(data: unknown, ...keys: string[]): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object") {
    for (const k of [...keys, "items", "results"]) {
      const v = (data as Record<string, unknown>)[k];
      if (Array.isArray(v)) return v as T[];
    }
  }
  return [];
}

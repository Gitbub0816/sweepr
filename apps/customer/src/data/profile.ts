import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import type { Address, HomeType } from "@sweepr/types";

const API_URL = import.meta.env.VITE_API_URL ?? "";

export interface CustomerProfile {
  onboarded: boolean;
  homeBedrooms: number | null;
  homeBathrooms: number | null;
  homeSqft: number | null;
  homeType: HomeType | null;
  hasPets: boolean;
  defaultAddressId: string | null;
}

export interface ProfileData {
  profile: CustomerProfile;
  addresses: Array<Address & { isDefault: boolean }>;
}

export function useCustomerProfile() {
  const { getToken, isSignedIn } = useAuth();
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!API_URL || !isSignedIn) { setLoading(false); return; }
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/customer-profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const d = (await res.json()) as ProfileData;
        setData(d);
      }
    } catch {
      // Non-fatal; app continues without profile pre-fill.
    } finally {
      setLoading(false);
    }
  }, [getToken, isSignedIn]);

  useEffect(() => { load(); }, [load]);
  return { data, loading, reload: load };
}

export async function saveCustomerProfile(
  getToken: () => Promise<string | null>,
  patch: Partial<{
    homeBedrooms: number;
    homeBathrooms: number;
    homeSqft: number;
    homeType: string;
    hasPets: boolean;
    onboarded: boolean;
    defaultAddressId: string;
  }>
): Promise<boolean> {
  if (!API_URL) return false;
  try {
    const token = await getToken();
    const res = await fetch(`${API_URL}/customer-profile`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(patch),
    });
    return res.ok;
  } catch {
    return false;
  }
}

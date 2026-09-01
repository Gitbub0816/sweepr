/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import type { CleaningLevel, ServiceType } from "@sweepr/types";

// ---------------------------------------------------------------------------
// Static scope-review copy & data
//
// This module is the single source of truth for what each cleaning level and
// service package includes/excludes. It backs the customer-facing level
// picker, the cleaner scope-review request flow, and the AI/admin review
// tooling. No pricing math lives here — see pricing.ts for surcharge amounts
// (site_settings keys `scope_review.level_surcharge_*_pct`).
// ---------------------------------------------------------------------------

export interface CleaningLevelInfo {
  key: CleaningLevel;
  title: string;
  description: string;
  recommendedFor: string;
  surchargeNote: string;
}

export const CLEANING_LEVELS: CleaningLevelInfo[] = [
  {
    key: "refresh",
    title: "My Home Just Needs a Refresh",
    description:
      "Perfect for homes that are already in good shape and simply need routine maintenance.",
    recommendedFor: "Regularly cleaned homes with minimal buildup.",
    surchargeNote: "No additional charge.",
  },
  {
    key: "extra_attention",
    title: "My Home Needs Extra Attention",
    description:
      "A few areas need additional time due to heavier dust, buildup, pet hair, or general lived-in conditions.",
    recommendedFor: "Homes that have gone a while between cleanings or see heavier daily use.",
    surchargeNote: "Adds a fee based on home size.",
  },
  {
    key: "significant_attention",
    title: "My Home Needs Significant Attention",
    description:
      "Ideal for homes that haven't been cleaned in quite some time or require substantially more work than a typical cleaning.",
    recommendedFor:
      "Homes with a significant backlog of cleaning — not appropriate for hoarding, biohazards, excessive clutter, or unsafe environments.",
    surchargeNote:
      "Adds the largest surcharge, based on home size. Sweepr may decline service if the scope exceeds what can be safely or reasonably completed.",
  },
];

export interface PackageScope {
  included: string[];
  excluded: string[];
  inheritsFrom?: ServiceType;
  banner?: string;
}

// Exclusions that apply to every package regardless of tier — these are
// scope-review territory (additional-attention fee or refusal), never simply
// "included with a higher tier."
export const UNIVERSAL_EXCLUSIONS: string[] = [
  "Biohazards (bodily fluids, mold remediation, pest infestations)",
  "Hoarder conditions",
  "Excessive clutter that blocks access to surfaces",
  "Garage (unless purchased as an add-on)",
];

const STANDARD_INCLUDED = [
  "Bathrooms",
  "Kitchen counters",
  "Bedrooms",
  "Living areas",
  "Vacuuming",
  "Mopping",
];

const STANDARD_EXCLUDED = [
  "Baseboards",
  "Inside oven",
  "Inside refrigerator",
  "Interior windows",
  "Garage",
];

const DEEP_INCLUDED = [
  ...STANDARD_INCLUDED,
  "Baseboards",
  "Doors & door frames",
  "Light fixtures",
  "Detailed dusting",
];

const MOVE_IN_OUT_INCLUDED = [
  ...DEEP_INCLUDED,
  "Inside cabinets",
  "Inside drawers",
  "Empty closets",
  "Interior shelving",
  "Appliance exterior detailing",
];

export const PACKAGE_SCOPES: Partial<Record<ServiceType, PackageScope>> = {
  standard: {
    included: STANDARD_INCLUDED,
    excluded: [...STANDARD_EXCLUDED, ...UNIVERSAL_EXCLUSIONS],
  },
  deep: {
    included: DEEP_INCLUDED,
    excluded: ["Inside oven", "Inside refrigerator", "Interior windows", "Garage", ...UNIVERSAL_EXCLUSIONS],
    inheritsFrom: "standard",
    banner: "⭐ Most Popular",
  },
  move_in_out: {
    included: MOVE_IN_OUT_INCLUDED,
    excluded: ["Inside refrigerator", "Interior windows", "Garage", ...UNIVERSAL_EXCLUSIONS],
    inheritsFrom: "deep",
    banner: "🚚 Move Specialists",
  },
  vacation_rental: {
    included: [
      "Dishes",
      "Bed making",
      "Linen change",
      "Trash removal",
      "Restocking supplies",
      "Bathroom reset",
      ...STANDARD_INCLUDED,
    ],
    excluded: [...STANDARD_EXCLUDED, ...UNIVERSAL_EXCLUSIONS],
  },
  recurring: {
    included: STANDARD_INCLUDED,
    excluded: [...STANDARD_EXCLUDED, ...UNIVERSAL_EXCLUSIONS],
    inheritsFrom: "standard",
    banner: "🏡 Great for Maintenance",
  },
};

// ---------------------------------------------------------------------------
// Add-on / package overlap
//
// Some ADD_ONS (packages/utils/src/pricing.ts) are already baked into a given
// package's included scope. When that's true the add-on should not be sold
// again for that package (it's redundant / already covered).
// ---------------------------------------------------------------------------

export const ADDON_PACKAGE_INCLUSIONS: Record<string, ServiceType[]> = {
  baseboards: ["deep", "move_in_out"],
  inside_cabinets: ["move_in_out"],
  dishes: ["vacation_rental"],
  laundry: ["vacation_rental"],
  // Airbnb/STR turnover base scope (Pricing v2 extended ruleset): bed making,
  // a dishwasher load, and the basic patio sweep are included in every
  // turnover, so their add-ons cannot be sold again. Garage sweep, interior
  // windows, window tracks, and the sliding glass door detail remain paid.
  change_bed_linens: ["vacation_rental"],
  load_dishwasher: ["vacation_rental"],
  patio_sweep: ["vacation_rental"],
};

export function isAddOnIncludedInPackage(addOnKey: string, serviceType: ServiceType): boolean {
  return ADDON_PACKAGE_INCLUSIONS[addOnKey]?.includes(serviceType) ?? false;
}

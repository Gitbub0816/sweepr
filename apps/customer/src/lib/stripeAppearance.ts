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
 * Sweepr-native Stripe Elements appearance.
 *
 * Card fields are always Stripe-hosted iframes — that boundary is PCI
 * compliance (SAQ A), not a styling choice, so it can't be removed. What we
 * DO control is every pixel around and inside that iframe. `theme: "flat"` (not
 * Stripe's default "stripe" theme) strips Stripe's own shadow/spacing
 * signature entirely, so these rules are the only visual language left —
 * copied 1:1 from packages/ui/src/primitives/Input.tsx and Button.tsx rather
 * than approximated, so a card field is indistinguishable from every other
 * field in the app.
 */

import type { Appearance } from "@stripe/stripe-js";

const BASE = {
  fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
  fontSizeBase: "16px", // matches Input.tsx — also keeps iOS from auto-zooming into the field
  fontWeightNormal: "400",
  fontWeightMedium: "500",
  borderRadius: "12px", // rounded-xl
  spacingUnit: "4px",
};

export const stripeAppearanceLight: Appearance = {
  theme: "flat",
  variables: {
    ...BASE,
    colorPrimary: "#0f766e",        // seafoam-700 — Button primary
    colorBackground: "#ffffff",
    colorText: "#1c1a17",           // charcoal
    colorTextSecondary: "#64748b",  // slate-500
    colorTextPlaceholder: "#94a3b8", // slate-400
    colorDanger: "#dc2626",
    colorSuccess: "#0f766e",
    colorWarning: "#f59e0b",
    focusBoxShadow: "none",
    focusOutline: "none",
    tabIconSelectedColor: "#0f766e",
    gridColumnSpacing: "16px",
    gridRowSpacing: "14px",
  },
  rules: {
    // 1:1 with Input.tsx's own classes (border-slate-300, focus:border-seafoam-500, focus:ring-2 ring-seafoam-400/20).
    ".Input": {
      border: "1px solid #e2e8f0",
      backgroundColor: "#ffffff",
      boxShadow: "none",
      transition: "border-color 0.15s, box-shadow 0.15s",
      padding: "10px 14px",
      fontSize: "16px",
      color: "#1c1a17",
    },
    ".Input:focus": {
      border: "1px solid #14b8a6", // seafoam-500
      boxShadow: "0 0 0 2px rgba(45,212,191,0.2)", // ring-seafoam-400/20
    },
    ".Input--invalid": {
      border: "1px solid #dc2626",
      boxShadow: "none",
    },
    ".Input::placeholder": {
      color: "#94a3b8",
    },
    ".Label": {
      fontSize: "14px",
      fontWeight: "500",
      color: "#334155",
      marginBottom: "6px",
    },
    ".Error": {
      fontSize: "13px",
      color: "#dc2626",
      marginTop: "4px",
    },
    // Payment-method tabs read as our own segmented control, not Stripe's.
    ".Tab": {
      border: "1px solid #cbd5e1",
      backgroundColor: "#ffffff",
      boxShadow: "none",
      color: "#64748b",
      padding: "10px 16px",
      transition: "border-color 0.15s, background-color 0.15s, color 0.15s",
    },
    ".Tab:hover": {
      color: "#0f766e",
      border: "1px solid #14b8a6",
      backgroundColor: "#f0fdfa", // seafoam-50
    },
    ".Tab--selected": {
      border: "1px solid #0f766e",
      backgroundColor: "#f0fdfa",
      color: "#0f766e",
      boxShadow: "none",
    },
    ".TabIcon": { fill: "#94a3b8" },
    ".TabIcon--selected": { fill: "#0f766e" },
    ".TabLabel--selected": { color: "#0f766e", fontWeight: "600" },
    ".Block": {
      borderRadius: "12px",
      border: "1px solid #cbd5e1",
      backgroundColor: "#ffffff",
      boxShadow: "none",
    },
    ".CheckboxInput": {
      border: "1px solid #cbd5e1",
      borderRadius: "4px",
    },
    ".CheckboxInput--checked": {
      backgroundColor: "#0f766e",
      border: "1px solid #0f766e",
    },
    // Stripe's own "Powered by Link" / brand chrome — keep it minimal, not absent
    // (removing it entirely isn't permitted by Stripe's terms), but flatten it.
    ".Link": { fontWeight: "500" },
  },
};

export const stripeAppearanceDark: Appearance = {
  theme: "flat",
  variables: {
    ...BASE,
    colorPrimary: "#2dd4bf",        // seafoam-400 — brighter for dark
    colorBackground: "#020617",     // matches dark:bg-slate-950 inputs use
    colorText: "#ffffff",
    colorTextSecondary: "#94a3b8",  // slate-400
    colorTextPlaceholder: "#64748b",
    colorDanger: "#f87171",
    colorSuccess: "#2dd4bf",
    colorWarning: "#fbbf24",
    focusBoxShadow: "none",
    focusOutline: "none",
    gridColumnSpacing: "16px",
    gridRowSpacing: "14px",
  },
  rules: {
    ".Input": {
      border: "1px solid #334155", // slate-700
      backgroundColor: "#020617",  // slate-950
      boxShadow: "none",
      transition: "border-color 0.15s, box-shadow 0.15s",
      padding: "10px 14px",
      fontSize: "16px",
      color: "#ffffff",
    },
    ".Input:focus": {
      border: "1px solid #2dd4bf",
      boxShadow: "0 0 0 2px rgba(45,212,191,0.2)",
    },
    ".Input--invalid": {
      border: "1px solid #f87171",
      boxShadow: "none",
    },
    ".Input::placeholder": { color: "#64748b" },
    ".Label": { fontSize: "14px", fontWeight: "500", color: "#94a3b8", marginBottom: "6px" },
    ".Error": { fontSize: "13px", color: "#f87171", marginTop: "4px" },
    ".Tab": {
      border: "1px solid #334155",
      backgroundColor: "#020617",
      boxShadow: "none",
      color: "#94a3b8",
      padding: "10px 16px",
      transition: "border-color 0.15s, background-color 0.15s, color 0.15s",
    },
    ".Tab:hover": {
      color: "#2dd4bf",
      border: "1px solid #2dd4bf",
      backgroundColor: "#0f2e2b",
    },
    ".Tab--selected": {
      border: "1px solid #2dd4bf",
      backgroundColor: "#0f2e2b",
      color: "#2dd4bf",
      boxShadow: "none",
    },
    ".TabIcon": { fill: "#64748b" },
    ".TabIcon--selected": { fill: "#2dd4bf" },
    ".TabLabel--selected": { color: "#2dd4bf", fontWeight: "600" },
    ".Block": {
      borderRadius: "12px",
      border: "1px solid #334155",
      backgroundColor: "#020617",
      boxShadow: "none",
    },
    ".CheckboxInput": {
      border: "1px solid #334155",
      borderRadius: "4px",
      backgroundColor: "#020617",
    },
    ".CheckboxInput--checked": {
      backgroundColor: "#2dd4bf",
      border: "1px solid #2dd4bf",
    },
    ".Link": { fontWeight: "500" },
  },
};

/** Returns the correct appearance based on whether dark mode is active. */
export function getStripeAppearance(isDark: boolean): Appearance {
  return isDark ? stripeAppearanceDark : stripeAppearanceLight;
}

/**
 * Sweepr-branded Stripe Elements appearance.
 *
 * Matches the Tailwind design tokens exactly:
 *  - Font: Inter (same as app)
 *  - Brand color: seafoam (#14b8a6 / #2dd4bf)
 *  - Light background: #f8fafb (offwhite)
 *  - Dark background: #1a1a2e (charcoal)
 *  - Border radius: 12px (rounded-xl)
 */

import type { Appearance } from "@stripe/stripe-js";

const BASE = {
  fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
  fontSizeBase: "14px",
  borderRadius: "12px",
  spacingUnit: "4px",
};

export const stripeAppearanceLight: Appearance = {
  theme: "stripe",
  variables: {
    ...BASE,
    colorPrimary: "#14b8a6",         // seafoam-500
    colorBackground: "#ffffff",
    colorText: "#1a1a2e",            // charcoal
    colorTextSecondary: "#64748b",   // slate-500
    colorDanger: "#ef4444",
    colorSuccess: "#14b8a6",
    colorWarning: "#f59e0b",
    focusBoxShadow: "0 0 0 3px rgba(20,184,166,0.2)",
    focusOutline: "2px solid #14b8a6",
    tabIconSelectedColor: "#14b8a6",
    gridColumnSpacing: "16px",
    gridRowSpacing: "14px",
  },
  rules: {
    ".Input": {
      border: "1.5px solid #e2e8f0",
      backgroundColor: "#f8fafb",
      boxShadow: "none",
      transition: "border-color 0.15s, box-shadow 0.15s",
      padding: "10px 14px",
      fontSize: "14px",
      color: "#1a1a2e",
    },
    ".Input:focus": {
      border: "1.5px solid #14b8a6",
      boxShadow: "0 0 0 3px rgba(20,184,166,0.15)",
      backgroundColor: "#ffffff",
    },
    ".Input--invalid": {
      border: "1.5px solid #ef4444",
      boxShadow: "0 0 0 3px rgba(239,68,68,0.12)",
    },
    ".Input::placeholder": {
      color: "#94a3b8",
    },
    ".Label": {
      fontSize: "13px",
      fontWeight: "500",
      color: "#475569",
      marginBottom: "6px",
    },
    ".Error": {
      fontSize: "12px",
      color: "#ef4444",
      marginTop: "4px",
    },
    ".Tab": {
      border: "1.5px solid #e2e8f0",
      backgroundColor: "#f8fafb",
      boxShadow: "none",
      color: "#64748b",
      padding: "10px 16px",
    },
    ".Tab:hover": {
      color: "#14b8a6",
      border: "1.5px solid #14b8a6",
      backgroundColor: "#f0fdfa",
    },
    ".Tab--selected": {
      border: "1.5px solid #14b8a6",
      backgroundColor: "#f0fdfa",
      color: "#0d9488",
      boxShadow: "0 0 0 3px rgba(20,184,166,0.12)",
    },
    ".Tab--selected:focus": {
      boxShadow: "0 0 0 3px rgba(20,184,166,0.2)",
    },
    ".TabIcon": {
      fill: "#94a3b8",
    },
    ".TabIcon--selected": {
      fill: "#14b8a6",
    },
    ".TabLabel--selected": {
      color: "#0d9488",
      fontWeight: "600",
    },
    ".Block": {
      borderRadius: "12px",
      border: "1.5px solid #e2e8f0",
      backgroundColor: "#f8fafb",
    },
    ".CheckboxInput": {
      border: "1.5px solid #e2e8f0",
      borderRadius: "4px",
    },
    ".CheckboxInput--checked": {
      backgroundColor: "#14b8a6",
      border: "1.5px solid #14b8a6",
    },
  },
};

export const stripeAppearanceDark: Appearance = {
  theme: "night",
  variables: {
    ...BASE,
    colorPrimary: "#2dd4bf",         // seafoam-400 (brighter for dark)
    colorBackground: "#0f172a",      // slate-900
    colorText: "#f1f5f9",            // slate-100
    colorTextSecondary: "#94a3b8",   // slate-400
    colorDanger: "#f87171",
    colorSuccess: "#2dd4bf",
    colorWarning: "#fbbf24",
    focusBoxShadow: "0 0 0 3px rgba(45,212,191,0.2)",
    focusOutline: "2px solid #2dd4bf",
    gridColumnSpacing: "16px",
    gridRowSpacing: "14px",
  },
  rules: {
    ".Input": {
      border: "1.5px solid #334155",
      backgroundColor: "#1e293b",
      boxShadow: "none",
      transition: "border-color 0.15s, box-shadow 0.15s",
      padding: "10px 14px",
      fontSize: "14px",
      color: "#f1f5f9",
    },
    ".Input:focus": {
      border: "1.5px solid #2dd4bf",
      boxShadow: "0 0 0 3px rgba(45,212,191,0.15)",
      backgroundColor: "#1e293b",
    },
    ".Input--invalid": {
      border: "1.5px solid #f87171",
      boxShadow: "0 0 0 3px rgba(248,113,113,0.12)",
    },
    ".Input::placeholder": {
      color: "#64748b",
    },
    ".Label": {
      fontSize: "13px",
      fontWeight: "500",
      color: "#94a3b8",
      marginBottom: "6px",
    },
    ".Error": {
      fontSize: "12px",
      color: "#f87171",
      marginTop: "4px",
    },
    ".Tab": {
      border: "1.5px solid #334155",
      backgroundColor: "#1e293b",
      boxShadow: "none",
      color: "#94a3b8",
      padding: "10px 16px",
    },
    ".Tab:hover": {
      color: "#2dd4bf",
      border: "1.5px solid #2dd4bf",
      backgroundColor: "#1a3a38",
    },
    ".Tab--selected": {
      border: "1.5px solid #2dd4bf",
      backgroundColor: "#134e4a",
      color: "#2dd4bf",
      boxShadow: "0 0 0 3px rgba(45,212,191,0.12)",
    },
    ".TabLabel--selected": {
      color: "#2dd4bf",
      fontWeight: "600",
    },
    ".Block": {
      borderRadius: "12px",
      border: "1.5px solid #334155",
      backgroundColor: "#1e293b",
    },
    ".CheckboxInput": {
      border: "1.5px solid #334155",
      borderRadius: "4px",
      backgroundColor: "#1e293b",
    },
    ".CheckboxInput--checked": {
      backgroundColor: "#2dd4bf",
      border: "1.5px solid #2dd4bf",
    },
  },
};

/** Returns the correct appearance based on whether dark mode is active. */
export function getStripeAppearance(isDark: boolean): Appearance {
  return isDark ? stripeAppearanceDark : stripeAppearanceLight;
}

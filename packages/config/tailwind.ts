/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";

/**
 * Shared Tailwind preset for all Sweepr apps.
 * Apps spread this into their own `presets: [sweeprPreset]`.
 */
const preset: Partial<Config> = {
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        seafoam: {
          50: "#f0fdfa",
          100: "#ccfbf1",
          200: "#99f6e4",
          300: "#5eead4",
          400: "#2dd4bf",
          500: "#14b8a6",
          600: "#0d9488",
          700: "#0f766e",
          800: "#115e59",
          900: "#134e4a",
        },
        // Neutral surface scale — "warm graphite". Overrides Tailwind's default
        // `slate` (which is blue-gray) with a warm, faintly-brown neutral so the
        // dark theme (and muted light-mode grays) read gray, never blue.
        slate: {
          50: "#faf9f8",
          100: "#f5f4f2",
          200: "#e7e5e2",
          300: "#d6d3ce",
          400: "#a8a39c",
          500: "#78726b",
          600: "#57524c",
          700: "#44403b",
          800: "#2a2622",
          900: "#1c1a17",
          950: "#12100e",
        },
        charcoal: {
          DEFAULT: "#1c1a17",
          50: "#f5f4f2",
          900: "#1c1a17",
        },
        offwhite: "#f9f8f6",
        amberaccent: "#f59e0b",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "gradient-shift": {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
        sweep: {
          "0%": { transform: "translateX(-100%)" },
          "60%, 100%": { transform: "translateX(200%)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.5s ease-out both",
        "gradient-shift": "gradient-shift 12s ease infinite",
        sweep: "sweep 1.8s ease-in-out infinite",
      },
    },
  },
  plugins: [
    // Subtle dark-mode film grain. A fixed, non-interactive grayscale-noise
    // overlay at low opacity — present but never loud. Dark mode only; light
    // mode stays clean. The noise is an inline SVG (feTurbulence) so there's no
    // asset request and it's CSP-safe.
    plugin(({ addBase }) => {
      addBase({
        ".dark body::after": {
          content: '""',
          position: "fixed",
          inset: "0",
          pointerEvents: "none",
          zIndex: "9999",
          opacity: "0.04",
          backgroundRepeat: "repeat",
          backgroundSize: "180px 180px",
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        },
      });
    }),
  ],
};

export default preset;

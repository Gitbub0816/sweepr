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
import preset from "@sweepr/config/tailwind";

export default {
  presets: [preset as Config],
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Sweepr Business accent — brand platinum (base #4B5056, mid #666C73,
        // highlight #B7BDC4, shadow #2C3035) from the Business wordmark.
        platinum: {
          50: "#f4f5f6",
          100: "#e7e9eb",
          200: "#ced2d6",
          300: "#b7bdc4",
          400: "#8f969e",
          500: "#666c73",
          600: "#575d64",
          700: "#4b5056",
          800: "#3a3e44",
          900: "#2c3035",
        },
        // Remap the platform accent to platinum FOR THIS APP ONLY, so shared
        // @sweepr/ui components (Button, focus rings, calendar) pick up the
        // Business styling without forking them. Other apps keep seafoam.
        seafoam: {
          50: "#f4f5f6",
          100: "#e7e9eb",
          200: "#ced2d6",
          300: "#b7bdc4",
          400: "#8f969e",
          500: "#666c73",
          600: "#575d64",
          700: "#4b5056",
          800: "#3a3e44",
          900: "#2c3035",
        },
      },
      fontFamily: {
        // Eurostile Extended Bold is the brand display face; Michroma is the
        // self-hosted open stand-in (drop licensed Eurostile into the same
        // @font-face in index.css when available).
        display: ["Michroma", "Eurostile", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
} satisfies Config;

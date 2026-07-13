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
        // Sweepr Business accent — metallic gold pulled from the Business
        // wordmark's sparkle marks, over the shared warm-graphite neutrals.
        gold: {
          50: "#fbf7ec",
          100: "#f6edd4",
          200: "#eddaa6",
          300: "#e3c377",
          400: "#dab052",
          500: "#d09e38",
          600: "#b9862b",
          700: "#996c23",
          800: "#7a5520",
          900: "#5f421c",
        },
        // Remap the platform accent to gold FOR THIS APP ONLY, so shared
        // @sweepr/ui components (Button, focus rings, calendar) pick up the
        // Business styling without forking them. Other apps keep seafoam.
        seafoam: {
          50: "#fbf7ec",
          100: "#f6edd4",
          200: "#eddaa6",
          300: "#e3c377",
          400: "#dab052",
          500: "#d09e38",
          600: "#b9862b",
          700: "#996c23",
          800: "#7a5520",
          900: "#5f421c",
        },
      },
    },
  },
} satisfies Config;

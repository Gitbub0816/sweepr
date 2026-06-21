import type { Config } from "tailwindcss";
import preset from "@sweepr/config/tailwind";

export default {
  presets: [preset as Config],
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
} satisfies Config;

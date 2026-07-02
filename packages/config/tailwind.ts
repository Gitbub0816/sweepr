import type { Config } from "tailwindcss";

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
        charcoal: {
          DEFAULT: "#1a1a2e",
          50: "#f4f4f7",
          900: "#1a1a2e",
        },
        offwhite: "#f8fafb",
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
};

export default preset;

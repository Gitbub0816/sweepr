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
      // Motion tokens. Sweepr motion is fast and physical: 150–250ms, strong
      // ease-out for entrances, no bounce on professional surfaces. Springs are
      // reserved for celebration moments (handled per-component). These names
      // are the shared vocabulary every app uses so timing stays consistent.
      transitionTimingFunction: {
        // Strong ease-out — the default entrance/press curve.
        "out-quart": "cubic-bezier(0.23, 1, 0.32, 1)",
        // Symmetric acceleration for on-screen movement/morphs.
        "in-out-strong": "cubic-bezier(0.77, 0, 0.175, 1)",
        // iOS-like sheet/drawer curve.
        drawer: "cubic-bezier(0.32, 0.72, 0, 1)",
      },
      transitionDuration: {
        press: "120ms",
        base: "180ms",
        modal: "220ms",
        sheet: "360ms",
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
        // Skeleton sheen: a highlight sweeping across a 200%-wide gradient.
        shimmer: {
          "0%": { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" },
        },
        // Checkmark draw-on. Paths use pathLength="1" so this is length-agnostic.
        "check-draw": {
          from: { strokeDashoffset: "1" },
          to: { strokeDashoffset: "0" },
        },
        // A single soft halo pulse (not the infinite Tailwind `ping`). Used as a
        // one-shot acknowledgement — check-in, a new unread notification.
        "ping-soft": {
          "0%": { transform: "scale(0.9)", opacity: "0.5" },
          "80%, 100%": { transform: "scale(1.8)", opacity: "0" },
        },
        // Centered modal entrance/exit. Includes the -50%/-50% translate so it
        // composes with the content's centering utilities without a jump.
        "modal-in": {
          from: { opacity: "0", transform: "translate(-50%, -50%) scale(0.96)" },
          to: { opacity: "1", transform: "translate(-50%, -50%) scale(1)" },
        },
        "modal-out": {
          from: { opacity: "1", transform: "translate(-50%, -50%) scale(1)" },
          to: { opacity: "0", transform: "translate(-50%, -50%) scale(0.96)" },
        },
        "fade-out": {
          from: { opacity: "1" },
          to: { opacity: "0" },
        },
        // Reduced-motion fallback: opacity only, no movement.
        "reduced-fade": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.5s cubic-bezier(0.23, 1, 0.32, 1) both",
        "gradient-shift": "gradient-shift 12s ease infinite",
        sweep: "sweep 1.8s ease-in-out infinite",
        shimmer: "shimmer 1.5s linear infinite",
        // One-pass gold sheen — reuses the `sweep` keyframe, but a single
        // iteration so it never loops on high-frequency surfaces.
        sheen: "sweep 1.1s cubic-bezier(0.23, 1, 0.32, 1)",
        "check-draw": "check-draw 400ms cubic-bezier(0.23, 1, 0.32, 1) 100ms both",
        "ping-soft": "ping-soft 0.9s cubic-bezier(0, 0, 0.2, 1)",
        "modal-in": "modal-in 220ms cubic-bezier(0.23, 1, 0.32, 1) both",
        "modal-out": "modal-out 150ms cubic-bezier(0.23, 1, 0.32, 1) both",
        "fade-out": "fade-out 150ms ease-out both",
      },
    },
  },
  plugins: [
    // Stagger utility + a softened reduced-motion baseline. Keyed off `--i`:
    // set `style={{ "--i": index }}` on each list item and add `stagger-item`.
    plugin(({ addBase, addComponents }) => {
      addComponents({
        ".stagger-item": {
          opacity: "0",
          animation: "fade-in 0.5s cubic-bezier(0.23, 1, 0.32, 1) both",
          animationDelay: "calc(var(--i, 0) * 45ms)",
        },
      });
      addBase({
        // Soften, don't zero. Under reduced-motion the preset's movement
        // animations collapse to a brief opacity crossfade instead of a hard
        // cut; the purely decorative sweeps/pulses drop out entirely. Apps that
        // ship a blanket `*{animation-duration:0}` reset will further shorten
        // these to instant, which is still an acceptable (motion-free) result.
        "@media (prefers-reduced-motion: reduce)": {
          ".stagger-item, .animate-fade-in, .animate-modal-in, .animate-modal-out, .animate-fade-out":
            {
              animationName: "reduced-fade",
              animationDuration: "160ms",
              animationTimingFunction: "ease-out",
              animationDelay: "0ms",
              opacity: "1",
            },
          ".animate-shimmer, .animate-sheen, .animate-check-draw, .animate-ping-soft":
            {
              animation: "none",
            },
        },
      });
    }),
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

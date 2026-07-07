/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: { port: 5173 },
  build: {
    target: "es2020",
    cssCodeSplit: true,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        // Function form (rather than the object shorthand) so every module
        // id — including submodule entry points like "react-dom/client" —
        // is bucketed by an explicit substring check on its resolved path.
        // The object shorthand silently failed to catch "react-dom/client",
        // which let react-dom's createRoot get folded into the vendor-three
        // chunk and made it load eagerly on first paint.
        manualChunks(id: string) {
          // Vite's shared dynamic-import runtime helper (a virtual module,
          // id starts with \0) is used by every lazy()/import() call site
          // in the app, including the App.tsx/HeroScene.tsx ones that
          // exist specifically to AVOID loading vendor-three/vendor-clerk
          // eagerly. Left unpinned, Rollup was duplicating it *into* those
          // vendor chunks and then having the main entry import that copy
          // — which forced the whole vendor-three/vendor-clerk chunk to
          // load on first paint. Giving it its own tiny named chunk keeps
          // it out of both.
          if (id.includes("vite/preload-helper")) return "vendor-preload-helper";
          if (!id.includes("node_modules")) return undefined;
          // The actual "react"/"react-dom" packages must be matched FIRST,
          // by their real node_modules/<pkg>/ directory (not just any path
          // that happens to contain a "/react/" segment) — several
          // unrelated packages ship a wrapper file under a path like
          // ".../@clerk/shared/dist/runtime/react/index.mjs" that
          // re-exports React hooks (e.g. useSyncExternalStore). If that
          // wrapper were bucketed into vendor-clerk/vendor-three instead of
          // vendor-react, code elsewhere that ends up resolving through it
          // would force that whole vendor chunk to load eagerly with the
          // entry — which is exactly what happened before this fix.
          if (
            id.includes(`${path.sep}node_modules${path.sep}react${path.sep}`) ||
            id.includes(`${path.sep}node_modules${path.sep}react-dom${path.sep}`) ||
            id.includes(`${path.sep}node_modules${path.sep}react-router-dom${path.sep}`) ||
            id.includes(`${path.sep}node_modules${path.sep}react-router${path.sep}`) ||
            id.includes(`${path.sep}node_modules${path.sep}scheduler${path.sep}`) ||
            id.includes("use-sync-external-store")
          )
            return "vendor-react";
          if (id.includes("@clerk")) return "vendor-clerk";
          if (id.includes("framer-motion") || id.includes("@react-spring"))
            return "vendor-motion";
          if (id.includes("@tanstack/react-query")) return "vendor-query";
          if (id.includes("mapbox-gl")) return "vendor-mapbox";
          if (
            id.includes(`${path.sep}node_modules${path.sep}three${path.sep}`) ||
            id.includes("@react-three")
          )
            return "vendor-three";
          return undefined;
        },
      },
    },
  },
  optimizeDeps: {
    include: ["react", "react-dom", "framer-motion"],
  },
});

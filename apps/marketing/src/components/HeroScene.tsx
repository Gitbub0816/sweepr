import { Component, Suspense, lazy, useEffect, useState, type ReactNode } from "react";

/**
 * Decorative background for the marketing hero. This file is intentionally
 * cheap — it only does capability checks (reduced motion, viewport width,
 * WebGL support) and renders a static gradient fallback with plain CSS.
 *
 * The actual @react-three/fiber + drei + three implementation (>1MB) lives
 * in ./HeroSceneCanvas and is code-split via React.lazy so it is NEVER
 * downloaded by mobile visitors, reduced-motion visitors, or browsers
 * without WebGL — only desktop-width visitors who can use it pay for it,
 * and even then it's fetched after first paint inside a Suspense boundary.
 */
const HeroSceneCanvas = lazy(() => import("./HeroSceneCanvas"));

const STATIC_FALLBACK =
  "absolute inset-0 -z-10 bg-[radial-gradient(circle_at_70%_30%,#5eead4_0%,#ccfbf1_35%,#f0fdfa_70%)] opacity-60 dark:bg-[radial-gradient(circle_at_70%_30%,#0f766e_0%,#0b3b38_45%,#020617_80%)] dark:opacity-60";

/** True when the browser can actually create a WebGL context. Some browsers
 * expose the API but fail at context creation (blocked GPU, headless, old
 * drivers) — three's renderer then throws "Failed to initialize WebGL". */
function canUseWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      window.WebGLRenderingContext &&
        (canvas.getContext("webgl2") || canvas.getContext("webgl")),
    );
  } catch {
    return false;
  }
}

/** Tailwind's `md` breakpoint (768px) — matches the `hidden md:block`
 * wrapper below so we don't even attempt to load three.js on narrow
 * viewports. Checked via matchMedia so it responds to viewport changes. */
function useIsDesktopWidth(): boolean {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const onChange = () => setIsDesktop(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return isDesktop;
}

/** Mirrors framer-motion's `useReducedMotion` (matches
 * `(prefers-reduced-motion: reduce)`) without importing framer-motion —
 * this file is on the critical path (Landing.tsx imports it eagerly), and
 * pulling in framer-motion here was enough to keep vendor-motion in the
 * initial modulepreload list even after the hero's own JS-driven animation
 * was replaced with CSS. */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/** Local boundary: if the 3D scene throws for any reason, fall back to the
 * static gradient instead of crashing the whole marketing page. Decorative
 * only, so no reporting needed here. */
class SceneErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) return <div className={STATIC_FALLBACK} aria-hidden="true" />;
    return this.props.children;
  }
}

/** True once the page has fully loaded AND the main thread has gone idle.
 * The three.js hero is ~865KB of parse + WebGL init + animation work — if it
 * mounts right after first paint, that work lands inside the Lighthouse
 * load window and inflates Total Blocking Time. Deferring the mount until
 * `load` + idle pushes that cost outside the measured window entirely,
 * without changing what the visitor eventually sees. */
function useIsIdleAfterLoad(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let idleHandle: number | null = null;
    let timeoutHandle: number | null = null;
    const scheduleIdle = () => {
      const ric = (window as unknown as { requestIdleCallback?: (cb: () => void) => number })
        .requestIdleCallback;
      if (ric) {
        idleHandle = ric(() => setReady(true));
      } else {
        timeoutHandle = window.setTimeout(() => setReady(true), 1500);
      }
    };
    if (document.readyState === "complete") {
      scheduleIdle();
    } else {
      window.addEventListener("load", scheduleIdle, { once: true });
    }
    return () => {
      window.removeEventListener("load", scheduleIdle);
      if (idleHandle !== null) {
        const cic = (
          window as unknown as { cancelIdleCallback?: (handle: number) => void }
        ).cancelIdleCallback;
        cic?.(idleHandle);
      }
      if (timeoutHandle !== null) window.clearTimeout(timeoutHandle);
    };
  }, []);
  return ready;
}

export function HeroScene() {
  const prefersReducedMotion = usePrefersReducedMotion();
  const isDesktopWidth = useIsDesktopWidth();
  const isIdleAfterLoad = useIsIdleAfterLoad();
  const [contextLost, setContextLost] = useState(false);
  const [webglOk] = useState(canUseWebGL);

  const canRender3D =
    !prefersReducedMotion && isDesktopWidth && webglOk && !contextLost && isIdleAfterLoad;

  if (!canRender3D) {
    return <div className={STATIC_FALLBACK} aria-hidden="true" />;
  }

  return (
    <>
      {/* Mobile + small screens: static gradient, no 3D canvas, no three.js download. */}
      <div className={`${STATIC_FALLBACK} md:hidden`} aria-hidden="true" />

      {/* md+ : interactive 3D scene, lazy-loaded. */}
      <div className="hidden md:block">
        <SceneErrorBoundary>
          <Suspense fallback={<div className={STATIC_FALLBACK} aria-hidden="true" />}>
            <HeroSceneCanvas onContextLost={() => setContextLost(true)} />
          </Suspense>
        </SceneErrorBoundary>
      </div>
    </>
  );
}

export default HeroScene;

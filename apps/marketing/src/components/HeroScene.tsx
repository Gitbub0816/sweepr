import { Component, Suspense, lazy, useEffect, useState, type ReactNode } from "react";
import { useReducedMotion } from "framer-motion";

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

export function HeroScene() {
  const prefersReducedMotion = useReducedMotion();
  const isDesktopWidth = useIsDesktopWidth();
  const [contextLost, setContextLost] = useState(false);
  const [webglOk] = useState(canUseWebGL);

  const canRender3D = !prefersReducedMotion && isDesktopWidth && webglOk && !contextLost;

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

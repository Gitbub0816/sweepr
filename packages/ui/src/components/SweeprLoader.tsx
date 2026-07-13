/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { useEffect, useRef, useState } from "react";
import { cn } from "@sweepr/utils";
import { useReducedMotion } from "../hooks/useReducedMotion";
import animationData from "../assets/sweepr-loader.json";

/**
 * Branded loading indicator: the Sweepr broom sweeping side to side with
 * faint dust puffs. Vector Lottie — crisp at any size, seamless loop.
 *
 * The animation player (lottie-web light build) is loaded lazily so it never
 * blocks first paint; until it's ready — and permanently when the user
 * prefers reduced motion — a static broom renders instead.
 */
export function SweeprLoader({
  size = 96,
  label = "Loading…",
  className,
}: {
  /** Rendered box size in px (the animation is square). */
  size?: number;
  /** Accessible busy label. */
  label?: string;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    if (reducedMotion) return;
    const el = containerRef.current;
    if (!el) return;
    let anim: { destroy: () => void } | undefined;
    let cancelled = false;
    import("lottie-web/build/player/lottie_light").then((lottie) => {
      if (cancelled) return;
      anim = lottie.default.loadAnimation({
        container: el,
        renderer: "svg",
        loop: true,
        autoplay: true,
        animationData,
      });
      setAnimating(true);
    });
    return () => {
      cancelled = true;
      anim?.destroy();
      setAnimating(false);
    };
  }, [reducedMotion]);

  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={label}
      className={cn("relative inline-block", className)}
      style={{ width: size, height: size }}
    >
      {/* Static broom: first paint + prefers-reduced-motion. Sized/placed to
          match the icon's footprint inside the 400x400 animation comp. */}
      {!animating && (
        <div
          aria-hidden="true"
          className="absolute"
          style={{ left: "17%", top: "20.5%", width: "66%", height: "64%" }}
        >
          <StaticBroom />
        </div>
      )}
      <div ref={containerRef} className="absolute inset-0" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

function StaticBroom() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 264 256" width="100%" height="100%">
      <defs>
        <linearGradient id="swl-handle" gradientUnits="userSpaceOnUse" x1="181" y1="54" x2="146" y2="113">
          <stop offset="0" stopColor="#4bd0a8" />
          <stop offset="1" stopColor="#14a8b0" />
        </linearGradient>
        <linearGradient id="swl-bristles" gradientUnits="userSpaceOnUse" x1="64" y1="140" x2="150" y2="200">
          <stop offset="0" stopColor="#52e0b2" />
          <stop offset="0.45" stopColor="#43d1a6" />
          <stop offset="1" stopColor="#1fbaa7" />
        </linearGradient>
        <linearGradient id="swl-ferrule" gradientUnits="userSpaceOnUse" x1="-20" y1="-8" x2="20" y2="6">
          <stop offset="0" stopColor="#43d3ae" />
          <stop offset="1" stopColor="#2ec2a6" />
        </linearGradient>
      </defs>
      <path
        fill="url(#swl-handle)"
        d="M138.2 110.5 Q153.9 83.3 169.9 56.5 Q172.9 50.9 179.8 49.5 Q187.8 50.4 189.3 57.4 C185.4 68.2 169.6 92.6 159.2 109.5 C158.3 113.1 156.9 116.0 153.4 117.6 C148.6 116.4 143.4 113.9 139.7 112.35 Q138.6 111.8 138.2 110.5 Z"
      />
      <path
        fill="url(#swl-ferrule)"
        transform="translate(137.6 128.7) rotate(33.5)"
        d="M23.9 0 C23.9 -6.8 14.0 -10.95 5.0 -10.8 C-3.4 -9.5 -23.2 -7.7 -22.8 0 C-23.0 5.6 -13.5 7.6 0 7.9 C11.5 7.9 23.9 5.6 23.9 0 Z"
      />
      <path
        fill="url(#swl-bristles)"
        d="M110.9 126.2 Q121.8 135.6 135.0 143.6 C138.4 145.5 145.4 146.5 154.6 149.4 Q156.1 150.1 156.1 152.0 L156.1 154.2 C157.1 158.5 156.8 163.0 155.8 167.5 C154.9 175.5 153.6 186.2 151.4 196.9 Q150.8 201.0 148.2 202.6 C147.2 203.6 145.4 203.7 143.9 202.7 C141.9 201.0 138.3 200.3 137.0 199.2 Q135.8 198.0 135.9 195.6 C136.6 189.0 139.4 178.6 142.1 166.6 Q141.5 159.0 140.6 165.0 C137.0 171.4 132.0 182.7 127.2 192.6 Q126.6 195.7 124.1 196.1 C121.4 196.3 119.1 195.0 118.0 192.2 C114.6 191.6 113.8 189.2 114.8 186.0 C117.2 180.4 121.6 172.8 126.6 164.4 Q130.2 155.9 124.8 162.1 C122.4 164.2 120.2 166.0 118.2 167.5 C116.0 169.6 113.3 170.6 110.4 170.0 C107.4 169.3 105.3 167.1 103.9 164.4 C104.0 161.7 106.0 158.7 107.9 156.4 C109.5 154.5 110.7 153.3 111.4 152.5 Q110.0 150.1 108.6 152.9 C104.9 155.7 98.2 158.9 93.2 160.7 C88.0 162.4 82.5 163.4 76.5 163.6 C70.6 163.9 66.4 163.0 63.3 160.7 C60.7 158.4 59.2 156.2 59.2 154.3 C59.2 152.9 60.3 151.6 62.6 150.9 C81.0 146.9 99.0 136.5 108.9 126.1 Q109.9 125.2 110.9 126.2 Z"
      />
      <path fill="#f2d474" d="M76.0 58.8 Q80.0 74.7 95.2 79.3 Q80.2 83.5 76.2 98.9 Q72.8 82.9 57.2 79.3 Q72.4 74.7 76.0 58.8 Z" />
      <path fill="#38d0ba" d="M96.8 95.8 Q98.8 104.6 106.6 107.0 Q98.8 109.4 96.8 114.8 Q94.8 109.4 89.4 107.0 Q94.4 104.0 96.8 95.8 Z" />
      <path fill="#f0d878" d="M180.7 112.9 Q184.1 125.4 197.3 128.8 Q184.5 132.2 181.1 145.7 Q177.1 132.6 165.8 128.8 Q177.9 125.9 180.7 112.9 Z" />
      <ellipse fill="#40cbaa" cx="180.8" cy="165.2" rx="5.2" ry="6.2" />
    </svg>
  );
}

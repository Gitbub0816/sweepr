/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

/**
 * React Three Fiber scenes for the Site Analytics dashboard: a visitor globe
 * (sessions plotted at city coordinates) and a 3D daily-traffic bar skyline.
 * Both are decorative-but-honest: every mark maps 1:1 to a data row, hover
 * shows exact values, and the same numbers are always available in the 2D
 * panels/tables beside them. Auto-motion pauses for prefers-reduced-motion.
 */

import { useMemo, useRef, useState } from "react";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { useReducedMotion } from "@sweepr/ui";

// Validated chart colors (dataviz six-checks, light #f9f8f6 / dark #1c1a17).
const COLORS = {
  light: { mark: "#0d9488", hover: "#f59e0b", frame: "#0d9488", dim: "#d6d3ce" },
  dark: { mark: "#2dd4bf", hover: "#fbbf24", frame: "#14b8a6", dim: "#44403b" },
};

export interface CityPoint {
  city: string;
  region: string | null;
  country: string | null;
  sessions: number;
  lat: number;
  lon: number;
}

export interface DayBar {
  bucket: string;
  sessions: number;
  pageviews: number;
}

interface Tooltip {
  x: number;
  y: number;
  title: string;
  detail: string;
}

function latLonToVec3(lat: number, lon: number, r: number): [number, number, number] {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lon + 180) * Math.PI) / 180;
  return [-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta)];
}

/** Latitude/longitude graticule rings — the globe's "wireframe" without the
 * diagonal triangle edges a wireframe sphere would draw. */
function Graticule({ color }: { color: string }) {
  const lines = useMemo(() => {
    const out: Float32Array[] = [];
    const seg = 96;
    // Latitude rings.
    for (let lat = -60; lat <= 60; lat += 30) {
      const pts = new Float32Array(seg * 3);
      for (let i = 0; i < seg; i++) {
        const lon = (i / seg) * 360 - 180;
        const [x, y, z] = latLonToVec3(lat, lon, 1);
        pts.set([x, y, z], i * 3);
      }
      out.push(pts);
    }
    // Meridians: each great circle covers lon and lon+180, so 6 rings = 12.
    for (let lon = -180; lon < 0; lon += 30) {
      const pts = new Float32Array(seg * 3);
      for (let i = 0; i < seg; i++) {
        const a = (i / seg) * 360 - 180;
        const lat = a > 90 ? 180 - a : a < -90 ? -180 - a : a;
        const [x, y, z] = latLonToVec3(lat, a > 90 || a < -90 ? lon + 180 : lon, 1);
        pts.set([x, y, z], i * 3);
      }
      out.push(pts);
    }
    return out;
  }, []);
  return (
    <>
      {lines.map((pts, i) => (
        <lineLoop key={i}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[pts, 3]} />
          </bufferGeometry>
          <lineBasicMaterial color={color} transparent opacity={0.28} />
        </lineLoop>
      ))}
    </>
  );
}

function GlobeGroup({
  cities,
  dark,
  paused,
  onHover,
}: {
  cities: CityPoint[];
  dark: boolean;
  paused: boolean;
  onHover: (t: Tooltip | null) => void;
}) {
  const group = useRef<THREE.Group>(null);
  const drag = useRef<{ active: boolean; lastX: number; lastY: number; vel: number }>({
    active: false,
    lastX: 0,
    lastY: 0,
    vel: 0.0015,
  });
  const c = dark ? COLORS.dark : COLORS.light;
  const max = Math.max(1, ...cities.map((p) => p.sessions));

  useFrame(() => {
    if (!group.current) return;
    if (!drag.current.active && !paused) {
      group.current.rotation.y += drag.current.vel;
    }
  });

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    drag.current.active = true;
    drag.current.lastX = e.nativeEvent.clientX;
    drag.current.lastY = e.nativeEvent.clientY;
  };
  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (!drag.current.active || !group.current) return;
    const dx = e.nativeEvent.clientX - drag.current.lastX;
    const dy = e.nativeEvent.clientY - drag.current.lastY;
    drag.current.lastX = e.nativeEvent.clientX;
    drag.current.lastY = e.nativeEvent.clientY;
    group.current.rotation.y += dx * 0.005;
    group.current.rotation.x = THREE.MathUtils.clamp(group.current.rotation.x + dy * 0.003, -0.9, 0.9);
  };
  const endDrag = () => {
    drag.current.active = false;
  };

  return (
    <group
      ref={group}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
    >
      {/* Soft body so the far side of the graticule recedes */}
      <mesh>
        <sphereGeometry args={[0.985, 48, 48]} />
        <meshBasicMaterial color={dark ? "#1c1a17" : "#f9f8f6"} transparent opacity={0.92} />
      </mesh>
      <Graticule color={c.frame} />
      {cities.map((p, i) => {
        const pos = latLonToVec3(p.lat, p.lon, 1.012);
        const r = 0.014 + Math.sqrt(p.sessions / max) * 0.05;
        return (
          <mesh
            key={`${p.city}-${i}`}
            position={pos}
            onPointerOver={(e) => {
              e.stopPropagation();
              onHover({
                x: e.nativeEvent.offsetX,
                y: e.nativeEvent.offsetY,
                title: [p.city, p.region, p.country].filter(Boolean).join(", "),
                detail: `${p.sessions.toLocaleString()} session${p.sessions === 1 ? "" : "s"}`,
              });
            }}
            onPointerOut={() => onHover(null)}
          >
            <sphereGeometry args={[r, 12, 12]} />
            <meshBasicMaterial color={c.mark} />
          </mesh>
        );
      })}
    </group>
  );
}

function SceneTooltip({ tip }: { tip: Tooltip | null }) {
  if (!tip) return null;
  return (
    <div
      className="pointer-events-none absolute z-10 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-md dark:border-slate-700 dark:bg-slate-800"
      style={{ left: Math.max(8, tip.x + 12), top: Math.max(8, tip.y - 8) }}
    >
      <p className="font-semibold text-charcoal dark:text-white">{tip.title}</p>
      <p className="text-slate-500 dark:text-slate-400">{tip.detail}</p>
    </div>
  );
}

/** Visitor globe: one dot per city, sized by sessions. Drag to rotate. */
export function VisitorGlobe({ cities, dark }: { cities: CityPoint[]; dark: boolean }) {
  const reduced = useReducedMotion();
  const [tip, setTip] = useState<Tooltip | null>(null);
  return (
    <div className="relative h-72 w-full cursor-grab active:cursor-grabbing sm:h-80">
      <Canvas dpr={[1, 2]} gl={{ antialias: true, alpha: true }} camera={{ position: [0, 0.35, 2.6], fov: 45 }}>
        <GlobeGroup cities={cities} dark={dark} paused={reduced || tip !== null} onHover={setTip} />
      </Canvas>
      <SceneTooltip tip={tip} />
    </div>
  );
}

function BarsGroup({
  series,
  dark,
  paused,
  onHover,
}: {
  series: DayBar[];
  dark: boolean;
  paused: boolean;
  onHover: (t: Tooltip | null) => void;
}) {
  const group = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const c = dark ? COLORS.dark : COLORS.light;
  const n = series.length;
  const width = 3.4;
  const step = n > 0 ? width / n : 1;
  const barW = Math.min(0.16, step * 0.68);
  const max = Math.max(1, ...series.map((d) => d.sessions));

  useFrame(({ clock }) => {
    if (!group.current || paused) return;
    group.current.rotation.y = Math.sin(clock.elapsedTime * 0.25) * 0.16;
  });

  return (
    <group ref={group} rotation={[0.02, 0, 0]}>
      <gridHelper args={[width + 0.6, 12, c.dim, c.dim]} position={[0, -0.001, 0]} />
      {series.map((d, i) => {
        const h = Math.max(0.02, (d.sessions / max) * 1.35);
        const date = new Date(d.bucket);
        const label = Number.isNaN(date.getTime())
          ? d.bucket
          : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
        return (
          <mesh
            key={d.bucket}
            position={[-width / 2 + step * (i + 0.5), h / 2, 0]}
            onPointerOver={(e) => {
              e.stopPropagation();
              setHovered(i);
              onHover({
                x: e.nativeEvent.offsetX,
                y: e.nativeEvent.offsetY,
                title: label,
                detail: `${d.sessions.toLocaleString()} sessions · ${d.pageviews.toLocaleString()} views`,
              });
            }}
            onPointerOut={() => {
              setHovered(null);
              onHover(null);
            }}
          >
            <boxGeometry args={[barW, h, barW]} />
            <meshBasicMaterial color={hovered === i ? c.hover : c.mark} />
          </mesh>
        );
      })}
    </group>
  );
}

/** 3D daily-traffic skyline: one column per day, height = sessions. */
export function TrafficBars({ series, dark }: { series: DayBar[]; dark: boolean }) {
  const reduced = useReducedMotion();
  const [tip, setTip] = useState<Tooltip | null>(null);
  return (
    <div className="relative h-72 w-full sm:h-80">
      <Canvas dpr={[1, 2]} gl={{ antialias: true, alpha: true }} camera={{ position: [0, 1.5, 3.1], fov: 42 }}>
        <BarsGroup series={series} dark={dark} paused={reduced || tip !== null} onHover={setTip} />
      </Canvas>
      <SceneTooltip tip={tip} />
    </div>
  );
}

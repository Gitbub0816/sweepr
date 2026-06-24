/**
 * React Three Fiber visualizations for the Observability dashboard.
 * Each export is a self-contained canvas component.
 */
import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Text, RoundedBox, Float, OrbitControls } from "@react-three/drei";
import * as THREE from "three";

// ─── Health Orb ──────────────────────────────────────────────────────────────

function OrbInner({ errorRate }: { errorRate: number }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);

  const color = errorRate > 5 ? "#ef4444" : errorRate > 1 ? "#f59e0b" : "#10b981";
  const glowColor = errorRate > 5 ? "#fca5a5" : errorRate > 1 ? "#fde68a" : "#6ee7b7";

  useFrame(({ clock }) => {
    if (meshRef.current) {
      meshRef.current.rotation.y = clock.getElapsedTime() * 0.3;
      meshRef.current.rotation.x = Math.sin(clock.getElapsedTime() * 0.2) * 0.1;
    }
    if (glowRef.current) {
      const s = 1 + Math.sin(clock.getElapsedTime() * 1.5) * 0.05;
      glowRef.current.scale.setScalar(s);
      (glowRef.current.material as THREE.MeshBasicMaterial).opacity =
        0.15 + Math.sin(clock.getElapsedTime() * 1.5) * 0.05;
    }
  });

  return (
    <>
      {/* Glow sphere */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[1.3, 32, 32]} />
        <meshBasicMaterial color={glowColor} transparent opacity={0.15} side={THREE.BackSide} />
      </mesh>
      {/* Main sphere */}
      <mesh ref={meshRef}>
        <sphereGeometry args={[1, 64, 64]} />
        <meshStandardMaterial color={color} roughness={0.2} metalness={0.5} />
      </mesh>
      {/* Wireframe overlay */}
      <mesh ref={meshRef}>
        <sphereGeometry args={[1.01, 16, 16]} />
        <meshBasicMaterial color={color} wireframe transparent opacity={0.15} />
      </mesh>
    </>
  );
}

export function HealthOrb({ errorRate, label }: { errorRate: number; label: string }) {
  const statusText = errorRate > 5 ? "Degraded" : errorRate > 1 ? "Warning" : "Healthy";
  const textColor = errorRate > 5 ? "#ef4444" : errorRate > 1 ? "#f59e0b" : "#10b981";

  return (
    <div className="relative">
      <Canvas
        camera={{ position: [0, 0, 3.5], fov: 45 }}
        style={{ height: 180 }}
        gl={{ antialias: true, alpha: true }}
      >
        <ambientLight intensity={0.4} />
        <pointLight position={[5, 5, 5]} intensity={1.5} />
        <pointLight position={[-5, -5, -5]} intensity={0.5} />
        <OrbInner errorRate={errorRate} />
      </Canvas>
      <div className="text-center -mt-2">
        <p className="text-xs font-bold" style={{ color: textColor }}>{statusText}</p>
        <p className="text-xs text-slate-400">{label}</p>
      </div>
    </div>
  );
}

// ─── 3D Bar Chart ─────────────────────────────────────────────────────────────

function Bar3D({ x, height, color, label, maxH }: { x: number; height: number; color: string; label: string; maxH: number }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const normalizedH = Math.max(0.05, (height / Math.max(maxH, 1)) * 2.5);

  useFrame(({ clock }) => {
    if (meshRef.current) {
      const pulse = 1 + Math.sin(clock.getElapsedTime() * 2 + x) * 0.01;
      meshRef.current.scale.y = pulse;
    }
  });

  return (
    <group position={[x, normalizedH / 2 - 1.5, 0]}>
      <RoundedBox ref={meshRef} args={[0.35, normalizedH, 0.35]} radius={0.04} smoothness={4}>
        <meshStandardMaterial color={color} roughness={0.3} metalness={0.4} />
      </RoundedBox>
      <Text position={[0, normalizedH / 2 + 0.2, 0]} fontSize={0.18} color="#64748b" anchorX="center">
        {height > 999 ? `${(height / 1000).toFixed(1)}k` : String(height)}
      </Text>
      <Text position={[0, -normalizedH / 2 - 0.25, 0]} fontSize={0.14} color="#94a3b8" anchorX="center">
        {label}
      </Text>
    </group>
  );
}

export function BarChart3D({
  data,
  title,
}: {
  data: { label: string; value: number; color?: string }[];
  title: string;
}) {
  const maxVal = Math.max(...data.map(d => d.value), 1);
  const spacing = 0.55;
  const totalWidth = (data.length - 1) * spacing;

  return (
    <div>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{title}</p>
      <Canvas camera={{ position: [0, 1.5, 5], fov: 50 }} style={{ height: 200 }} gl={{ antialias: true, alpha: true }}>
        <ambientLight intensity={0.6} />
        <pointLight position={[3, 5, 3]} intensity={1.2} />
        <pointLight position={[-3, -3, 3]} intensity={0.4} />
        {data.map((d, i) => (
          <Bar3D
            key={i}
            x={(i * spacing) - totalWidth / 2}
            height={d.value}
            color={d.color ?? "#14b8a6"}
            label={d.label}
            maxH={maxVal}
          />
        ))}
        {/* Floor grid */}
        <gridHelper args={[8, 8, "#e2e8f0", "#f1f5f9"]} position={[0, -1.5, 0]} />
      </Canvas>
    </div>
  );
}

// ─── Latency Gauges ───────────────────────────────────────────────────────────

function GaugeRing({ pct, color, label, value, radius }: {
  pct: number; color: string; label: string; value: string; radius: number;
}) {
  const ringRef = useRef<THREE.Mesh>(null);
  const filled = useMemo(() => {
    const curve = new THREE.EllipseCurve(0, 0, radius, radius, 0, Math.PI * 2 * pct, false, 0);
    const points = curve.getPoints(64);
    const geom = new THREE.BufferGeometry().setFromPoints(
      points.map(p => new THREE.Vector3(p.x, p.y, 0))
    );
    return geom;
  }, [pct, radius]);

  useFrame(({ clock }) => {
    if (ringRef.current) {
      ringRef.current.rotation.z = -clock.getElapsedTime() * 0.1;
    }
  });

  return (
    <group>
      {/* Background ring */}
      <mesh>
        <torusGeometry args={[radius, 0.06, 16, 128]} />
        <meshBasicMaterial color="#e2e8f0" />
      </mesh>
      {/* Filled arc — fake with a torus capped to pct */}
      <mesh ref={ringRef}>
        <torusGeometry args={[radius, 0.09, 16, 128, Math.PI * 2 * Math.max(pct, 0.01)]} />
        <meshStandardMaterial color={color} roughness={0.2} metalness={0.4} emissive={color} emissiveIntensity={0.2} />
      </mesh>
      <Text position={[0, 0.1, 0]} fontSize={0.22} color={color} anchorX="center" fontWeight={700}>
        {value}
      </Text>
      <Text position={[0, -0.22, 0]} fontSize={0.13} color="#94a3b8" anchorX="center">
        {label}
      </Text>
    </group>
  );
}

export function LatencyGauges({ p50, p95, p99, threshold = 2000 }: {
  p50: number; p95: number; p99: number; threshold?: number;
}) {
  const pct50 = Math.min(p50 / threshold, 1);
  const pct95 = Math.min(p95 / threshold, 1);
  const pct99 = Math.min(p99 / threshold, 1);
  const col = (ms: number) => ms < 300 ? "#10b981" : ms < 1000 ? "#f59e0b" : "#ef4444";

  const fmt = (ms: number) => ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;

  return (
    <div>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Latency Percentiles</p>
      <Canvas camera={{ position: [0, 0, 5], fov: 45 }} style={{ height: 180 }} gl={{ antialias: true, alpha: true }}>
        <ambientLight intensity={0.6} />
        <pointLight position={[0, 3, 3]} intensity={1} />
        <group position={[-2.2, 0, 0]}>
          <GaugeRing pct={pct50} color={col(p50)} label="P50" value={fmt(p50)} radius={0.8} />
        </group>
        <group position={[0, 0, 0]}>
          <GaugeRing pct={pct95} color={col(p95)} label="P95" value={fmt(p95)} radius={0.8} />
        </group>
        <group position={[2.2, 0, 0]}>
          <GaugeRing pct={pct99} color={col(p99)} label="P99" value={fmt(p99)} radius={0.8} />
        </group>
      </Canvas>
    </div>
  );
}

// ─── Funnel 3D ────────────────────────────────────────────────────────────────

function FunnelStep({ y, radius, height, color, label, count, pct }: {
  y: number; radius: number; height: number; color: string; label: string; count: number; pct: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (meshRef.current) {
      meshRef.current.rotation.y = clock.getElapsedTime() * 0.15;
    }
  });

  return (
    <group position={[0, y, 0]}>
      <mesh ref={meshRef}>
        <cylinderGeometry args={[radius * 0.7, radius, height, 32]} />
        <meshStandardMaterial color={color} roughness={0.3} metalness={0.3} transparent opacity={0.85} />
      </mesh>
      <Text position={[radius + 0.3, 0, 0]} fontSize={0.14} color="#475569" anchorX="left" maxWidth={2}>
        {`${label} (${count})`}
      </Text>
      <Text position={[-radius - 0.1, 0, 0]} fontSize={0.16} color={color} anchorX="right">
        {`${pct}%`}
      </Text>
    </group>
  );
}

export function FunnelViz({ steps }: { steps: { label: string; count: number }[] }) {
  const top = steps[0]?.count ?? 1;
  const colors = ["#14b8a6", "#22d3ee", "#38bdf8", "#60a5fa", "#818cf8", "#a78bfa"];

  return (
    <div>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Booking Funnel (3D)</p>
      <Canvas camera={{ position: [2.5, 0, 6], fov: 50 }} style={{ height: 260 }} gl={{ antialias: true, alpha: true }}>
        <ambientLight intensity={0.5} />
        <pointLight position={[3, 5, 5]} intensity={1.2} />
        <pointLight position={[-3, -3, 5]} intensity={0.4} />
        <OrbitControls enablePan={false} enableZoom={false} autoRotate autoRotateSpeed={0.5} />
        {steps.map((step, i) => {
          const pct = top > 0 ? Math.round((step.count / top) * 100) : 0;
          const radius = 0.3 + (pct / 100) * 1.2;
          const y = (steps.length / 2 - i) * 0.6;
          return (
            <Float key={i} speed={0.5} rotationIntensity={0} floatIntensity={0.1}>
              <FunnelStep
                y={y} radius={radius} height={0.45}
                color={colors[i % colors.length] ?? "#14b8a6"}
                label={step.label} count={step.count} pct={pct}
              />
            </Float>
          );
        })}
      </Canvas>
    </div>
  );
}

// ─── Payment Flow Globe ───────────────────────────────────────────────────────

function PaymentParticle({ position, color }: { position: [number, number, number]; color: string }) {
  const ref = useRef<THREE.Mesh>(null);
  const speed = 0.3 + Math.random() * 0.7;
  const offset = Math.random() * Math.PI * 2;

  useFrame(({ clock }) => {
    if (ref.current) {
      const t = clock.getElapsedTime() * speed + offset;
      ref.current.position.x = position[0] * Math.cos(t * 0.1);
      ref.current.position.z = position[2] * Math.sin(t * 0.1);
      ref.current.position.y = position[1] + Math.sin(t) * 0.15;
    }
  });

  return (
    <mesh ref={ref} position={position}>
      <sphereGeometry args={[0.04, 8, 8]} />
      <meshBasicMaterial color={color} />
    </mesh>
  );
}

export function PaymentFlowViz({ successRate, total }: { successRate: number; total: number }) {
  const particles = useMemo(() => {
    return Array.from({ length: Math.min(total > 0 ? 30 : 5, 30) }, (_, i) => ({
      position: [
        (Math.random() - 0.5) * 4,
        (Math.random() - 0.5) * 3,
        (Math.random() - 0.5) * 2,
      ] as [number, number, number],
      color: i < (successRate / 100) * 30 ? "#10b981" : "#ef4444",
    }));
  }, [total, successRate]);

  return (
    <div>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Payment Flow</p>
      <Canvas camera={{ position: [0, 0, 6], fov: 50 }} style={{ height: 160 }} gl={{ antialias: true, alpha: true }}>
        <ambientLight intensity={0.8} />
        {particles.map((p, i) => (
          <PaymentParticle key={i} position={p.position} color={p.color} />
        ))}
        <Text position={[0, 0, 0]} fontSize={0.5} color={successRate >= 95 ? "#10b981" : "#ef4444"} anchorX="center">
          {`${successRate.toFixed(1)}%`}
        </Text>
        <Text position={[0, -0.7, 0]} fontSize={0.2} color="#94a3b8" anchorX="center">
          success rate
        </Text>
      </Canvas>
    </div>
  );
}

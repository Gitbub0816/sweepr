import { Suspense, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Float, Sparkles, Icosahedron, Dodecahedron } from "@react-three/drei";
import { useReducedMotion } from "framer-motion";

/**
 * Decorative R3F background for the marketing hero. Purely visual:
 * pointer-events disabled, sits behind content (z-index -1), and falls back
 * to a static gradient when the user prefers reduced motion.
 */
function Orb() {
  return (
    <Float speed={1.2} rotationIntensity={0.4} floatIntensity={0.8}>
      <mesh>
        <sphereGeometry args={[1.4, 48, 48]} />
        <meshStandardMaterial
          color="#5eead4"
          emissive="#14b8a6"
          emissiveIntensity={0.35}
          roughness={0.15}
          metalness={0.6}
        />
      </mesh>
    </Float>
  );
}

function FloatingShapes() {
  return (
    <>
      <Float speed={1.5} rotationIntensity={1} floatIntensity={1.5}>
        <Icosahedron args={[0.5, 0]} position={[-3, 1.5, -2]}>
          <meshStandardMaterial
            color="#99f6e4"
            emissive="#0d9488"
            emissiveIntensity={0.25}
            roughness={0.3}
          />
        </Icosahedron>
      </Float>
      <Float speed={1} rotationIntensity={1.2} floatIntensity={1.2}>
        <Dodecahedron args={[0.45]} position={[3.2, -1, -1.5]}>
          <meshStandardMaterial
            color="#2dd4bf"
            emissive="#14b8a6"
            emissiveIntensity={0.3}
            roughness={0.25}
          />
        </Dodecahedron>
      </Float>
      <Float speed={1.8} rotationIntensity={0.8} floatIntensity={1}>
        <Icosahedron args={[0.32, 0]} position={[2.4, 2, -2.5]}>
          <meshStandardMaterial
            color="#ccfbf1"
            emissive="#5eead4"
            emissiveIntensity={0.2}
            roughness={0.4}
          />
        </Icosahedron>
      </Float>
    </>
  );
}

const STATIC_FALLBACK =
  "absolute inset-0 -z-10 bg-[radial-gradient(circle_at_70%_30%,#5eead4_0%,#ccfbf1_35%,#f0fdfa_70%)] opacity-60 dark:bg-[radial-gradient(circle_at_70%_30%,#0f766e_0%,#0b3b38_45%,#020617_80%)] dark:opacity-60";

export function HeroScene() {
  const prefersReducedMotion = useReducedMotion();
  const [contextLost, setContextLost] = useState(false);

  if (prefersReducedMotion || contextLost) {
    return <div className={STATIC_FALLBACK} aria-hidden="true" />;
  }

  return (
    <>
      {/* Mobile + small screens: static gradient, no 3D canvas. */}
      <div className={`${STATIC_FALLBACK} md:hidden`} aria-hidden="true" />

      {/* md+ : interactive 3D scene. */}
      <div className="hidden md:block">
        <Suspense
          fallback={<div className={STATIC_FALLBACK} aria-hidden="true" />}
        >
          <Canvas
            className="!absolute inset-0 -z-10"
            style={{ pointerEvents: "none" }}
            camera={{ position: [0, 0, 6], fov: 50 }}
            dpr={[1, 1.5]}
            aria-hidden="true"
            onCreated={({ gl }) => {
              gl.domElement.addEventListener("webglcontextlost", (e) => {
                e.preventDefault();
                setContextLost(true);
              });
            }}
          >
            <ambientLight intensity={0.6} color="#ccfbf1" />
            <directionalLight
              position={[5, 5, 5]}
              intensity={1.1}
              color="#5eead4"
            />
            <Orb />
            <FloatingShapes />
            <Sparkles
              count={40}
              scale={10}
              size={2}
              speed={0.3}
              color="#5eead4"
              opacity={0.6}
            />
          </Canvas>
        </Suspense>
      </div>
    </>
  );
}

export default HeroScene;

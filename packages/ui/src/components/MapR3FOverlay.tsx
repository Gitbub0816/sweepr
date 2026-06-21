import { useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Sparkles } from '@react-three/drei'
import * as THREE from 'three'
import { useReducedMotion } from '../hooks/useReducedMotion'

function PulseRing() {
  const ref = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    if (!ref.current) return
    const t = clock.getElapsedTime()
    ref.current.scale.setScalar(1 + Math.sin(t * 1.5) * 0.15)
    const material = ref.current.material as THREE.MeshBasicMaterial
    material.opacity = 0.3 + Math.sin(t * 1.5) * 0.15
  })
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.8, 1.0, 32]} />
      <meshBasicMaterial color="#2DD4BF" transparent opacity={0.4} side={THREE.DoubleSide} />
    </mesh>
  )
}

export function MapR3FOverlay() {
  const reduced = useReducedMotion()
  if (reduced) return null
  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <Canvas camera={{ position: [0, 3, 0], fov: 60 }} gl={{ alpha: true }}>
        <ambientLight intensity={0.5} />
        <PulseRing />
        <Sparkles count={20} scale={4} size={1.5} speed={0.3} color="#2DD4BF" opacity={0.4} />
      </Canvas>
    </div>
  )
}

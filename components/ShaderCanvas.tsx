'use client'

import { useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Vector2, type ShaderMaterial } from 'three'
import Fallback2D from '@/components/Fallback2D'  
import ShaderErrorBoundary from '@/components/ShaderErrorBoundary'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion' 

const vertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

const fragmentShader = `
  uniform float uTime;
  uniform vec2 uMouse;
  varying vec2 vUv;

  void main() {
    float diagonal = (vUv.x + vUv.y) * 0.5;
    float wave = sin(diagonal * 10.0 - uTime * 2.0) * 0.5 + 0.5;

    vec3 colorA = vec3(0.1, 0.2, 0.9);
    vec3 colorB = vec3(1.0, 0.4, 0.7);
    vec3 color = mix(colorA, colorB, wave);

    float dist = distance(vUv, uMouse);
    float glow = 1.0 - smoothstep(0.0, 0.3, dist);
    color = mix(color, vec3(1.0), glow * 0.6);

    gl_FragColor = vec4(color, 1.0);
  }
`

function Plane() {
  const materialRef = useRef<ShaderMaterial>(null)     

  useFrame((state, delta) => {
    if (!materialRef.current) return                        

    const uniforms = materialRef.current.uniforms
    uniforms.uTime.value += Math.min(delta, 0.1)
    uniforms.uMouse.value.set(
      state.pointer.x * 0.5 + 0.5,
      state.pointer.y * 0.5 + 0.5
    )
  })

  return (
    <mesh>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={{
          uTime: { value: 0 },
          uMouse: { value: new Vector2(0.5, 0.5) },
        }}
      />
    </mesh>
  )
}

export default function ShaderCanvas() {
  const reduceMotion = usePrefersReducedMotion()
  const [paused, setPaused] = useState(false) 

  if (reduceMotion) return <Fallback2D /> 

  return (
    <>
      <ShaderErrorBoundary>
        <Canvas fallback={<Fallback2D />} frameloop={paused ? 'never' : 'always'}>
          <Plane />
        </Canvas>
      </ShaderErrorBoundary>
      <button
        type="button"
        onClick={() => setPaused(!paused)}
        aria-label={paused ? 'Play animation' : 'Pause animation'}
        className="fixed right-4 bottom-4 rounded-full bg-white/80 px-4 py-2 text-sm text-black"
      >
        {paused ? '▶ Play' : '⏸ Pause'}
      </button>
    </>
  )
}
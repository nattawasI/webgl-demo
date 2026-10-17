'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
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
  uniform float uAspect;
  uniform float uHover;
  varying vec2 vUv;

  // Spiral twist around center: rotation angle is largest at center and fades
  // with distance, so rings at different distances turn by different amounts
  vec2 swirl(vec2 p, vec2 center, float amount) {
    vec2 d = p - center;
    float angle = 2.5 * amount * exp(-dot(d, d) / 0.04);
    float s = sin(angle);
    float c = cos(angle);
    return center + mat2(c, -s, s, c) * d;
  }

  // Slow wandering offset: mixed sine waves with unrelated speeds look random
  vec2 drift(float seed, float t) {
    return vec2(
      sin(t * 0.13 + seed) * 0.15 + sin(t * 0.29 + seed * 2.1) * 0.06,
      cos(t * 0.11 + seed * 1.7) * 0.15 + sin(t * 0.23 + seed * 0.6) * 0.06
    );
  }

  // Soft blob: solid core, then fades smoothly to 0 at radius
  float blob(vec2 p, vec2 center, float radius) {
    return 1.0 - smoothstep(radius * 0.2, radius, length(p - center));
  }

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  }

  void main() {
    // Scale x by aspect so distances are measured in screen-height units (round blobs)
    vec2 aspect = vec2(uAspect, 1.0);
    vec2 p = vUv * aspect;
    vec2 mouse = uMouse * aspect;

    // Twist the whole space around the mouse, white areas included
    p = swirl(p, mouse, uHover);

    // Positions are in 0..1 screen units (y up), then scaled like p
    vec2 blueCenter = (vec2(0.2, 0.6) + drift(0.0, uTime)) * aspect;
    vec2 pinkCenter = (vec2(0.28, 0.12) + drift(4.0, uTime)) * aspect;

    vec3 blue = vec3(0.25, 0.4, 0.88);
    vec3 pink = vec3(0.82, 0.45, 0.85);

    vec3 color = vec3(1.0);
    color = mix(color, pink, blob(p, pinkCenter, 0.55) * 0.85);
    color = mix(color, blue, blob(p, blueCenter, 0.5) * 0.95);

    // Light grey vignette toward the screen edges
    float edge = length(vUv - 0.5);
    color *= 1.0 - 0.09 * smoothstep(0.3, 0.75, edge);

    float grain = hash(gl_FragCoord.xy + fract(uTime) * 100.0) - 0.5;
    color += grain * 0.06;

    gl_FragColor = vec4(color, 1.0);
  }
`

// Higher = mouse follow catches up faster
const MOUSE_FOLLOW_SPEED = 5
// Higher = swirl appears/fades faster when the pointer enters/leaves
const HOVER_FADE_SPEED = 2

function Plane() {
  const materialRef = useRef<ShaderMaterial>(null)
  const pointerInside = useRef(false)

  useEffect(() => {
    const root = document.documentElement
    const enter = () => { pointerInside.current = true }
    const leave = () => { pointerInside.current = false }
    root.addEventListener('pointermove', enter)
    root.addEventListener('pointerleave', leave)
    return () => {
      root.removeEventListener('pointermove', enter)
      root.removeEventListener('pointerleave', leave)
    }
  }, [])
  // Stable object: R3F copies a new uniforms prop over the old values,
  // which would reset uTime whenever this component re-renders (e.g. on pause)
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uMouse: { value: new Vector2(0.5, 0.5) },
      uAspect: { value: 1 },
      uHover: { value: 0 },
    }),
    []
  )

  useFrame((state, delta) => {
    if (!materialRef.current) return

    const dt = Math.min(delta, 0.1)
    const u = materialRef.current.uniforms
    u.uTime.value += dt
    u.uAspect.value = state.size.width / state.size.height

    const hoverTarget = pointerInside.current ? 1 : 0
    u.uHover.value += (hoverTarget - u.uHover.value) * (1 - Math.exp(-dt * HOVER_FADE_SPEED))

    // Ease toward the pointer instead of jumping; frame-rate independent.
    // While the swirl is invisible, snap so it starts where the pointer enters.
    const mouse = u.uMouse.value
    const ease = u.uHover.value < 0.01 ? 1 : 1 - Math.exp(-dt * MOUSE_FOLLOW_SPEED)
    mouse.x += (state.pointer.x * 0.5 + 0.5 - mouse.x) * ease
    mouse.y += (state.pointer.y * 0.5 + 0.5 - mouse.y) * ease
  })

  return (
    <mesh>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
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
        <Canvas
          fallback={<Fallback2D />}
          frameloop={paused ? 'never' : 'always'}
          dpr={[1, 1.5]}
          gl={{ antialias: false, depth: false }}
        >
          <Plane />
        </Canvas>
      </ShaderErrorBoundary>
      <button
        type="button"
        onClick={() => setPaused(!paused)}
        aria-label={paused ? 'Play animation' : 'Pause animation'}
        className="fixed right-4 bottom-4 rounded-full bg-neutral-900/85 px-4 py-2 text-sm text-white shadow-md"
      >
        {paused ? '▶ Play' : '⏸ Pause'}
      </button>
    </>
  )
}

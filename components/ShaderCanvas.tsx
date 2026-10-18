'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
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
  uniform float uGrain;
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
    return 1.0 - smoothstep(radius * 0.45, radius, length(p - center));
  }

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  }

  void main() {
    // Scale x by aspect so distances are measured in screen-height units (round blobs)
    vec2 aspect = vec2(uAspect, 1.0);
    vec2 p = vUv * aspect;
    vec2 mouse = uMouse * aspect;

    // Twist the whole space around the mouse, empty areas included
    p = swirl(p, mouse, uHover);

    // Positions are in 0..1 screen units (y up), then scaled like p
    vec2 mossCenter = (vec2(0.22, 0.65) + drift(0.0, uTime)) * aspect;
    vec2 blueCenter = (vec2(0.55, 0.2) + drift(4.0, uTime)) * aspect;
    vec2 pinkCenter = (vec2(0.82, 0.68) + drift(8.0, uTime)) * aspect;

    vec3 background = vec3(254.0, 250.0, 243.0) / 255.0;  // #FEFAF3
    vec3 pink = vec3(242.0, 145.0, 145.0) / 255.0;        // #F29191
    vec3 blue = vec3(103.0, 162.0, 197.0) / 255.0;        // #67A2C5
    vec3 moss = vec3(132.0, 162.0, 130.0) / 255.0;        // #84A282

    // Plain mix, so each blob's core is exactly its palette colour
    vec3 color = background;
    color = mix(color, blue, blob(p, blueCenter, 0.45));
    color = mix(color, pink, blob(p, pinkCenter, 0.35));
    color = mix(color, moss, blob(p, mossCenter, 0.42));

    float grain = hash(gl_FragCoord.xy + fract(uTime) * 100.0) - 0.5;
    color += grain * uGrain;

    gl_FragColor = vec4(color, 1.0);
  }
`

// Higher = mouse follow catches up faster
const MOUSE_FOLLOW_SPEED = 5
// Higher = swirl appears/fades faster when the pointer enters/leaves
const HOVER_FADE_SPEED = 2
// Grain strength. Moving grain averages out to a light film texture, but frozen
// grain looks much harsher, so a still frame gets a lighter dose
const GRAIN_MOVING = 0.06
const GRAIN_STILL = 0.025

function Plane({ paused, onFirstFrame }: { paused: boolean; onFirstFrame: () => void }) {
  const materialRef = useRef<ShaderMaterial>(null)
  const pointerInside = useRef(false)
  const hasRendered = useRef(false)
  const invalidate = useThree((state) => state.invalidate)

  // With frameloop="demand", draw one more frame on pause, with time frozen
  // and the lighter still-frame grain
  useEffect(() => {
    if (paused) invalidate()
  }, [paused, invalidate])

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
      uGrain: { value: GRAIN_MOVING },
    }),
    []
  )

  useFrame((state, delta) => {
    if (!materialRef.current) return

    // Paused frames (pause itself, resizes) keep everything where it was
    const dt = paused ? 0 : Math.min(delta, 0.1)
    const u = materialRef.current.uniforms
    u.uTime.value += dt
    u.uAspect.value = state.size.width / state.size.height
    u.uGrain.value = paused ? GRAIN_STILL : GRAIN_MOVING

    const hoverTarget = pointerInside.current ? 1 : 0
    u.uHover.value += (hoverTarget - u.uHover.value) * (1 - Math.exp(-dt * HOVER_FADE_SPEED))

    // Ease toward the pointer instead of jumping; frame-rate independent.
    // While the swirl is invisible, snap so it starts where the pointer enters.
    const mouse = u.uMouse.value
    const ease = u.uHover.value < 0.01 ? 1 : 1 - Math.exp(-dt * MOUSE_FOLLOW_SPEED)
    mouse.x += (state.pointer.x * 0.5 + 0.5 - mouse.x) * ease
    mouse.y += (state.pointer.y * 0.5 + 0.5 - mouse.y) * ease

    if (!hasRendered.current) {
      hasRendered.current = true
      onFirstFrame()
    }
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
  // Shader has drawn its first frame: fade it in over the fallback
  const [ready, setReady] = useState(false)
  // WebGL context was lost mid-session (GPU reset, too many tabs): drop the shader
  const [contextLost, setContextLost] = useState(false)

  // Fallback2D always stays underneath at the same tree position, so it is never
  // remounted: it is the first paint (SSR), the reduced-motion view, and what
  // shows if the shader fails or loses its context. The background colour
  // covers the moment before it first draws.
  return (
    <div className="relative h-full bg-[#FEFAF3]">
      <div className="absolute inset-0">
        <Fallback2D />
      </div>
      {!reduceMotion && !contextLost && (
        // On error the boundary renders nothing, removing the shader and the
        // pause bar together, so the bar never shows without an animation
        <ShaderErrorBoundary>
          <div
            className={`absolute inset-0 transition-opacity duration-700 ${ready ? 'opacity-100' : 'opacity-0'}`}
          >
            <Canvas
              fallback={<Fallback2D />}
              frameloop={paused ? 'demand' : 'always'}
              dpr={[1, 1.5]}
              gl={{ antialias: false, depth: false }}
              onCreated={({ gl }) => {
                gl.domElement.addEventListener('webglcontextlost', () => setContextLost(true), {
                  once: true,
                })
              }}
            >
              <Plane paused={paused} onFirstFrame={() => setReady(true)} />
            </Canvas>
          </div>
          <div className="fixed right-4 bottom-4 flex items-center gap-3 rounded-full bg-white py-1.5 pr-1.5 pl-4 text-sm shadow-md">
            <span className="text-neutral-600">Background animation</span>
            <button
              type="button"
              onClick={() => setPaused(!paused)}
              aria-label={paused ? 'Play background animation' : 'Pause background animation'}
              className="w-24 rounded-full bg-neutral-900 py-1.5 text-center text-white"
            >
              {paused ? '▶ Play' : '⏸ Pause'}
            </button>
          </div>
        </ShaderErrorBoundary>
      )}
    </div>
  )
}

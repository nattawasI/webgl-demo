'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Fallback2D from '@/components/Fallback2D'
import ShaderErrorBoundary from '@/components/ShaderErrorBoundary'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'

const vertexShader = `
  attribute vec2 position;
  varying vec2 vUv;

  void main() {
    vUv = position * 0.5 + 0.5;
    gl_Position = vec4(position, 0.0, 1.0);
  }
`

const fragmentShader = `
  // highp where available: at mediump (16-bit on many phones) the grain hash
  // loses precision and turns into visible patterns
  #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
  #else
    precision mediump float;
  #endif

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
// Device pixel ratio cap, to keep GPU load down on retina screens
const MAX_DPR = 1.5

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn('ShaderCanvas: shader failed to compile', gl.getShaderInfoLog(shader))
    gl.deleteShader(shader)
    return null
  }
  return shader
}

// The WebGL canvas and its pause bar. Calls onFail (no WebGL, shader compile
// error, context lost) so the parent can drop it and leave Fallback2D showing.
function ShaderLayer({
  paused,
  onTogglePause,
  onFail,
}: {
  paused: boolean
  onTogglePause: () => void
  onFail: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // Set by the WebGL effect; lets the paused prop reach the render loop
  // without tearing down and rebuilding the GL setup
  const setPausedRef = useRef<((paused: boolean) => void) | null>(null)
  // First frame drawn: fade the canvas in over the fallback and show the bar
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const gl = canvas.getContext('webgl', {
      antialias: false,
      depth: false,
      alpha: false,
      powerPreference: 'low-power',
    })
    if (!gl) {
      console.warn('ShaderCanvas: WebGL unavailable, showing static fallback')
      onFail()
      return
    }

    const vs = compile(gl, gl.VERTEX_SHADER, vertexShader)
    const fs = compile(gl, gl.FRAGMENT_SHADER, fragmentShader)
    const program = gl.createProgram()
    if (!vs || !fs || !program) {
      onFail()
      return
    }
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn('ShaderCanvas: shader failed to link', gl.getProgramInfoLog(program))
      onFail()
      return
    }
    gl.useProgram(program)

    // One oversized triangle that covers the whole viewport
    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const position = gl.getAttribLocation(program, 'position')
    gl.enableVertexAttribArray(position)
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)

    const u = {
      time: gl.getUniformLocation(program, 'uTime'),
      mouse: gl.getUniformLocation(program, 'uMouse'),
      aspect: gl.getUniformLocation(program, 'uAspect'),
      hover: gl.getUniformLocation(program, 'uHover'),
      grain: gl.getUniformLocation(program, 'uGrain'),
    }

    let time = 0
    let hover = 0
    const mouse = { x: 0.5, y: 0.5 }
    const pointer = { x: 0.5, y: 0.5, inside: false }
    let paused = false
    let lost = false
    let drawn = false
    let rafId = 0
    let last = 0

    // dt = 0 draws a still frame: time, swirl and mouse stay where they were
    const draw = (dt: number) => {
      time += dt
      const hoverTarget = pointer.inside ? 1 : 0
      hover += (hoverTarget - hover) * (1 - Math.exp(-dt * HOVER_FADE_SPEED))
      // Ease toward the pointer instead of jumping; frame-rate independent.
      // While the swirl is invisible, snap so it starts where the pointer enters.
      const ease = hover < 0.01 ? 1 : 1 - Math.exp(-dt * MOUSE_FOLLOW_SPEED)
      mouse.x += (pointer.x - mouse.x) * ease
      mouse.y += (pointer.y - mouse.y) * ease

      gl.uniform1f(u.time, time)
      gl.uniform2f(u.mouse, mouse.x, mouse.y)
      gl.uniform1f(u.aspect, canvas.width / canvas.height)
      gl.uniform1f(u.hover, hover)
      gl.uniform1f(u.grain, paused ? GRAIN_STILL : GRAIN_MOVING)
      gl.drawArrays(gl.TRIANGLES, 0, 3)

      if (!drawn) {
        drawn = true
        setReady(true)
      }
    }

    const loop = (now: number) => {
      // Clamp so time doesn't jump after the tab was in the background
      const dt = last ? Math.min((now - last) / 1000, 0.1) : 0
      last = now
      draw(dt)
      rafId = requestAnimationFrame(loop)
    }
    const start = () => {
      if (rafId || lost || paused) return
      last = 0
      rafId = requestAnimationFrame(loop)
    }
    const stop = () => {
      cancelAnimationFrame(rafId)
      rafId = 0
    }

    // Pausing stops the loop and redraws once with the lighter still-frame grain
    setPausedRef.current = (next) => {
      paused = next
      if (paused) {
        stop()
        if (!lost) draw(0)
      } else start()
    }

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr))
      canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr))
      gl.viewport(0, 0, canvas.width, canvas.height)
      // Resizing clears the canvas: redraw a still frame when the loop isn't running
      if (!rafId && !lost) draw(0)
    }
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(canvas)

    const onPointerMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      pointer.x = (event.clientX - rect.left) / rect.width
      pointer.y = 1 - (event.clientY - rect.top) / rect.height
      pointer.inside = pointer.x >= 0 && pointer.x <= 1 && pointer.y >= 0 && pointer.y <= 1
    }
    const onPointerLeave = () => {
      pointer.inside = false
    }
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    document.documentElement.addEventListener('pointerleave', onPointerLeave)

    // GPU reset or too many contexts: hand over to the static fallback
    const onContextLost = () => {
      lost = true
      stop()
      onFail()
    }
    canvas.addEventListener('webglcontextlost', onContextLost)

    start()

    return () => {
      stop()
      setPausedRef.current = null
      resizeObserver.disconnect()
      window.removeEventListener('pointermove', onPointerMove)
      document.documentElement.removeEventListener('pointerleave', onPointerLeave)
      canvas.removeEventListener('webglcontextlost', onContextLost)
      gl.deleteBuffer(buffer)
      gl.deleteProgram(program)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
    }
  }, [onFail])

  useEffect(() => {
    setPausedRef.current?.(paused)
  }, [paused])

  return (
    <>
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className={`absolute inset-0 block size-full transition-opacity duration-700 ${ready ? 'opacity-100' : 'opacity-0'}`}
      />
      {ready && (
        <div className="fixed right-4 bottom-4 flex items-center gap-3 rounded-full bg-white py-1.5 pr-1.5 pl-4 text-sm shadow-md">
          <span className="text-neutral-600">Background animation</span>
          <button
            type="button"
            onClick={onTogglePause}
            aria-label={paused ? 'Play background animation' : 'Pause background animation'}
            className="w-24 rounded-full bg-neutral-900 py-1.5 text-center text-white"
          >
            {paused ? '▶ Play' : '⏸ Pause'}
          </button>
        </div>
      )}
    </>
  )
}

export default function ShaderCanvas() {
  const reduceMotion = usePrefersReducedMotion()
  const [paused, setPaused] = useState(false)
  // No WebGL, shader didn't compile, or the context was lost mid-session
  const [failed, setFailed] = useState(false)
  const handleFail = useCallback(() => setFailed(true), [])
  const togglePause = useCallback(() => setPaused((p) => !p), [])

  // Fallback2D always stays underneath at the same tree position, so it is never
  // remounted: it is the first paint (SSR), the reduced-motion view, and what
  // shows if the shader fails. The background colour covers the moment before
  // it first draws. The pause bar only appears once the shader has drawn, so it
  // never shows without an animation.
  return (
    <div className="relative h-full bg-[#FEFAF3]">
      <div className="absolute inset-0">
        <Fallback2D />
      </div>
      {!reduceMotion && !failed && (
        // Safety net for anything unexpected thrown while rendering the layer
        <ShaderErrorBoundary>
          <ShaderLayer paused={paused} onTogglePause={togglePause} onFail={handleFail} />
        </ShaderErrorBoundary>
      )}
    </div>
  )
}

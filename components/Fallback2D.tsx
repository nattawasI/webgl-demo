'use client'

import { useRef, useEffect } from 'react'

// Solid core for the first 45% of the radius, then fades out (like the shader).
// Radius is based on height, like the shader, so blobs stay round.
function drawBlob(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  rgb: string,
) {
  const { width, height } = ctx.canvas
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius * height)
  // Many stops along a smoothstep curve, so the fade has no visible kinks
  for (let i = 0; i <= 32; i++) {
    const t = i / 32
    const fade = 1 - t * t * (3 - 2 * t)
    gradient.addColorStop(0.45 + 0.55 * t, `rgba(${rgb}, ${fade})`)
  }
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)
}

function draw(canvas: HTMLCanvasElement) {
  // R3F mounts its fallback inside its own <canvas>, where it is never shown
  // and has no size; skip drawing there (getImageData throws on 0 size)
  if (!canvas.clientWidth || !canvas.clientHeight) return

  // Draw at device resolution so it isn't upscaled on retina screens
  // (capped at 2, like the shader's dpr)
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = Math.round(canvas.clientWidth * dpr)
  canvas.height = Math.round(canvas.clientHeight * dpr)

  // Redrawn on every resize, each time reading pixels back for the grain
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return

  const { width, height } = canvas

  ctx.fillStyle = 'rgb(254, 250, 243)' // #FEFAF3
  ctx.fillRect(0, 0, width, height)

  drawBlob(ctx, width * 0.49, height * 0.63, 0.45, '103, 162, 197') // #67A2C5
  drawBlob(ctx, width * 0.92, height * 0.3, 0.35, '242, 145, 145') // #F29191
  drawBlob(ctx, width * 0.22, height * 0.2, 0.42, '132, 162, 130') // #84A282

  // Film grain at the shader's still-frame strength (GRAIN_STILL), since this
  // image never moves; it also hides colour banding in the soft fades
  const image = ctx.getImageData(0, 0, width, height)
  const data = image.data
  for (let i = 0; i < data.length; i += 4) {
    const grain = (Math.random() - 0.5) * 0.025 * 255
    data[i] += grain
    data[i + 1] += grain
    data[i + 2] += grain
  }
  ctx.putImageData(image, 0, 0)
}

// Static version of the shader's starting frame: off-white background with
// green and blue blobs on the left and a pink one on the right
export default function Fallback2D() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // Draw now and again whenever the canvas changes size (window resize, phone
    // rotation), so blobs never get stretched out of round. ResizeObserver fires
    // at most once per frame, before paint.
    const observer = new ResizeObserver(() => draw(canvas))
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [])

  return <canvas ref={canvasRef} className="block h-full w-full" />
}

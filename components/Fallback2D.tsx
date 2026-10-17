'use client'

import { useRef, useEffect } from 'react'

// Static version of the shader's starting frame: white background, blue blob
// top-left, pink blob bottom-left, light grey vignette
export default function Fallback2D() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    canvas.width = canvas.clientWidth
    canvas.height = canvas.clientHeight

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { width, height } = canvas

    // Solid core for the first 20% of the radius, then fades out (like the shader).
    // Radius is based on height, like the shader, so blobs stay round.
    function drawBlob(x: number, y: number, radius: number, rgb: string, alpha: number) {
      const gradient = ctx!.createRadialGradient(x, y, 0, x, y, radius * height)
      // Several stops along a smoothstep curve, so the edge has no visible ring
      for (let i = 0; i <= 8; i++) {
        const t = i / 8
        const fade = 1 - t * t * (3 - 2 * t)
        gradient.addColorStop(0.2 + 0.8 * t, `rgba(${rgb}, ${alpha * fade})`)
      }
      ctx!.fillStyle = gradient
      ctx!.fillRect(0, 0, width, height)
    }

    ctx.fillStyle = 'rgb(255, 255, 255)'
    ctx.fillRect(0, 0, width, height)
    drawBlob(width * 0.22, height * 0.71, 0.55, '209, 115, 217', 0.85)
    drawBlob(width * 0.2, height * 0.25, 0.5, '64, 102, 224', 0.95)

    // Vignette: stretch a circle to the canvas shape so it follows the edges
    ctx.save()
    ctx.scale(width, height)
    const vignette = ctx.createRadialGradient(0.5, 0.5, 0, 0.5, 0.5, 0.75)
    vignette.addColorStop(0.4, 'rgba(0, 0, 0, 0)')
    vignette.addColorStop(1, 'rgba(0, 0, 0, 0.09)')
    ctx.fillStyle = vignette
    ctx.fillRect(0, 0, 1, 1)
    ctx.restore()
  }, [])

  return <canvas ref={canvasRef} className="block h-full w-full" />
}

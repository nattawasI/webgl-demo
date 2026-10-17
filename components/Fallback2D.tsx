'use client'

import { useRef, useEffect } from 'react'

export default function Fallback2D() {
  const canvasRef = useRef<HTMLCanvasElement>(null)    

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return                                

    canvas.width = canvas.clientWidth
    canvas.height = canvas.clientHeight

    const ctx = canvas.getContext('2d')
    if (!ctx) return                                   

    const gradient = ctx.createLinearGradient(0, canvas.height, canvas.width, 0)
    gradient.addColorStop(0, 'rgb(26, 51, 230)')
    gradient.addColorStop(1, 'rgb(255, 102, 179)')

    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }, [])

  return <canvas ref={canvasRef} className="block h-full w-full" />   
}
'use client'

import { catchError, type ErrorInfo } from 'next/error'

// Renders nothing on error: ShaderCanvas keeps Fallback2D underneath the shader,
// so dropping the shader (and its pause bar) leaves the static image showing
function ShaderFallback(_props: object, { error }: ErrorInfo) {
  console.warn('Shader failed, showing static fallback:', error)
  return null
}

export default catchError(ShaderFallback)

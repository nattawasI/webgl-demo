'use client'

import { catchError, type ErrorInfo } from 'next/error'
import Fallback2D from './Fallback2D'

function ShaderFallback(_props: object, { error }: ErrorInfo) {
  console.warn('Shader failed, showing static fallback:', error)
  return <Fallback2D />
}

export default catchError(ShaderFallback)
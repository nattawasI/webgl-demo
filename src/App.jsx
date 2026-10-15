import { Canvas, useFrame } from '@react-three/fiber'
import './App.css'
import { useRef } from 'react' 
import { Vector2 } from 'three'  

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

    vec3 colorA = vec3(0.1, 0.2, 0.9);                  // ← เพิ่ม สีน้ำเงิน
    vec3 colorB = vec3(1.0, 0.4, 0.7);                  // ← เพิ่ม สีชมพู
    vec3 color = mix(colorA, colorB, wave);
    
    float dist = distance(vUv, uMouse);                 // ← เพิ่ม
    float glow = 1.0 - smoothstep(0.0, 0.3, dist);      // ← เพิ่ม
    color = mix(color, vec3(1.0), glow * 0.6);          // ← เพิ่ม

    gl_FragColor = vec4(color, 1.0);                    // ← แก้ ใช้ color
  }
`

function Box() {
const materialRef = useRef()                          // ← เพิ่ม

  useFrame((state) => {     
    const uniforms = materialRef.current.uniforms                            // ← เพิ่มทั้งก้อน
    uniforms.uTime.value = state.clock.elapsedTime
    uniforms.uMouse.value.set(                          // ← เพิ่ม
      state.pointer.x * 0.5 + 0.5,
      state.pointer.y * 0.5 + 0.5
    )
  })
  return (
    <mesh>                                    
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={materialRef}                               // ← เพิ่ม
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={{
          uTime: { value: 0 },
          uMouse: { value: new Vector2(0.5, 0.5) }
        }}              // ← เพิ่ม
      />
    </mesh>
  )
}


function App() {

  return (
    <Canvas>
      <Box />
    </Canvas>
  )
}

export default App

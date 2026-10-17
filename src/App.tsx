import { Canvas } from '@react-three/fiber'
import { Suspense, useEffect } from 'react'
import { PCFShadowMap } from 'three'
import { ExerciseRig } from './exercise/ExerciseRig'
import { Effects } from './fx/Effects'
import { Interaction } from './interact/Interaction'
import { GameBoards } from './play/Boards'
import { bindInput } from './player/input'
import { Player } from './player/Player'
import { Elevator } from './ui/Elevator'
import { Hud } from './ui/Hud'
import { MusicPlayer } from './ui/MusicPlayer'
import { Lights } from './world/Lights'
import { Neon } from './world/Neon'
import { Office } from './world/Office'
import { Sky } from './world/Sky'
import { Skyline } from './world/Skyline'

export function App() {
  useEffect(() => bindInput(), [])
  return (
    <>
      <Canvas
        flat
        shadows
        dpr={[1, 1.75]}
        camera={{ fov: 62, near: 0.05, far: 4000 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          gl.shadowMap.type = PCFShadowMap
        }}
      >
        <Suspense fallback={null}>
          <Sky />
          <Skyline />
          <Office />
          <Neon />
          <GameBoards />
        </Suspense>
        <Lights />
        <Player />
        <Interaction />
        <ExerciseRig />
        <Effects />
      </Canvas>
      <Elevator />
      <Hud />
      <MusicPlayer />
    </>
  )
}

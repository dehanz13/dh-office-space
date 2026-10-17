import { useFrame, useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { hotspotById } from '../layout'
import { useGame } from '../state/store'
import { exercise, stepExercise, tap } from './state'

// While you're on the bike or treadmill: ← → (or A D) in turn are your strokes,
// the simulation runs, and the camera moves like a rider's or a runner's head.

export function ExerciseRig() {
  const camera = useThree((s) => s.camera)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!exercise.machine || useGame.getState().phase !== 'inspect') return
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') tap('left')
      else if (e.code === 'ArrowRight' || e.code === 'KeyD') tap('right')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useFrame((_, rawDelta) => {
    const machine = exercise.machine
    if (!machine) return
    const dt = Math.min(rawDelta, 1 / 20)
    stepExercise(dt)
    if (useGame.getState().phase !== 'inspect') return
    const view = hotspotById.get(machine === 'bike' ? 'bike' : 'treadmill')?.views[0]
    if (!view) return
    const effort = Math.min(1, exercise.speed / (machine === 'bike' ? 30 : 12))
    camera.position.copy(view.eye)
    if (machine === 'bike') {
      // A rider rocks a little side to side with each pedal stroke.
      camera.position.y += Math.sin(exercise.phase * 2) * 0.008 * effort
      camera.position.z += Math.sin(exercise.phase) * 0.012 * effort
    } else {
      // A runner's head bobs once per step.
      camera.position.y += Math.abs(Math.sin(exercise.phase)) * 0.035 * effort
      camera.position.z += Math.sin(exercise.phase) * 0.008 * effort
    }
  })

  return null
}

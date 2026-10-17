import { useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect } from 'react'
import { layout } from '../layout'
import { useGame } from '../state/store'
import { collide } from './collision'
import { keys, look } from './input'

// First-person walking. The visitor is a circle on the floor; the camera sits
// at eye height above it. Tuning follows what reads as a calm, natural walk.

export const TUNING = {
  eye: 1.6,
  radius: 0.26,
  walk: 2.0, // metres per second
  run: 1.8, // multiplier while Shift is held
  sensitivity: 0.0022, // radians per pixel
  lookSmoothing: 30,
  pitchLimit: 1.35,
}

const [sx, , sz] = layout.spawn.position
const [lx, ly, lz] = layout.spawn.lookAt
const dx = lx - sx
const dy = ly - TUNING.eye
const dz = lz - sz
const startYaw = Math.atan2(-dx, -dz)
const startPitch = Math.atan2(dy, Math.hypot(dx, dz))

/** Where the visitor stands and looks. The inspect camera returns here. */
export const pose = { x: sx, z: sz, yaw: startYaw, pitch: startPitch, targetYaw: startYaw, targetPitch: startPitch }

let bob = 0

export function Player() {
  const camera = useThree((s) => s.camera)

  useLayoutEffect(() => {
    camera.position.set(pose.x, TUNING.eye, pose.z)
    camera.rotation.set(pose.pitch, pose.yaw, 0, 'YXZ')
  }, [camera])

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 1 / 30)
    if (useGame.getState().phase !== 'walk') {
      look.dx = 0
      look.dy = 0
      return
    }

    // Look: accumulate mouse into a target, ease toward it (frame-rate independent).
    pose.targetYaw -= look.dx * TUNING.sensitivity
    pose.targetPitch = Math.max(-TUNING.pitchLimit, Math.min(TUNING.pitchLimit, pose.targetPitch - look.dy * TUNING.sensitivity))
    look.dx = 0
    look.dy = 0
    const k = 1 - Math.exp(-TUNING.lookSmoothing * dt)
    pose.yaw += (pose.targetYaw - pose.yaw) * k
    pose.pitch += (pose.targetPitch - pose.pitch) * k

    // Move relative to where you face, flattened onto the floor.
    let forward = 0
    let strafe = 0
    if (keys.has('KeyW') || keys.has('ArrowUp')) forward += 1
    if (keys.has('KeyS') || keys.has('ArrowDown')) forward -= 1
    if (keys.has('KeyD') || keys.has('ArrowRight')) strafe += 1
    if (keys.has('KeyA') || keys.has('ArrowLeft')) strafe -= 1
    const length = Math.hypot(forward, strafe)
    let speed = 0
    if (length > 0) {
      forward /= length
      strafe /= length
      speed = TUNING.walk * (keys.has('ShiftLeft') || keys.has('ShiftRight') ? TUNING.run : 1)
      const sin = Math.sin(pose.yaw)
      const cos = Math.cos(pose.yaw)
      pose.x += (-sin * forward + cos * strafe) * speed * dt
      pose.z += (-cos * forward - sin * strafe) * speed * dt
    }
    collide(pose, TUNING.radius)

    // A very small head bob while moving makes walking read as walking.
    bob += speed * dt * 4.2
    const bobY = speed > 0 ? Math.sin(bob) * 0.012 : 0

    camera.position.set(pose.x, TUNING.eye + bobY, pose.z)
    camera.rotation.set(pose.pitch, pose.yaw, 0, 'YXZ')
  })

  return null
}

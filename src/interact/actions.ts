import gsap from 'gsap'
import { Euler, Matrix4, Quaternion, Vector3, type Camera } from 'three'
import { DESK_LIFT, type DeskId, hotspotById, type Hotspot } from '../layout'
import { startExercise, stopExercise } from '../exercise/state'
import { useMusic } from '../music/spotify'
import { lockPointer } from '../player/input'
import { pose, TUNING } from '../player/Player'
import { blindHold, deskState, tod, useGame } from '../state/store'

// Everything a visitor can do, as plain functions. Keys, clicks and HUD buttons
// all call these, so behaviour stays identical however it was triggered.

let camera: Camera | null = null
export const bindCamera = (c: Camera) => {
  camera = c
}

const UP = new Vector3(0, 1, 0)
const lookMatrix = new Matrix4()
let flight: gsap.core.Tween | null = null
let lastExit = 0

/** Fly the camera to a position and orientation with one GSAP tween. */
function fly(eye: Vector3, rotation: Quaternion, duration: number, onDone: () => void) {
  const cam = camera
  if (!cam) return
  flight?.kill()
  const fromP = cam.position.clone()
  const fromQ = cam.quaternion.clone()
  const progress = { t: 0 }
  flight = gsap.to(progress, {
    t: 1,
    duration,
    ease: 'power2.inOut',
    onUpdate: () => {
      cam.position.lerpVectors(fromP, eye, progress.t)
      cam.quaternion.slerpQuaternions(fromQ, rotation, progress.t)
    },
    onComplete: () => {
      flight = null
      onDone()
    },
  })
}

/** How high a desk has risen above sitting height. */
export function deskLift(desk: DeskId) {
  return desk === 'lab' ? deskState.labLift : deskState.lift
}

/** Views and keypads on a desk move with that desk when it rises. */
export function liftOf(h: Hotspot) {
  return h.followsDesk ? deskLift(h.followsDesk) : 0
}

function viewOf(h: Hotspot, index: number) {
  const view = h.views[index]
  const lift = liftOf(h)
  const eye = view.eye.clone()
  const look = view.look.clone()
  eye.y += lift
  look.y += lift
  return { eye, rotation: new Quaternion().setFromRotationMatrix(lookMatrix.lookAt(eye, look, UP)) }
}

export function activate(id: string) {
  const h = hotspotById.get(id)
  const game = useGame.getState()
  if (!h || game.phase !== 'walk') return
  if (h.kind === 'switch') {
    toggleNight()
    return
  }
  // Desk keypads work where you stand: press, and that desk rises or lowers.
  if (h.kind === 'desk-button') {
    toggleDesk(h.desk ?? 'main')
    return
  }
  // A short cooldown stops the key that closed a view from reopening it.
  if (h.views.length === 0 || performance.now() - lastExit < 600) return
  // Spotify is only contacted once a visitor chooses the music corner.
  if (h.id === 'music') useMusic.getState().open()
  if (h.kind === 'exercise') startExercise(h.id === 'bike' ? 'bike' : 'treadmill')
  game.setPrompt(null)
  game.setInspect(h.id, 0)
  game.setPhase('fly')
  if (document.pointerLockElement) document.exitPointerLock()
  const { eye, rotation } = viewOf(h, 0)
  fly(eye, rotation, 1.0, () => useGame.getState().setPhase('inspect'))
}

export function stepView(delta: number) {
  const game = useGame.getState()
  if (game.phase !== 'inspect' || !game.inspectId) return
  const h = hotspotById.get(game.inspectId)
  if (!h || h.views.length < 2) return
  const n = h.views.length
  const index = (game.viewIndex + delta + n) % n
  game.setView(index)
  const { eye, rotation } = viewOf(h, index)
  fly(eye, rotation, 0.65, () => undefined)
}

export function leaveInspect() {
  const game = useGame.getState()
  if (game.phase !== 'inspect') return
  stopExercise()
  game.setPhase('fly')
  const eye = new Vector3(pose.x, TUNING.eye, pose.z)
  const rotation = new Quaternion().setFromEuler(new Euler(pose.pitch, pose.yaw, 0, 'YXZ'))
  fly(eye, rotation, 0.8, () => {
    const g = useGame.getState()
    g.setInspect(null)
    g.setPhase('walk')
    lastExit = performance.now()
  })
  releaseBlind()
  // Look around straight away. A click lets the browser lock the pointer again
  // at once; Esc doesn't count as a gesture, so until the next click the mouse
  // turns the view with the cursor hidden (free look).
  game.setFreeLook(true)
  lockPointer()
}

export function toggleNight() {
  const game = useGame.getState()
  const night = !game.night
  game.setNight(night)
  gsap.to(tod, { value: night ? 1 : 0, duration: 2.6, ease: 'sine.inOut', overwrite: true })
}

/** Raise or lower one desk; the other stays where it is. */
export function toggleDesk(desk: DeskId = 'main') {
  const game = useGame.getState()
  const standing = desk === 'lab' ? !game.labStanding : !game.deskStanding
  if (desk === 'lab') game.setLabStanding(standing)
  else game.setDeskStanding(standing)
  const key = desk === 'lab' ? 'labLift' : 'lift'
  const target = standing ? DESK_LIFT : 0
  const delta = target - deskState[key]
  gsap.to(deskState, { [key]: target, duration: 2.4, ease: 'power1.inOut', overwrite: 'auto' })
  // While looking at that desk, ride up or down with it.
  const watching = game.inspectId ? hotspotById.get(game.inspectId) : undefined
  if (camera && game.phase === 'inspect' && watching?.followsDesk === desk) {
    gsap.to(camera.position, { y: camera.position.y + delta, duration: 2.4, ease: 'power1.inOut' })
  }
}

/** Start moving a blind group while a button is held: -1 raises it, 1 lowers it. */
export function holdBlind(id: string, dir: -1 | 1) {
  blindHold.id = id
  blindHold.dir = dir
}

export function releaseBlind() {
  blindHold.dir = 0
}

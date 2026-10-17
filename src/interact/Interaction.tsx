import { Html } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { Frustum, Matrix4, Vector3 } from 'three'
import { hotspotById, hotspots, type Hotspot } from '../layout'
import { useGame } from '../state/store'
import { activate, bindCamera, holdBlind, leaveInspect, liftOf, releaseBlind, stepView, toggleNight } from './actions'

// Which object is "in reach"? Every frame: of the hotspots within their radius,
// roughly in front of you and inside the camera's view, the nearest one wins.

const forward = new Vector3()
const toAnchor = new Vector3()
const anchor = new Vector3()
const projection = new Matrix4()
const frustum = new Frustum()
/** cos of the widest angle between where you look and an object you can use (about 60°). */
const FACING = 0.5

function anchorOf(h: Hotspot, out: Vector3) {
  out.copy(h.anchor)
  out.y += liftOf(h)
  return out
}

export function Interaction() {
  const camera = useThree((s) => s.camera)
  const promptId = useGame((s) => s.promptId)
  const phase = useGame((s) => s.phase)
  const night = useGame((s) => s.night)
  const deskStanding = useGame((s) => s.deskStanding)
  const labStanding = useGame((s) => s.labStanding)

  useEffect(() => bindCamera(camera), [camera])

  useFrame(() => {
    const game = useGame.getState()
    if (game.phase !== 'walk') {
      if (game.promptId) game.setPrompt(null)
      return
    }
    camera.getWorldDirection(forward)
    projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    frustum.setFromProjectionMatrix(projection)
    let best: Hotspot | null = null
    let bestDistance = Infinity
    for (const h of hotspots) {
      anchorOf(h, anchor)
      const distance = camera.position.distanceTo(anchor)
      if (distance > h.radius || distance >= bestDistance) continue
      toAnchor.subVectors(anchor, camera.position).normalize()
      if (forward.dot(toAnchor) < FACING || !frustum.containsPoint(anchor)) continue
      best = h
      bestDistance = distance
    }
    const id = best?.id ?? null
    if (id !== game.promptId) game.setPrompt(id)
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const g = useGame.getState()
      if (e.code === 'KeyE' && g.phase === 'walk' && g.promptId) activate(g.promptId)
      else if (e.code === 'Escape' && g.phase === 'inspect') leaveInspect()
      else if (g.phase === 'inspect' && (e.code === 'ArrowRight' || e.code === 'KeyD')) stepView(1)
      else if (g.phase === 'inspect' && (e.code === 'ArrowLeft' || e.code === 'KeyA')) stepView(-1)
      else if (e.code === 'KeyL' && (g.phase === 'walk' || g.phase === 'inspect')) toggleNight()
      // Blinds: hold ↑ / ↓ (or W / S) while looking at a group.
      if (g.phase === 'inspect' && g.inspectId?.startsWith('blinds-')) {
        const group = g.inspectId.slice(7)
        if (e.code === 'ArrowUp' || e.code === 'KeyW') holdBlind(group, -1)
        else if (e.code === 'ArrowDown' || e.code === 'KeyS') holdBlind(group, 1)
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (['ArrowUp', 'KeyW', 'ArrowDown', 'KeyS'].includes(e.code)) releaseBlind()
    }
    const onMouseDown = (e: MouseEvent) => {
      const g = useGame.getState()
      if (e.button === 0 && g.phase === 'walk' && document.pointerLockElement && g.promptId) activate(g.promptId)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('mousedown', onMouseDown)
    return () => {
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onMouseDown)
    }
  }, [])

  const h = promptId ? hotspotById.get(promptId) : undefined
  if (!h || phase !== 'walk') return null
  const standing = h.desk === 'lab' ? labStanding : deskStanding
  const label =
    h.kind === 'switch' ? (night ? 'Switch to day' : 'Switch to night') : h.kind === 'desk-button' ? `${standing ? 'Lower' : 'Raise'} ${h.label.toLowerCase()}` : h.label
  const p = anchorOf(h, new Vector3())
  return (
    <Html position={[p.x, p.y, p.z]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
      <div className="prompt">
        <kbd>E</kbd>
        <span>{label}</span>
      </div>
    </Html>
  )
}

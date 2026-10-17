import { useGame } from '../state/store'

// Keyboard and mouse input, kept outside React so the render loop can read it
// every frame for free.

export const keys = new Set<string>()
/** Mouse movement since the last frame, in pixels. */
export const look = { dx: 0, dy: 0 }

// Some browsers occasionally report one huge jump while the pointer is locked.
// Real hand movement never gets near this in a single event, so drop it.
const SPIKE_PX = 160

const isTyping = (e: KeyboardEvent) =>
  e.target instanceof HTMLElement &&
  (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.target.isContentEditable)

export function canvasElement() {
  return document.querySelector('canvas')
}

export function lockPointer() {
  const canvas = canvasElement()
  if (!canvas) return
  try {
    const request = canvas.requestPointerLock({ unadjustedMovement: true })
    request?.catch(() => canvas.requestPointerLock()?.catch(() => undefined))
  } catch {
    canvas.requestPointerLock()?.catch(() => undefined)
  }
}

export function bindInput() {
  const down = (e: KeyboardEvent) => {
    if (isTyping(e)) return
    keys.add(e.code)
  }
  const up = (e: KeyboardEvent) => keys.delete(e.code)
  const move = (e: MouseEvent) => {
    const g = useGame.getState()
    const freeLook = g.freeLook && g.phase === 'walk' && e.target === canvasElement()
    if (!document.pointerLockElement && !freeLook) return
    if (Math.abs(e.movementX) > SPIKE_PX || Math.abs(e.movementY) > SPIKE_PX) return
    look.dx += e.movementX
    look.dy += e.movementY
  }
  const lockChange = () => {
    const locked = document.pointerLockElement === canvasElement()
    const g = useGame.getState()
    g.setLocked(locked)
    // Locked: free look is no longer needed. Unlocked while walking: the
    // visitor pressed Esc to get a cursor, so leave the view still.
    if (locked || g.phase === 'walk') g.setFreeLook(false)
    if (!locked) keys.clear()
  }
  // Clicking the room while walking takes the pointer back.
  const click = (e: MouseEvent) => {
    const g = useGame.getState()
    if (g.phase === 'walk' && !document.pointerLockElement && e.target === canvasElement()) lockPointer()
  }
  const blur = () => keys.clear()
  window.addEventListener('keydown', down)
  window.addEventListener('keyup', up)
  window.addEventListener('blur', blur)
  document.addEventListener('mousemove', move)
  document.addEventListener('pointerlockchange', lockChange)
  document.addEventListener('click', click)
  return () => {
    document.removeEventListener('click', click)
    window.removeEventListener('keydown', down)
    window.removeEventListener('keyup', up)
    window.removeEventListener('blur', blur)
    document.removeEventListener('mousemove', move)
    document.removeEventListener('pointerlockchange', lockChange)
  }
}

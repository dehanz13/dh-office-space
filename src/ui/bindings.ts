import { useEffect, useState } from 'react'

// The office's key bindings, shared by the elevator's button panel and the
// floating keymap you see while walking, so the two always agree.

export interface Binding {
  /** The label on the key or button. */
  cap: string
  /** KeyboardEvent.code values that press it. */
  codes: string[]
  /** What it does, in a word or two. */
  does: string
  wide?: boolean
}

export const BINDINGS: Record<string, Binding> = {
  w: { cap: 'W', codes: ['KeyW', 'ArrowUp'], does: 'forward' },
  a: { cap: 'A', codes: ['KeyA', 'ArrowLeft'], does: 'left' },
  s: { cap: 'S', codes: ['KeyS', 'ArrowDown'], does: 'back' },
  d: { cap: 'D', codes: ['KeyD', 'ArrowRight'], does: 'right' },
  shift: { cap: '⇧', codes: ['ShiftLeft', 'ShiftRight'], does: 'run', wide: true },
  e: { cap: 'E', codes: ['KeyE'], does: 'use' },
  l: { cap: 'L', codes: ['KeyL'], does: 'lights' },
  m: { cap: 'M', codes: ['KeyM'], does: 'music' },
  esc: { cap: 'Esc', codes: ['Escape'], does: 'cursor', wide: true },
}

/** Which bindings are held down right now, from the real keyboard. */
export function useHeldKeys() {
  const [held, setHeld] = useState<Set<string>>(() => new Set())
  useEffect(() => {
    const find = (code: string) => Object.keys(BINDINGS).find((k) => BINDINGS[k].codes.includes(code))
    const change = (on: boolean) => (e: KeyboardEvent) => {
      const key = find(e.code)
      if (!key) return
      setHeld((prev) => {
        if (prev.has(key) === on) return prev
        const next = new Set(prev)
        if (on) next.add(key)
        else next.delete(key)
        return next
      })
    }
    const down = change(true)
    const up = change(false)
    const clear = () => setHeld(new Set())
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', clear)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', clear)
    }
  }, [])
  return held
}

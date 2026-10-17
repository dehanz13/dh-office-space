import { useProgress } from '@react-three/drei'
import { useCallback, useEffect, useRef, useState } from 'react'
import { owner } from '../content'
import { lockPointer } from '../player/input'
import { useGame } from '../state/store'
import { BINDINGS, useHeldKeys } from './bindings'
import { Poster } from './Poster'
import { audioReady, click, ding, startHum, stopHum, unlockAudio } from './sound'

// The way in: the office loads while you ride an elevator up to the 23rd floor.
// The progress bar sits over the doors, one lit segment per floor. The button
// panel is the office's keymap; press a button (or the real key) and it lights.
// On arrival a ding, the doors open onto the office, and you step out.

export const OFFICE_FLOOR = 23
/** The car never climbs faster than this, so even a cached visit feels like a ride. */
const SECONDS_PER_FLOOR = 0.3
const PANEL: (keyof typeof BINDINGS)[] = ['w', 'a', 's', 'd', 'shift', 'e', 'l', 'm', 'esc']

type Stage = 'riding' | 'arrived' | 'open' | 'leaving' | 'gone'

export function Elevator() {
  const phase = useGame((s) => s.phase)
  const { progress, active } = useProgress()
  const [floor, setFloor] = useState(1)
  const [stage, setStage] = useState<Stage>('riding')
  const [lit, setLit] = useState<Set<string>>(() => new Set())
  const [sound, setSound] = useState(false)
  const held = useHeldKeys()
  const loaded = !active && progress >= 100
  const target = loaded ? OFFICE_FLOOR : Math.max(1, Math.min(OFFICE_FLOOR - 1, 1 + Math.floor((progress / 100) * (OFFICE_FLOOR - 1))))
  const floorRef = useRef(floor)
  floorRef.current = floor

  // Climb one floor at a time toward the floor the download has reached.
  useEffect(() => {
    if (stage !== 'riding') return
    const id = window.setInterval(() => {
      if (floorRef.current < target) setFloor((f) => Math.min(target, f + 1))
    }, SECONDS_PER_FLOOR * 1000)
    return () => window.clearInterval(id)
  }, [stage, target])

  // Arrival: the car settles, the bell dings, then the doors open.
  useEffect(() => {
    if (stage === 'riding' && floor >= OFFICE_FLOOR && loaded) setStage('arrived')
  }, [floor, loaded, stage])

  useEffect(() => {
    if (stage !== 'arrived') return
    stopHum()
    const dingAt = window.setTimeout(ding, 380)
    const open = window.setTimeout(() => setStage('open'), 1100)
    return () => {
      window.clearTimeout(dingAt)
      window.clearTimeout(open)
    }
  }, [stage])

  // Keys light their buttons too, the way a real panel remembers a press.
  useEffect(() => {
    if (held.size === 0) return
    setLit((prev) => new Set([...prev, ...held]))
  }, [held])

  const press = (id: string) => {
    unlockAudio()
    setSound(true)
    click()
    if (stage === 'riding') startHum()
    setLit((prev) => new Set(prev).add(id))
  }

  const stepOut = useCallback(() => {
    if (stage !== 'open') return
    setStage('leaving')
    useGame.getState().setPhase('walk')
    lockPointer()
    window.setTimeout(() => setStage('gone'), 950)
  }, [stage])

  useEffect(() => {
    if (stage !== 'open') return
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Enter' || e.code === 'Space') stepOut()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [stage, stepOut])

  const toggleSound = () => {
    unlockAudio()
    setSound(true)
    window.setTimeout(() => {
      if (audioReady() && stage === 'riding') startHum()
    }, 60)
  }

  if (stage === 'gone' || (phase !== 'enter' && stage !== 'leaving')) return null
  // The bar never runs ahead of the car: it shows the ride, which waits for the download.
  const percent = Math.round(Math.min(progress, ((floor - 1) / (OFFICE_FLOOR - 1)) * 100))
  const riding = stage === 'riding'
  return (
    <div className={`elevator stage-${stage}`} role="dialog" aria-label="Elevator to the office" aria-describedby="lift-status">
      <div className="lift-car">
        <div className="lift-ceiling">
          <span className="lift-light" />
        </div>
        <div className="lift-wall left">
          <span className="lift-rail" />
        </div>
        <div className="lift-wall right">
          <span className="lift-rail" />
        </div>
        <div className="lift-floor" />
        <div className="lift-front">
          <div className="front-left" />
          <div className="front-right" />
          {/* The poster and the button panel share one grid row, so they always
              match in height and line up with the head of the door. */}
          <div className="lift-notice">
            <Poster />
            <div className="lift-plaque" aria-hidden="true">
              <b>Car 2</b>
              <span>Capacity 13 persons · 1000 kg</span>
              <span>Floors 1 – {OFFICE_FLOOR}</span>
            </div>
          </div>
          <div className="front-top">
            <div className="lift-indicator">
              <span className={`lift-arrow${riding ? ' moving' : ''}`} aria-hidden="true">
                ▲
              </span>
              <span className="lift-number" aria-hidden="true">
                {String(floor).padStart(2, '0')}
              </span>
              <span className={`lift-lantern${stage !== 'riding' ? ' on' : ''}`} aria-hidden="true" />
            </div>
            <div className="lift-progress" role="progressbar" aria-label="Loading the office" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
              {Array.from({ length: OFFICE_FLOOR }, (_, i) => (
                <span key={i} className={i < floor ? 'on' : ''} />
              ))}
            </div>
            <p className="lift-caption" id="lift-status">
              {riding ? `Going up to ${owner.name}'s office · ${percent}%` : stage === 'arrived' ? `Floor ${OFFICE_FLOOR}` : `Floor ${OFFICE_FLOOR} · ${owner.name}'s office`}
            </p>
          </div>
          <div className="lift-panel" aria-label="Controls, as elevator buttons">
            <div className="lift-panel-screen" aria-hidden="true">
              <span>{String(floor).padStart(2, '0')}</span>
              <small>{riding ? 'UP' : 'OPEN'}</small>
            </div>
            <ul>
              {PANEL.map((id) => {
                const b = BINDINGS[id]
                const on = lit.has(id)
                return (
                  <li key={id}>
                    <button type="button" className={`lift-button${on ? ' lit' : ''}${held.has(id) ? ' held' : ''}`} aria-pressed={on} aria-label={`${b.cap}: ${b.does}`} onClick={() => press(id)}>
                      {b.cap}
                    </button>
                    <span>{b.does}</span>
                  </li>
                )
              })}
              <li className="mouse-row">
                <button type="button" className={`lift-button${lit.has('mouse') ? ' lit' : ''}`} aria-pressed={lit.has('mouse')} aria-label="Mouse: look around" onClick={() => press('mouse')}>
                  <span className="mouse" aria-hidden="true" />
                </button>
                <span>look</span>
              </li>
            </ul>
            <button type="button" className={`lift-sound${sound ? ' on' : ''}`} onClick={toggleSound}>
              {sound ? '♪ sound on' : '♪ tap for sound'}
            </button>
            <div className="lift-braille" aria-hidden="true" />
          </div>
          <div className="doorway">
            <div className="door left" />
            <div className="door right" />
            <span className="door-gap" aria-hidden="true" />
            {stage === 'open' && (
              <button type="button" className="step-out" onClick={stepOut}>
                Step into the office <kbd>Enter</kbd>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

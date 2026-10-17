import { useEffect, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { hotspotText } from '../content'
import { exercise } from '../exercise/state'
import { holdBlind, leaveInspect, releaseBlind, stepView, toggleDesk, toggleNight } from '../interact/actions'
import { blindGroups, hotspotById } from '../layout'
import { canvasElement, lockPointer } from '../player/input'
import { blinds, useGame } from '../state/store'
import { Keymap } from './Keymap'

/** The game panel registers itself here once the AI boards load. */
export const hudSlots: { game?: (id: string) => ReactNode } = {}

function useDallasClock() {
  const format = () => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' }).format(new Date())
  const [time, setTime] = useState(format)
  useEffect(() => {
    const id = window.setInterval(() => setTime(format()), 30000)
    return () => window.clearInterval(id)
  }, [])
  return time
}

function useTicker(active: boolean, ms = 150) {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => setTick((t) => t + 1), ms)
    return () => window.clearInterval(id)
  }, [active, ms])
}

function ExerciseStats({ bike }: { bike: boolean }) {
  useTicker(true)
  const minutes = Math.floor(exercise.seconds / 60)
  const seconds = String(Math.floor(exercise.seconds % 60)).padStart(2, '0')
  const cells: [string, string][] = [
    [bike ? 'Cadence' : 'Steps', `${Math.round(exercise.cadence)} ${bike ? 'rpm' : '/min'}`],
    ['Speed', `${exercise.speed.toFixed(1)} km/h`],
    ['Distance', bike ? `${exercise.distance.toFixed(2)} km` : `${Math.round(exercise.distance * 1000)} m`],
    ['Time', `${minutes}:${seconds}`],
  ]
  return (
    <div className="stats" role="group" aria-label="Workout">
      {cells.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <b>{value}</b>
        </div>
      ))}
    </div>
  )
}

/** A button that moves a blind group while it is held. */
function HoldButton({ group, dir, label, children }: { group: string; dir: -1 | 1; label: string; children: ReactNode }) {
  const press = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    holdBlind(group, dir)
  }
  return (
    <button type="button" className="hold" onPointerDown={press} onPointerUp={releaseBlind} onPointerCancel={releaseBlind} onLostPointerCapture={releaseBlind} aria-label={label}>
      {children}
    </button>
  )
}

const blindText = (down: number) => (down === 0 ? 'Open' : down === 100 ? 'Closed' : `${down}% down`)

/** Hold ▲ or ▼ (pointer or keys) to move one blind group, or all of them; let go to stop. */
function BlindControls({ group }: { group: string }) {
  useTicker(true, 120)
  const all = group === 'all'
  const levels = blindGroups.map((g) => blinds[g.id] ?? 0)
  const down = Math.round((all ? levels.reduce((a, b) => a + b, 0) / Math.max(1, levels.length) : blinds[group] ?? 0) * 100)
  return (
    <div className="blind-controls" role="group" aria-label={all ? 'All blinds' : 'Blind'}>
      <HoldButton group={group} dir={-1} label={all ? 'Hold to raise every blind' : 'Hold to raise the blind'}>
        ▲ {all ? 'Raise all' : 'Raise'}
      </HoldButton>
      <span className="blind-state">{all ? `${down}% on average` : blindText(down)}</span>
      <HoldButton group={group} dir={1} label={all ? 'Hold to lower every blind' : 'Hold to lower the blind'}>
        ▼ {all ? 'Lower all' : 'Lower'}
      </HoldButton>
    </div>
  )
}

/** The door panel's list: every group with its level and its own buttons. */
function BlindGroups() {
  useTicker(true, 120)
  return (
    <ul className="blind-groups" aria-label="Blind groups">
      {blindGroups.map((g) => {
        const down = Math.round((blinds[g.id] ?? 0) * 100)
        return (
          <li key={g.id}>
            <b>{g.id.toUpperCase()}</b>
            <span className="blind-meter" aria-hidden="true">
              <span style={{ width: `${down}%` }} />
            </span>
            <span className="blind-pct">{down}%</span>
            <HoldButton group={g.id} dir={-1} label={`Hold to raise blinds ${g.id.toUpperCase()}`}>
              ▲
            </HoldButton>
            <HoldButton group={g.id} dir={1} label={`Hold to lower blinds ${g.id.toUpperCase()}`}>
              ▼
            </HoldButton>
          </li>
        )
      })}
    </ul>
  )
}

export function Hud() {
  const phase = useGame((s) => s.phase)
  const locked = useGame((s) => s.locked)
  const night = useGame((s) => s.night)
  const inspectId = useGame((s) => s.inspectId)
  const viewIndex = useGame((s) => s.viewIndex)
  const standing = useGame((s) => s.deskStanding)
  const labStanding = useGame((s) => s.labStanding)
  const freeLook = useGame((s) => s.freeLook)
  const clock = useDallasClock()

  // In free look the room has no cursor: the mouse is turning the view.
  useEffect(() => {
    const canvas = canvasElement()
    if (canvas) canvas.style.cursor = phase === 'walk' && freeLook && !locked ? 'none' : ''
  }, [phase, freeLook, locked])

  if (phase === 'enter') return null
  const hotspot = inspectId ? hotspotById.get(inspectId) : undefined
  const views = hotspot?.views.length ?? 0

  return (
    <>
      <button type="button" className="time-pill" onClick={toggleNight} aria-label={night ? 'Switch to day' : 'Switch to night'}>
        <span className={night ? 'dot night' : 'dot day'} aria-hidden="true" />
        {night ? 'Night' : 'Day'} · Dallas {clock}
      </button>

      {phase === 'walk' && (locked || freeLook) && <div className="crosshair" aria-hidden="true" />}
      {phase === 'walk' && !locked && !freeLook && (
        // The room is dimmed until a click hands the mouse back to the view.
        <button type="button" className="look-veil" onClick={lockPointer}>
          <span className="look-card">
            <span className="look-mouse" aria-hidden="true" />
            <b>Click anywhere to look around</b>
            <span>Esc gives you the cursor back, for the music player.</span>
          </span>
        </button>
      )}
      {phase === 'walk' && <Keymap />}

      {phase === 'inspect' && hotspot && hotspot.kind === 'game' && hudSlots.game?.(hotspot.id)}

      {phase === 'inspect' && hotspot && hotspot.kind !== 'game' && (
        <section className="inspect" aria-live="polite">
          <div className="inspect-text">
            <h2>{hotspot.label}</h2>
            {hotspot.kind === 'exercise' ? (
              <p>
                Tap <kbd>←</kbd> <kbd>→</kbd> in turn (or <kbd>A</kbd> <kbd>D</kbd>) to {hotspot.id === 'bike' ? 'pedal' : 'run'}. Faster taps, faster {hotspot.id === 'bike' ? 'ride' : 'run'}.
              </p>
            ) : (
              <p>{hotspotText[hotspot.id] ?? (hotspot.kind === 'blinds' ? hotspotText.blinds : '')}</p>
            )}
            {hotspot.kind === 'exercise' && <ExerciseStats bike={hotspot.id === 'bike'} />}
            {hotspot.id === 'blinds-all' && <BlindGroups />}
          </div>
          <div className="inspect-actions">
            {hotspot.kind === 'desk' && (
              <button type="button" className="primary" onClick={() => toggleDesk('main')}>
                {standing ? 'Sit down' : 'Stand up'}
              </button>
            )}
            {hotspot.id === 'agent-lab' && (
              <button type="button" className="primary" onClick={() => toggleDesk('lab')}>
                {labStanding ? 'Lower lab desk' : 'Raise lab desk'}
              </button>
            )}
            {hotspot.kind === 'blinds' && <BlindControls group={hotspot.id.replace('blinds-', '')} />}
            {views > 1 && (
              <div className="views" role="group" aria-label="Views">
                <button type="button" onClick={() => stepView(-1)} aria-label="Previous view">
                  ←
                </button>
                <span>
                  {viewIndex + 1} / {views}
                </span>
                <button type="button" onClick={() => stepView(1)} aria-label="Next view">
                  →
                </button>
              </div>
            )}
            <button type="button" onClick={leaveInspect}>
              {hotspot.kind === 'exercise' ? 'Step off' : 'Back'} <kbd>Esc</kbd>
            </button>
          </div>
        </section>
      )}
    </>
  )
}

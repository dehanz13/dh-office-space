import { useState } from 'react'
import { BINDINGS, useHeldKeys } from './bindings'

/** One key cap: it sinks and lights while the real key is held. */
function Cap({ id, held }: { id: string; held: Set<string> }) {
  const b = BINDINGS[id]
  return (
    <span className={`cap${b.wide ? ' wide' : ''}${held.has(id) ? ' down' : ''}`} aria-hidden="true">
      {b.cap}
    </span>
  )
}

function readCollapsed() {
  try {
    return window.localStorage.getItem('office.keymap') === 'closed'
  } catch {
    return false
  }
}

/** The floating keymap while you walk: a little keyboard that answers your keys. */
export function Keymap() {
  const held = useHeldKeys()
  const [closed, setClosed] = useState(readCollapsed)
  const toggle = () => {
    setClosed((c) => {
      try {
        window.localStorage.setItem('office.keymap', c ? 'open' : 'closed')
      } catch {
        // Storage can be blocked; the choice just won't be remembered.
      }
      return !c
    })
  }
  if (closed) {
    return (
      <button type="button" className="keymap-chip" onClick={toggle} aria-label="Show the controls">
        <span className="cap mini" aria-hidden="true">
          W
        </span>
        Controls
      </button>
    )
  }
  return (
    <section className="keymap" aria-label="Controls">
      <header>
        <span className="keymap-dot" aria-hidden="true" />
        <span>Controls</span>
        <button type="button" onClick={toggle} aria-label="Hide the controls">
          –
        </button>
      </header>
      <div className="keymap-body">
        <div className="wasd">
          <span />
          <Cap id="w" held={held} />
          <span />
          <Cap id="a" held={held} />
          <Cap id="s" held={held} />
          <Cap id="d" held={held} />
        </div>
        <dl>
          <div>
            <dt>Walk</dt>
            <dd>W A S D or arrows</dd>
          </div>
          <div>
            <dt>Look</dt>
            <dd>
              <span className="mouse" aria-hidden="true" /> move the mouse
            </dd>
          </div>
        </dl>
      </div>
      <ul className="keymap-rows">
        {(['shift', 'e', 'l', 'm', 'esc'] as const).map((id) => (
          <li key={id}>
            <Cap id={id} held={held} />
            <span>{BINDINGS[id].does}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

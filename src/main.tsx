import '@fontsource/permanent-marker'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { activate, holdBlind, leaveInspect, releaseBlind, stepView, toggleDesk, toggleNight } from './interact/actions'
import { exercise, tap } from './exercise/state'
import { boardState, squareOnScreen } from './play/Boards'
import { boardMessage, boardStatus } from './play/status'
import { pose } from './player/Player'
import { blinds, deskState, tod, useGame } from './state/store'
import './styles.css'

if (import.meta.env.DEV) {
  // Test hook for driving the office from a browser test. Not in production builds.
  Object.assign(window, { __office: { pose, activate, leaveInspect, stepView, toggleDesk, toggleNight, game: useGame, tod, deskState, exercise, tap, squareOnScreen, boardState, boardStatus, boardMessage, blinds, holdBlind, releaseBlind } })
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

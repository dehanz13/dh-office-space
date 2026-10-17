import { useEffect, useState } from 'react'
import type { GameId } from '../games'
import { leaveInspect } from '../interact/actions'
import { hotspotById } from '../layout'
import { boardControls, boardMessage, boardThinking, type Level } from './status'

const HOW_TO: Record<GameId, string> = {
  chess: 'You play White. Click one of your pieces, then a highlighted square.',
  checkers: 'You play red. Click a piece, then where it lands.',
  go: 'You play Black. Click a point to place a stone.',
}

const RULES: Record<GameId, string[]> = {
  chess: [
    'You are White and move first; the AI plays Black.',
    'Click a piece to see where it can go: dots are empty squares, rings are captures.',
    'Castle by moving your king two squares. Pawns reaching the last rank become queens.',
    'Checkmate wins. Stalemate, threefold repetition and the 50-move rule are draws.',
  ],
  checkers: [
    'You are red, moving up the board; the AI is black. Pieces stay on the dark squares.',
    'Men move one square diagonally forward; kings move diagonally both ways.',
    'Jumps are compulsory. For a double jump, click where your piece finally lands.',
    'Reach the far row to crown a king. Take every AI piece, or leave it no moves, to win.',
    'Forty moves each with no capture and no man moving is a draw.',
  ],
  go: [
    'You are Black and play first on a 9×9 board; White gets 6.5 points (komi) for going second.',
    'Click an empty point to place a stone. Stones never move once placed.',
    'A group with no empty points next to it is captured and taken off.',
    'You may not repeat the previous position (ko) or fill your own group’s last liberty.',
    'Pass when nothing useful is left. Two passes end the game: stones plus surrounded points score.',
  ],
}

const LEVELS: { level: Level; label: string }[] = [
  { level: 'easy', label: 'Easy' },
  { level: 'medium', label: 'Medium' },
  { level: 'hard', label: 'Hard' },
]

/** The panel shown while the visitor sits at an AI board. It sits at the side,
 *  clear of the board, and scrolls inside the window if the window is short. */
export function GamePanel({ id }: { id: GameId }) {
  const [, setTick] = useState(0)
  const [rules, setRules] = useState(false)
  useEffect(() => {
    const timer = window.setInterval(() => setTick((t) => t + 1), 200)
    return () => window.clearInterval(timer)
  }, [])
  const controls = boardControls[id]
  const thinking = boardThinking[id]
  const level = controls?.level() ?? 'medium'
  return (
    <section className="game-panel" aria-live="polite">
      <h2>{hotspotById.get(id)?.label ?? 'Play the AI'}</h2>
      <p className={thinking ? 'game-status thinking' : 'game-status'}>{boardMessage[id]}</p>
      <p className="game-hint">{HOW_TO[id]}</p>

      <div className="game-section">
        <span className="game-label">AI difficulty</span>
        <div className="levels" role="radiogroup" aria-label="AI difficulty">
          {LEVELS.map((l) => (
            <button key={l.level} type="button" role="radio" aria-checked={l.level === level} className={l.level === level ? 'on' : ''} onClick={() => controls?.setLevel(l.level)}>
              {l.label}
            </button>
          ))}
        </div>
        <span className="game-note">Changing it starts a new game.</span>
      </div>

      <div className="game-section">
        <button type="button" className="rules-toggle" aria-expanded={rules} onClick={() => setRules((r) => !r)}>
          {rules ? 'Hide instructions' : 'How to play'}
        </button>
        {rules && (
          <ul className="rules">
            {RULES[id].map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="game-actions">
        {controls?.canPass() && (
          <button type="button" onClick={() => controls.pass()} disabled={thinking}>
            Pass
          </button>
        )}
        <button type="button" onClick={() => controls?.newGame()}>
          New game
        </button>
        <button type="button" onClick={leaveInspect}>
          Back <kbd>Esc</kbd>
        </button>
      </div>
    </section>
  )
}

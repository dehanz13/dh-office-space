// 9x9 Go game with stable stone ids. The human is Black and plays first;
// the AI is White and receives komi. Rules live in goCore.ts; the AI runs in
// go.worker.ts.

import { AIRunner } from './aiRunner'
import {
  AREA,
  BLACK,
  EMPTY,
  N,
  WHITE,
  areaScore,
  isLegal,
  pointName,
  thinkGo,
  tryPlay,
  type GoAIReply,
  type GoAIRequest,
  type Stone,
} from './goCore'
import type { BoardGame, GameStatus, MoveEvent, Piece, Side, Square } from './types'

/** After this many moves (passes included) the game is scored as it stands. */
const MAX_MOVES = 300

const spawnWorker = () => new Worker(new URL('./go.worker.ts', import.meta.url), { type: 'module' })

function toSquare(p: number): Square {
  return { x: p % N, y: (p / N) | 0 }
}

function toIndex(s: Square | null): number {
  if (!s || !Number.isInteger(s.x) || !Number.isInteger(s.y) || s.x < 0 || s.x >= N || s.y < 0 || s.y >= N) return -1
  return s.y * N + s.x
}

function emptyEvent(notation: string): MoveEvent {
  return { moved: [], captured: [], placed: [], notation }
}

export interface GoOptions {
  komi?: number
  /** Think budget in ms (default 600). */
  budgetMs?: number
  /** Use random playouts to refine the heuristic choice (default true). */
  playouts?: boolean
}

export class GoGame implements BoardGame {
  readonly id = 'go' as const
  readonly size = N
  readonly komi: number

  private board = new Int8Array(AREA)
  private ids: (string | null)[] = []
  private toMove: Stone = BLACK
  private ko = -1
  private passes = 0
  private moveNumber = 0
  private stones = 0
  private lastPasser: Side | null = null
  private finished: { black: number; white: number; limit: boolean } | null = null
  private last: MoveEvent | null = null
  private generation = 0
  private thinking: Promise<MoveEvent | null> | null = null
  private readonly runner = new AIRunner<GoAIRequest, GoAIReply>(spawnWorker, thinkGo)
  private readonly opts: { budgetMs: number; playouts: boolean }

  constructor(opts: GoOptions = {}) {
    this.komi = opts.komi ?? 6.5
    this.opts = { budgetMs: opts.budgetMs ?? 600, playouts: opts.playouts ?? true }
    this.reset()
  }

  reset(): void {
    this.generation++
    this.thinking = null
    this.board = new Int8Array(AREA)
    this.ids = new Array<string | null>(AREA).fill(null)
    this.toMove = BLACK
    this.ko = -1
    this.passes = 0
    this.moveNumber = 0
    this.stones = 0
    this.lastPasser = null
    this.finished = null
    this.last = null
  }

  pieces(): Piece[] {
    const out: Piece[] = []
    for (let p = 0; p < AREA; p++) {
      const id = this.ids[p]
      if (this.board[p] === EMPTY || !id) continue
      out.push({ id, kind: 'stone', owner: this.board[p] === BLACK ? 'human' : 'ai', at: toSquare(p) })
    }
    return out
  }

  turn(): Side {
    return this.toMove === BLACK ? 'human' : 'ai'
  }

  /** Current area count (stones + territory, komi included for White). */
  score(): { human: number; ai: number } {
    const s = this.finished ?? areaScore(this.board)
    return { human: s.black, ai: s.white + this.komi }
  }

  status(): GameStatus {
    if (this.finished) {
      const { human, ai } = this.score()
      const margin = Math.abs(human - ai)
      const prefix = this.finished.limit ? 'Move limit reached. ' : ''
      const pts = margin === 1 ? 'point' : 'points'
      if (human > ai) return { over: true, winner: 'human', text: `${prefix}You win by ${margin} ${pts}.` }
      if (ai > human) return { over: true, winner: 'ai', text: `${prefix}The AI wins by ${margin} ${pts}.` }
      return { over: true, winner: 'draw', text: `${prefix}A draw.` }
    }
    if (this.toMove === BLACK) {
      return { over: false, winner: null, text: this.lastPasser === 'ai' ? 'The AI passed. Your move.' : 'Your move' }
    }
    if (this.thinking) return { over: false, winner: null, text: 'The AI is thinking.' }
    return { over: false, winner: null, text: this.lastPasser === 'human' ? "You passed. The AI's move." : "The AI's move." }
  }

  movableFrom(): Square[] {
    return []
  }

  targets(_from: Square | null): Square[] {
    if (!this.humanCanMove()) return []
    const out: Square[] = []
    for (let p = 0; p < AREA; p++) {
      if (this.board[p] === EMPTY && isLegal(this.board, p, BLACK, this.ko)) out.push(toSquare(p))
    }
    return out
  }

  /** `from` is ignored for go (pass null). */
  play(_from: Square | null, to: Square): MoveEvent | null {
    const p = toIndex(to)
    if (p < 0 || !this.humanCanMove()) return null
    return this.place(p, BLACK)
  }

  /** The human passes. Ignored (returns an event with empty notation) unless it is the human's turn. */
  pass(): MoveEvent {
    if (!this.humanCanMove()) return emptyEvent('')
    return this.doPass('human')
  }

  aiMove(): Promise<MoveEvent | null> {
    if (this.thinking) return this.thinking
    if (this.finished || this.toMove !== WHITE) return Promise.resolve(null)
    const generation = this.generation
    const moveNumber = this.moveNumber
    const job = this.runner
      .run({
        board: Array.from(this.board),
        color: WHITE,
        ko: this.ko,
        moveNumber,
        opponentPassed: this.lastPasser === 'human' && this.passes > 0,
        komi: this.komi,
        budgetMs: this.opts.budgetMs,
        playouts: this.opts.playouts,
      })
      .catch((): GoAIReply => ({ point: null, reason: 'engine error', playouts: 0 }))
      .then((reply) => {
        if (generation !== this.generation || this.moveNumber !== moveNumber || this.toMove !== WHITE || this.finished) return null
        if (reply.point !== null) {
          const ev = this.place(reply.point, WHITE)
          if (ev) return ev
        }
        return this.doPass('ai')
      })
      .finally(() => {
        if (this.thinking === job) this.thinking = null
      })
    this.thinking = job
    return job
  }

  lastMove(): MoveEvent | null {
    return this.last
  }

  dispose(): void {
    this.runner.dispose()
  }

  private humanCanMove(): boolean {
    return !this.thinking && !this.finished && this.toMove === BLACK
  }

  private place(p: number, color: Stone): MoveEvent | null {
    const res = tryPlay(this.board, p, color, this.ko)
    if (!res) return null
    const captured: string[] = []
    for (const c of res.captured) {
      const id = this.ids[c]
      if (id) captured.push(id)
      this.ids[c] = null
    }
    const id = `stone-${++this.stones}`
    this.ids[p] = id
    this.ko = res.ko
    this.passes = 0
    this.lastPasser = null
    const ev: MoveEvent = {
      moved: [],
      captured,
      placed: [{ id, kind: 'stone', owner: color === BLACK ? 'human' : 'ai', at: toSquare(p) }],
      notation: pointName(p),
    }
    this.advance()
    this.last = ev
    return ev
  }

  private doPass(who: Side): MoveEvent {
    this.passes++
    this.ko = -1
    this.lastPasser = who
    const ev = emptyEvent('pass')
    this.advance()
    this.last = ev
    return ev
  }

  private advance(): void {
    this.moveNumber++
    this.toMove = this.toMove === BLACK ? WHITE : BLACK
    const limit = this.moveNumber >= MAX_MOVES
    if (this.passes >= 2 || limit) this.finished = { ...areaScore(this.board), limit: limit && this.passes < 2 }
  }
}

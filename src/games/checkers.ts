// Checkers (American / English draughts) game with stable piece ids.
// Rules live in checkersCore.ts; the AI runs in checkers.worker.ts.

import { AIRunner } from './aiRunner'
import {
  genMoves,
  initialBoard,
  makeMove,
  moveNotation,
  thinkCheckers,
  type CheckersAIReply,
  type CheckersAIRequest,
  type CMove,
  type CSide,
} from './checkersCore'
import type { BoardGame, GameStatus, MoveEvent, Piece, Side, Square } from './types'

const HUMAN: CSide = 1
const AI: CSide = -1
/** Plies (40 moves each) without a capture or a man moving before the game is drawn. */
const DRAW_PLIES = 80

const spawnWorker = () => new Worker(new URL('./checkers.worker.ts', import.meta.url), { type: 'module' })

function toSquare(sq: number): Square {
  return { x: sq & 7, y: sq >> 3 }
}

function toIndex(s: Square | null): number {
  if (!s || !Number.isInteger(s.x) || !Number.isInteger(s.y) || s.x < 0 || s.x > 7 || s.y < 0 || s.y > 7) return -1
  return s.y * 8 + s.x
}

export interface CheckersOptions {
  /** Search depth (default 6). */
  depth?: number
  /** Think budget in ms (default 500). */
  budgetMs?: number
  /** Root moves within this many points of the best (a man = 100) are chosen at random (default 6). */
  randomness?: number
}

export class CheckersGame implements BoardGame {
  readonly id = 'checkers' as const
  readonly size = 8

  private board = initialBoard()
  private ids: (string | null)[] = []
  private side: CSide = HUMAN
  private quietPlies = 0
  private cache: CMove[] | null = null
  private last: MoveEvent | null = null
  private generation = 0
  private thinking: Promise<MoveEvent | null> | null = null
  private readonly runner = new AIRunner<CheckersAIRequest, CheckersAIReply>(spawnWorker, thinkCheckers)
  private readonly opts: Required<CheckersOptions>

  constructor(opts: CheckersOptions = {}) {
    this.opts = { depth: opts.depth ?? 6, budgetMs: opts.budgetMs ?? 500, randomness: opts.randomness ?? 6 }
    this.reset()
  }

  reset(): void {
    this.generation++
    this.thinking = null
    this.board = initialBoard()
    this.ids = new Array<string | null>(64).fill(null)
    let h = 0
    let a = 0
    for (let sq = 0; sq < 64; sq++) {
      if (this.board[sq] > 0) this.ids[sq] = `you-${++h}`
      else if (this.board[sq] < 0) this.ids[sq] = `ai-${++a}`
    }
    this.side = HUMAN
    this.quietPlies = 0
    this.cache = null
    this.last = null
  }

  pieces(): Piece[] {
    const out: Piece[] = []
    for (let sq = 0; sq < 64; sq++) {
      const p = this.board[sq]
      const id = this.ids[sq]
      if (!p || !id) continue
      out.push({ id, kind: p === 2 || p === -2 ? 'king' : 'man', owner: p > 0 ? 'human' : 'ai', at: toSquare(sq) })
    }
    return out
  }

  turn(): Side {
    return this.side === HUMAN ? 'human' : 'ai'
  }

  status(): GameStatus {
    const moves = this.moves()
    if (moves.length === 0) {
      const loserHasPieces = this.board.some((p) => p * this.side > 0)
      if (this.side === AI) {
        return { over: true, winner: 'human', text: loserHasPieces ? 'You win! The AI has no moves left.' : 'You win! You captured every AI piece.' }
      }
      return { over: true, winner: 'ai', text: loserHasPieces ? 'The AI wins. You have no moves left.' : 'The AI wins. It captured all your pieces.' }
    }
    if (this.quietPlies >= DRAW_PLIES) {
      return { over: true, winner: 'draw', text: 'Draw. 40 moves each without a capture or a man moving.' }
    }
    if (this.side === HUMAN) return { over: false, winner: null, text: moves[0].caps.length ? 'Your move. You must capture.' : 'Your move' }
    return { over: false, winner: null, text: this.thinking ? 'The AI is thinking.' : "The AI's move." }
  }

  movableFrom(): Square[] {
    if (!this.humanCanMove()) return []
    const seen = new Set<number>()
    for (const m of this.moves()) seen.add(m.path[0])
    return [...seen].map(toSquare)
  }

  targets(from: Square | null): Square[] {
    const f = toIndex(from)
    if (f < 0 || !this.humanCanMove()) return []
    const seen = new Set<number>()
    for (const m of this.moves()) if (m.path[0] === f) seen.add(m.path[m.path.length - 1])
    return [...seen].map(toSquare)
  }

  play(from: Square | null, to: Square): MoveEvent | null {
    const f = toIndex(from)
    const t = toIndex(to)
    if (f < 0 || t < 0 || !this.humanCanMove()) return null
    // Several jump paths can end on the same square: take the one that captures most.
    let chosen: CMove | null = null
    for (const m of this.moves()) {
      if (m.path[0] !== f || m.path[m.path.length - 1] !== t) continue
      if (!chosen || m.caps.length > chosen.caps.length) chosen = m
    }
    return chosen ? this.apply(chosen) : null
  }

  aiMove(): Promise<MoveEvent | null> {
    if (this.thinking) return this.thinking
    if (this.status().over || this.side !== AI) return Promise.resolve(null)
    const generation = this.generation
    const snapshot = Array.from(this.board)
    const job = this.runner
      .run({ board: snapshot, side: AI, maxDepth: this.opts.depth, budgetMs: this.opts.budgetMs, randomness: this.opts.randomness })
      .catch((): CheckersAIReply => ({ path: null, depth: 0, score: 0, nodes: 0 }))
      .then((reply) => {
        if (generation !== this.generation || this.side !== AI) return null
        const legal = this.moves()
        if (legal.length === 0) return null
        const want = reply.path
        const chosen =
          (want && legal.find((m) => m.path.length === want.length && m.path.every((sq, i) => sq === want[i]))) ??
          // Never stall: if the engine failed, take the longest capture or the first move.
          [...legal].sort((a, b) => b.caps.length - a.caps.length)[0]
        return this.apply(chosen)
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

  private moves(): CMove[] {
    if (!this.cache) this.cache = genMoves(this.board, this.side)
    return this.cache
  }

  private humanCanMove(): boolean {
    return !this.thinking && this.side === HUMAN && !this.status().over
  }

  private apply(m: CMove): MoveEvent {
    const from = m.path[0]
    const to = m.path[m.path.length - 1]
    const isMan = this.board[from] === 1 || this.board[from] === -1
    const id = this.ids[from] ?? `piece-${from}`
    const moved: MoveEvent['moved'] = []
    for (let i = 1; i < m.path.length; i++) moved.push({ id, from: toSquare(m.path[i - 1]), to: toSquare(m.path[i]) })
    const captured: string[] = []
    for (const c of m.caps) {
      const cid = this.ids[c]
      if (cid) captured.push(cid)
      this.ids[c] = null
    }
    this.ids[from] = null
    this.ids[to] = id
    makeMove(this.board, m)
    this.quietPlies = m.caps.length || isMan ? 0 : this.quietPlies + 1
    this.side = -this.side as CSide
    this.cache = null
    const ev: MoveEvent = { moved, captured, placed: [], notation: moveNotation(m) }
    if (m.crown) ev.promoted = { id, kind: 'king' }
    this.last = ev
    return ev
  }
}

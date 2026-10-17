// Chess: rules and notation from chess.js (the referee), stable piece ids
// tracked here, AI from chessAI.ts running in chess.worker.ts.
//
// The human plays White at the bottom: Square {x: 0, y: 0} is a1,
// {x: 7, y: 7} is h8.

import { Chess, type Move as CjsMove, type Square as CjsSquare } from 'chess.js'
import { AIRunner } from './aiRunner'
import { thinkChess, type ChessAIReply, type ChessAIRequest } from './chessAI'
import type { BoardGame, GameStatus, MoveEvent, Piece, Side, Square } from './types'

const FILES = 'abcdefgh'

function toName(s: Square): CjsSquare {
  return (FILES[s.x] + (s.y + 1)) as CjsSquare
}

function toSquare(name: string): Square {
  return { x: name.charCodeAt(0) - 97, y: Number(name[1]) - 1 }
}

function onBoard(s: Square | null): s is Square {
  return !!s && Number.isInteger(s.x) && Number.isInteger(s.y) && s.x >= 0 && s.x < 8 && s.y >= 0 && s.y < 8
}

function positionKey(fen: string): string {
  return fen.split(' ').slice(0, 3).join(' ')
}

const spawnWorker = () => new Worker(new URL('./chess.worker.ts', import.meta.url), { type: 'module' })

export interface ChessOptions {
  /** Search depth (default 3). */
  depth?: number
  /** Think budget in ms (default 600). */
  budgetMs?: number
  /** Root moves within this many centipawns of the best are chosen at random (default 15). */
  randomness?: number
}

export class ChessGame implements BoardGame {
  readonly id = 'chess' as const
  readonly size = 8

  private chess = new Chess()
  /** square name -> stable piece id */
  private ids = new Map<string, string>()
  private keys: string[] = []
  private promotions = 0
  private last: MoveEvent | null = null
  private generation = 0
  private thinking: Promise<MoveEvent | null> | null = null
  private readonly runner = new AIRunner<ChessAIRequest, ChessAIReply>(spawnWorker, thinkChess)
  private readonly opts: Required<ChessOptions>

  constructor(opts: ChessOptions = {}) {
    this.opts = { depth: opts.depth ?? 3, budgetMs: opts.budgetMs ?? 600, randomness: opts.randomness ?? 15 }
    this.reset()
  }

  reset(): void {
    this.generation++
    this.thinking = null
    this.chess.reset()
    this.ids.clear()
    for (const row of this.chess.board()) {
      for (const cell of row) {
        if (cell) this.ids.set(cell.square, `${cell.color}-${cell.type}-${cell.square}`)
      }
    }
    this.keys = [positionKey(this.chess.fen())]
    this.promotions = 0
    this.last = null
  }

  /** Current FEN (handy for debugging and tests). */
  fen(): string {
    return this.chess.fen()
  }

  pieces(): Piece[] {
    const out: Piece[] = []
    for (const [square, id] of this.ids) {
      const p = this.chess.get(square as CjsSquare)
      if (!p) continue
      out.push({ id, kind: p.type, owner: p.color === 'w' ? 'human' : 'ai', at: toSquare(square) })
    }
    return out
  }

  turn(): Side {
    return this.chess.turn() === 'w' ? 'human' : 'ai'
  }

  status(): GameStatus {
    const c = this.chess
    if (c.isCheckmate()) {
      const winner: Side = this.turn() === 'human' ? 'ai' : 'human'
      return { over: true, winner, text: winner === 'human' ? 'Checkmate. You win!' : 'Checkmate. The AI wins.' }
    }
    if (c.isStalemate()) return { over: true, winner: 'draw', text: 'Stalemate. It is a draw.' }
    if (c.isInsufficientMaterial()) return { over: true, winner: 'draw', text: 'Draw by insufficient material.' }
    if (c.isThreefoldRepetition()) return { over: true, winner: 'draw', text: 'Draw by threefold repetition.' }
    if (c.isDrawByFiftyMoves()) return { over: true, winner: 'draw', text: 'Draw by the 50-move rule.' }
    const check = c.inCheck()
    if (this.turn() === 'human') return { over: false, winner: null, text: check ? 'Check. Your move.' : 'Your move' }
    const ai = this.thinking ? 'The AI is thinking.' : "The AI's move."
    return { over: false, winner: null, text: check ? `Check. ${ai}` : ai }
  }

  movableFrom(): Square[] {
    if (!this.humanCanMove()) return []
    const seen = new Set<string>()
    for (const m of this.chess.moves({ verbose: true })) seen.add(m.from)
    return [...seen].map(toSquare)
  }

  targets(from: Square | null): Square[] {
    if (!onBoard(from) || !this.humanCanMove()) return []
    const seen = new Set<string>()
    for (const m of this.chess.moves({ square: toName(from), verbose: true })) seen.add(m.to)
    return [...seen].map(toSquare)
  }

  play(from: Square | null, to: Square): MoveEvent | null {
    if (!onBoard(from) || !onBoard(to) || !this.humanCanMove()) return null
    const f = toName(from)
    const t = toName(to)
    const legal = this.chess.moves({ square: f, verbose: true }).filter((m) => m.to === t)
    if (legal.length === 0) return null
    const promotion = legal.some((m) => m.promotion) ? 'q' : undefined
    return this.apply({ from: f, to: t, promotion })
  }

  aiMove(): Promise<MoveEvent | null> {
    if (this.thinking) return this.thinking
    if (this.status().over || this.turn() !== 'ai') return Promise.resolve(null)
    const generation = this.generation
    const fen = this.chess.fen()
    const job = this.runner
      .run({ fen, history: [...this.keys], maxDepth: this.opts.depth, budgetMs: this.opts.budgetMs, randomness: this.opts.randomness })
      .catch((): ChessAIReply => ({ move: null, depth: 0, score: 0, nodes: 0 }))
      .then((reply) => {
        if (generation !== this.generation || this.chess.fen() !== fen) return null
        const legal = this.chess.moves({ verbose: true })
        if (legal.length === 0) return null
        const want = reply.move
        const chosen =
          (want && legal.find((m) => m.from === want.from && m.to === want.to && (m.promotion ?? undefined) === want.promotion)) ??
          // Never stall and never play an illegal move: if the engine failed,
          // fall back to the most valuable capture, else the first legal move.
          [...legal].sort((a, b) => captureValue(b) - captureValue(a))[0]
        return this.apply({ from: chosen.from, to: chosen.to, promotion: chosen.promotion })
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

  /** Terminates the worker. The game stays usable (a new worker is created on demand). */
  dispose(): void {
    this.runner.dispose()
  }

  private humanCanMove(): boolean {
    return !this.thinking && this.turn() === 'human' && !this.chess.isGameOver()
  }

  private apply(input: { from: string; to: string; promotion?: string }): MoveEvent | null {
    let m: CjsMove
    try {
      m = this.chess.move(input)
    } catch {
      return null
    }
    const ev = this.trackIds(m)
    this.keys.push(positionKey(this.chess.fen()))
    this.last = ev
    return ev
  }

  /** Moves the stable ids the same way chess.js just moved the pieces. */
  private trackIds(m: CjsMove): MoveEvent {
    const ids = this.ids
    const id = ids.get(m.from) ?? `${m.color}-${m.piece}-${m.from}`
    const moved: MoveEvent['moved'] = [{ id, from: toSquare(m.from), to: toSquare(m.to) }]
    const captured: string[] = []
    const placed: Piece[] = []
    if (m.isEnPassant()) {
      const victimSq = m.to[0] + m.from[1]
      const victim = ids.get(victimSq)
      if (victim) captured.push(victim)
      ids.delete(victimSq)
    } else if (m.captured) {
      const victim = ids.get(m.to)
      if (victim) captured.push(victim)
    }
    ids.delete(m.from)
    ids.set(m.to, id)
    if (m.isKingsideCastle() || m.isQueensideCastle()) {
      const rank = m.from[1]
      const rookFrom = (m.isKingsideCastle() ? 'h' : 'a') + rank
      const rookTo = (m.isKingsideCastle() ? 'f' : 'd') + rank
      const rookId = ids.get(rookFrom) ?? `${m.color}-r-${rookFrom}`
      ids.delete(rookFrom)
      ids.set(rookTo, rookId)
      moved.push({ id: rookId, from: toSquare(rookFrom), to: toSquare(rookTo) })
    }
    if (m.promotion) {
      captured.push(id)
      const newId = `${m.color}-${m.promotion}-promo${++this.promotions}`
      ids.set(m.to, newId)
      placed.push({ id: newId, kind: m.promotion, owner: m.color === 'w' ? 'human' : 'ai', at: toSquare(m.to) })
    }
    return { moved, captured, placed, notation: m.san }
  }
}

const PIECE_VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }

function captureValue(m: CjsMove): number {
  return (m.captured ? PIECE_VALUE[m.captured] : 0) + (m.promotion ? PIECE_VALUE[m.promotion] : 0)
}

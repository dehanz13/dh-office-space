// Chess search used by chess.worker.ts (and by the chunked fallback).
//
// It has its own small 0x88 move generator so the worker does not need
// chess.js: chess.js is the referee on the main thread, this is only the
// player. The main thread checks every move this returns against chess.js
// before applying it, so a bug here can cost strength but never legality.
//
// Search: negamax alpha-beta, MVV-LVA + killer ordering, a short capture-only
// quiescence search, iterative deepening to depth 3 inside a time budget.
// Evaluation: material + piece-square tables (generated from simple formulas
// below, not copied from anywhere) + bishop pair + a mop-up term so the AI
// can actually finish a won endgame.

export interface ChessAIRequest {
  fen: string
  /** Position keys (first 3 FEN fields) that have already occurred, current one included. */
  history: string[]
  maxDepth: number
  budgetMs: number
  /** Root moves within this many centipawns of the best are picked at random. */
  randomness: number
}

export interface ChessAIReply {
  move: { from: string; to: string; promotion?: 'q' | 'r' | 'b' | 'n' } | null
  depth: number
  score: number
  nodes: number
}

const PAWN = 1
const KNIGHT = 2
const BISHOP = 3
const ROOK = 4
const QUEEN = 5
const KING = 6
const WHITE = 0
const BLACK = 8

const F_CAPTURE = 1
const F_EP = 2
const F_CASTLE = 4
const F_DOUBLE = 8

const INF = 1_000_000
const MATE = 100_000
const MAX_PLY = 64
const QS_MAX = 4

const VALUE = [0, 100, 320, 330, 500, 900, 0]
const PHASE = [0, 0, 1, 1, 2, 4, 0]
const PIECE_CHARS = ' PNBRQK  pnbrqk'
const PROMO_CHARS = ['', '', 'n', 'b', 'r', 'q'] as const

const KNIGHT_OFF = [33, 31, 18, 14, -33, -31, -18, -14]
const KING_OFF = [1, -1, 16, -16, 15, 17, -15, -17]
const BISHOP_OFF = [15, 17, -15, -17]
const ROOK_OFF = [1, -1, 16, -16]

const SQ64: number[] = []
for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) SQ64.push(r * 16 + f)

const CASTLE_MASK = new Int8Array(128).fill(15)
CASTLE_MASK[0x00] = 15 & ~2 // a1
CASTLE_MASK[0x04] = 15 & ~3 // e1
CASTLE_MASK[0x07] = 15 & ~1 // h1
CASTLE_MASK[0x70] = 15 & ~8 // a8
CASTLE_MASK[0x74] = 15 & ~12 // e8
CASTLE_MASK[0x77] = 15 & ~4 // h8

// Piece-square tables, from White's point of view, indexed by 0x88 square.
const PST: Int16Array[] = []
const KING_MG = new Int16Array(128)
const KING_EG = new Int16Array(128)
;(function buildTables() {
  for (let t = 0; t <= KING; t++) PST.push(new Int16Array(128))
  const pawnRank = [0, 0, 4, 8, 16, 28, 50, 0]
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const sq = r * 16 + f
      const cd = Math.max(Math.abs(f - 3.5), Math.abs(r - 3.5)) // 0.5 (centre) .. 3.5 (edge)
      const central = f === 3 || f === 4
      const nearCentral = f === 2 || f === 5
      // Pawns: advance, take the centre, keep the castled king's shelter.
      let p = pawnRank[r]
      if ((r === 3 || r === 4) && central) p += 12
      if ((r === 3 || r === 4) && nearCentral) p += 5
      if (r === 1 && central) p -= 10
      if (r === 1 && f >= 5) p += 5
      PST[PAWN][sq] = p
      // Knights love the centre and hate the rim; leave the back rank.
      PST[KNIGHT][sq] = Math.round(28 - 14 * cd) - (r === 0 ? 10 : 0)
      PST[BISHOP][sq] = Math.round(14 - 7 * cd) - (r === 0 ? 8 : 0)
      PST[ROOK][sq] = (r === 6 ? 20 : 0) + (central ? 5 : 0) - (f === 0 || f === 7 ? 3 : 0)
      PST[QUEEN][sq] = Math.round(6 - 3 * cd)
      // King: tucked away while there is material, central in the endgame.
      let k: number
      if (r === 0) k = f === 6 ? 20 : f === 1 || f === 2 || f === 7 ? 12 : f === 0 ? 5 : f === 4 ? 0 : -5
      else if (r === 1) k = -10
      else k = -30 - 10 * (r - 2)
      KING_MG[sq] = k
      KING_EG[sq] = Math.round(20 - 12 * cd)
    }
  }
})()

function sqName(sq: number): string {
  return 'abcdefgh'[sq & 7] + ((sq >> 4) + 1)
}

function moveUci(m: number): string {
  const promo = (m >> 14) & 7
  return sqName(m & 127) + sqName((m >> 7) & 127) + (promo ? PROMO_CHARS[promo] : '')
}

export class ChessEngine {
  board = new Int8Array(128)
  side = WHITE
  castle = 0
  ep = -1
  kings = [0, 0]
  nodes = 0
  deadline = Infinity
  stopped = false

  private ply = 0
  private undoMove = new Int32Array(1024)
  private undoCap = new Int8Array(1024)
  private undoCastle = new Int8Array(1024)
  private undoEp = new Int16Array(1024)
  private moveBuf: number[][] = []
  private scoreBuf: number[][] = []
  private killers = new Int32Array(MAX_PLY * 2)

  constructor() {
    for (let i = 0; i < MAX_PLY + QS_MAX + 2; i++) {
      this.moveBuf.push([])
      this.scoreBuf.push([])
    }
  }

  load(fen: string): void {
    const parts = fen.trim().split(/\s+/)
    this.board.fill(0)
    const rows = parts[0].split('/')
    for (let i = 0; i < 8; i++) {
      const r = 7 - i
      let f = 0
      for (const ch of rows[i]) {
        if (ch >= '1' && ch <= '8') {
          f += Number(ch)
          continue
        }
        const code = PIECE_CHARS.indexOf(ch)
        const sq = r * 16 + f
        this.board[sq] = code
        if ((code & 7) === KING) this.kings[code >> 3] = sq
        f++
      }
    }
    this.side = parts[1] === 'b' ? BLACK : WHITE
    const c = parts[2] ?? '-'
    this.castle = (c.includes('K') ? 1 : 0) | (c.includes('Q') ? 2 : 0) | (c.includes('k') ? 4 : 0) | (c.includes('q') ? 8 : 0)
    const ep = parts[3] ?? '-'
    this.ep = ep === '-' ? -1 : (Number(ep[1]) - 1) * 16 + (ep.charCodeAt(0) - 97)
    this.ply = 0
  }

  /** Board, side and castling rights, formatted like the first 3 FEN fields. */
  key(): string {
    let s = ''
    for (let r = 7; r >= 0; r--) {
      let empty = 0
      for (let f = 0; f < 8; f++) {
        const p = this.board[r * 16 + f]
        if (!p) {
          empty++
          continue
        }
        if (empty) s += empty
        empty = 0
        s += PIECE_CHARS[p]
      }
      if (empty) s += empty
      if (r) s += '/'
    }
    const c = this.castle
    const cs = (c & 1 ? 'K' : '') + (c & 2 ? 'Q' : '') + (c & 4 ? 'k' : '') + (c & 8 ? 'q' : '')
    return s + ' ' + (this.side === WHITE ? 'w' : 'b') + ' ' + (cs || '-')
  }

  attacked(sq: number, by: number): boolean {
    const b = this.board
    if (by === WHITE) {
      if (!((sq - 15) & 0x88) && b[sq - 15] === PAWN) return true
      if (!((sq - 17) & 0x88) && b[sq - 17] === PAWN) return true
    } else {
      if (!((sq + 15) & 0x88) && b[sq + 15] === (BLACK | PAWN)) return true
      if (!((sq + 17) & 0x88) && b[sq + 17] === (BLACK | PAWN)) return true
    }
    for (let i = 0; i < 8; i++) {
      const n = sq + KNIGHT_OFF[i]
      if (!(n & 0x88) && b[n] === (by | KNIGHT)) return true
      const k = sq + KING_OFF[i]
      if (!(k & 0x88) && b[k] === (by | KING)) return true
    }
    for (let i = 0; i < 4; i++) {
      const d = BISHOP_OFF[i]
      let t = sq + d
      while (!(t & 0x88)) {
        const p = b[t]
        if (p) {
          if (p === (by | BISHOP) || p === (by | QUEEN)) return true
          break
        }
        t += d
      }
    }
    for (let i = 0; i < 4; i++) {
      const d = ROOK_OFF[i]
      let t = sq + d
      while (!(t & 0x88)) {
        const p = b[t]
        if (p) {
          if (p === (by | ROOK) || p === (by | QUEEN)) return true
          break
        }
        t += d
      }
    }
    return false
  }

  inCheck(): boolean {
    return this.attacked(this.kings[this.side >> 3], this.side ^ 8)
  }

  private addPromos(list: number[], from: number, to: number, flags: number, all: boolean): void {
    const base = from | (to << 7) | (flags << 17)
    list.push(base | (QUEEN << 14))
    if (all) list.push(base | (KNIGHT << 14), base | (ROOK << 14), base | (BISHOP << 14))
  }

  /** Pseudo-legal moves. all=false: captures and queen promotions only. */
  gen(list: number[], all: boolean): void {
    list.length = 0
    const b = this.board
    const us = this.side
    const them = us ^ 8
    for (let i = 0; i < 64; i++) {
      const from = SQ64[i]
      const p = b[from]
      if (!p || (p & 8) !== us) continue
      const t = p & 7
      if (t === PAWN) {
        const dir = us === WHITE ? 16 : -16
        const r = from >> 4
        const lastBut = us === WHITE ? 6 : 1
        const start = us === WHITE ? 1 : 6
        const one = from + dir
        if (b[one] === 0) {
          if (r === lastBut) this.addPromos(list, from, one, 0, all)
          else if (all) {
            list.push(from | (one << 7))
            if (r === start && b[one + dir] === 0) list.push(from | ((one + dir) << 7) | (F_DOUBLE << 17))
          }
        }
        for (let k = -1; k <= 1; k += 2) {
          const to = one + k
          if (to & 0x88) continue
          const q = b[to]
          if (q && (q & 8) === them) {
            if (r === lastBut) this.addPromos(list, from, to, F_CAPTURE, all)
            else list.push(from | (to << 7) | (F_CAPTURE << 17))
          } else if (to === this.ep && q === 0) {
            list.push(from | (to << 7) | ((F_CAPTURE | F_EP) << 17))
          }
        }
      } else if (t === KNIGHT || t === KING) {
        const offs = t === KNIGHT ? KNIGHT_OFF : KING_OFF
        for (let k = 0; k < 8; k++) {
          const to = from + offs[k]
          if (to & 0x88) continue
          const q = b[to]
          if (q === 0) {
            if (all) list.push(from | (to << 7))
          } else if ((q & 8) === them) list.push(from | (to << 7) | (F_CAPTURE << 17))
        }
      } else {
        const offs = t === BISHOP ? BISHOP_OFF : t === ROOK ? ROOK_OFF : KING_OFF
        for (let k = 0; k < offs.length; k++) {
          const d = offs[k]
          let to = from + d
          while (!(to & 0x88)) {
            const q = b[to]
            if (q === 0) {
              if (all) list.push(from | (to << 7))
            } else {
              if ((q & 8) === them) list.push(from | (to << 7) | (F_CAPTURE << 17))
              break
            }
            to += d
          }
        }
      }
    }
    if (!all) return
    // Castling. Squares the king passes must be empty and not attacked.
    const c = this.castle
    if (us === WHITE) {
      if (b[0x04] === KING) {
        if (c & 1 && b[0x05] === 0 && b[0x06] === 0 && b[0x07] === ROOK &&
          !this.attacked(0x04, them) && !this.attacked(0x05, them) && !this.attacked(0x06, them)) {
          list.push(0x04 | (0x06 << 7) | (F_CASTLE << 17))
        }
        if (c & 2 && b[0x03] === 0 && b[0x02] === 0 && b[0x01] === 0 && b[0x00] === ROOK &&
          !this.attacked(0x04, them) && !this.attacked(0x03, them) && !this.attacked(0x02, them)) {
          list.push(0x04 | (0x02 << 7) | (F_CASTLE << 17))
        }
      }
    } else if (b[0x74] === (BLACK | KING)) {
      if (c & 4 && b[0x75] === 0 && b[0x76] === 0 && b[0x77] === (BLACK | ROOK) &&
        !this.attacked(0x74, them) && !this.attacked(0x75, them) && !this.attacked(0x76, them)) {
        list.push(0x74 | (0x76 << 7) | (F_CASTLE << 17))
      }
      if (c & 8 && b[0x73] === 0 && b[0x72] === 0 && b[0x71] === 0 && b[0x70] === (BLACK | ROOK) &&
        !this.attacked(0x74, them) && !this.attacked(0x73, them) && !this.attacked(0x72, them)) {
        list.push(0x74 | (0x72 << 7) | (F_CASTLE << 17))
      }
    }
  }

  /** Makes the move; returns false (and leaves the board unchanged) if it leaves the mover in check. */
  make(m: number): boolean {
    const b = this.board
    const from = m & 127
    const to = (m >> 7) & 127
    const promo = (m >> 14) & 7
    const flags = m >> 17
    const piece = b[from]
    const us = this.side
    const ply = this.ply++
    this.undoMove[ply] = m
    this.undoCap[ply] = b[to]
    this.undoCastle[ply] = this.castle
    this.undoEp[ply] = this.ep
    b[to] = promo ? us | promo : piece
    b[from] = 0
    if (flags & F_EP) {
      const capSq = us === WHITE ? to - 16 : to + 16
      this.undoCap[ply] = b[capSq]
      b[capSq] = 0
    } else if (flags & F_CASTLE) {
      if (to === from + 2) {
        b[from + 1] = b[from + 3]
        b[from + 3] = 0
      } else {
        b[from - 1] = b[from - 4]
        b[from - 4] = 0
      }
    }
    if ((piece & 7) === KING) this.kings[us >> 3] = to
    this.castle &= CASTLE_MASK[from] & CASTLE_MASK[to]
    this.ep = flags & F_DOUBLE ? (from + to) >> 1 : -1
    this.side = us ^ 8
    if (this.attacked(this.kings[us >> 3], us ^ 8)) {
      this.unmake()
      return false
    }
    return true
  }

  unmake(): void {
    const b = this.board
    const ply = --this.ply
    const m = this.undoMove[ply]
    const from = m & 127
    const to = (m >> 7) & 127
    const promo = (m >> 14) & 7
    const flags = m >> 17
    const us = (this.side ^= 8)
    const moved = promo ? us | PAWN : b[to]
    b[from] = moved
    if (flags & F_EP) {
      b[to] = 0
      b[us === WHITE ? to - 16 : to + 16] = this.undoCap[ply]
    } else {
      b[to] = this.undoCap[ply]
      if (flags & F_CASTLE) {
        if (to === from + 2) {
          b[from + 3] = b[from + 1]
          b[from + 1] = 0
        } else {
          b[from - 4] = b[from - 1]
          b[from - 1] = 0
        }
      }
    }
    if ((moved & 7) === KING) this.kings[us >> 3] = from
    this.castle = this.undoCastle[ply]
    this.ep = this.undoEp[ply]
  }

  /** Legal moves in this position (all promotions included). */
  legalMoves(): number[] {
    const list: number[] = []
    this.gen(list, true)
    return list.filter((m) => {
      if (!this.make(m)) return false
      this.unmake()
      return true
    })
  }

  /** Static evaluation from the side to move's point of view, in centipawns. */
  evaluate(): number {
    const b = this.board
    let score = 0
    let phase = 0
    let wBishops = 0
    let bBishops = 0
    let wk = 0
    let bk = 0
    for (let i = 0; i < 64; i++) {
      const sq = SQ64[i]
      const p = b[sq]
      if (!p) continue
      const t = p & 7
      if (p & 8) {
        const m = sq ^ 0x70
        if (t === KING) bk = m
        else {
          score -= VALUE[t] + PST[t][m]
          phase += PHASE[t]
          if (t === BISHOP) bBishops++
        }
      } else if (t === KING) wk = sq
      else {
        score += VALUE[t] + PST[t][sq]
        phase += PHASE[t]
        if (t === BISHOP) wBishops++
      }
    }
    if (phase > 24) phase = 24
    score += ((KING_MG[wk] - KING_MG[bk]) * phase + (KING_EG[wk] - KING_EG[bk]) * (24 - phase)) / 24
    if (wBishops >= 2) score += 30
    if (bBishops >= 2) score -= 30
    // Keeping the right to castle is worth a little while there is material.
    const c = this.castle
    score += (((c & 1) + ((c >> 1) & 1) - ((c >> 2) & 1) - ((c >> 3) & 1)) * 6 * phase) / 24
    // Mop-up: with little material left, the stronger side drives the lone
    // king to the edge and brings its own king closer.
    if (phase <= 8 && Math.abs(score) > 300) {
      const bkReal = bk ^ 0x70
      const winnerKing = score > 0 ? wk : bkReal
      const loserKing = score > 0 ? bkReal : wk
      const lf = loserKing & 7
      const lr = loserKing >> 4
      const edge = Math.abs(lf - 3.5) + Math.abs(lr - 3.5)
      const dist = Math.abs(lf - (winnerKing & 7)) + Math.abs(lr - (winnerKing >> 4))
      const mop = Math.round(10 * edge + 4 * (14 - dist))
      score += score > 0 ? mop : -mop
    }
    return this.side === WHITE ? score : -score
  }

  private orderScore(m: number, ply: number): number {
    const flags = m >> 17
    const promo = (m >> 14) & 7
    if (flags & F_CAPTURE) {
      const victim = flags & F_EP ? PAWN : this.board[(m >> 7) & 127] & 7
      const attacker = this.board[m & 127] & 7
      return 1_000_000 + VALUE[victim] * 10 - VALUE[attacker] + (promo ? VALUE[promo] : 0)
    }
    if (promo) return 900_000 + VALUE[promo]
    if (ply < MAX_PLY) {
      if (m === this.killers[ply * 2]) return 800_000
      if (m === this.killers[ply * 2 + 1]) return 700_000
    }
    return 0
  }

  private scoreMoves(list: number[], scores: number[], ply: number): void {
    scores.length = list.length
    for (let i = 0; i < list.length; i++) scores[i] = this.orderScore(list[i], ply)
  }

  /** Swaps the best remaining move into slot i (selection sort, one step at a time). */
  private pick(list: number[], scores: number[], i: number): number {
    let best = i
    for (let j = i + 1; j < list.length; j++) if (scores[j] > scores[best]) best = j
    if (best !== i) {
      const m = list[i]
      list[i] = list[best]
      list[best] = m
      const s = scores[i]
      scores[i] = scores[best]
      scores[best] = s
    }
    return list[i]
  }

  private tick(): void {
    if ((++this.nodes & 2047) === 0 && performance.now() > this.deadline) this.stopped = true
  }

  quiesce(alpha: number, beta: number, qply: number, ply: number): number {
    this.tick()
    const stand = this.evaluate()
    if (stand >= beta) return stand
    if (stand > alpha) alpha = stand
    if (qply >= QS_MAX || this.stopped) return stand
    const list = this.moveBuf[ply]
    const scores = this.scoreBuf[ply]
    this.gen(list, false)
    this.scoreMoves(list, scores, MAX_PLY)
    for (let i = 0; i < list.length; i++) {
      const m = this.pick(list, scores, i)
      if (!this.make(m)) continue
      const s = -this.quiesce(-beta, -alpha, qply + 1, ply + 1)
      this.unmake()
      if (this.stopped) return 0
      if (s >= beta) return s
      if (s > alpha) alpha = s
    }
    return alpha
  }

  negamax(depth: number, alpha: number, beta: number, ply: number): number {
    if (depth <= 0) return this.quiesce(alpha, beta, 0, ply)
    this.tick()
    if (this.stopped) return 0
    const list = this.moveBuf[ply]
    const scores = this.scoreBuf[ply]
    this.gen(list, true)
    this.scoreMoves(list, scores, ply)
    let legal = 0
    let best = -INF
    for (let i = 0; i < list.length; i++) {
      const m = this.pick(list, scores, i)
      if (!this.make(m)) continue
      legal++
      const s = -this.negamax(depth - 1, -beta, -alpha, ply + 1)
      this.unmake()
      if (this.stopped) return 0
      if (s > best) best = s
      if (s > alpha) alpha = s
      if (alpha >= beta) {
        if (!((m >> 17) & F_CAPTURE) && ply < MAX_PLY && this.killers[ply * 2] !== m) {
          this.killers[ply * 2 + 1] = this.killers[ply * 2]
          this.killers[ply * 2] = m
        }
        break
      }
    }
    if (legal === 0) return this.inCheck() ? -MATE + ply : 0
    return best
  }
}

/** For tests: every legal move in UCI form, mapped to the position key after it. */
export function legalMoveKeys(fen: string): Map<string, string> {
  const e = new ChessEngine()
  e.load(fen)
  const out = new Map<string, string>()
  for (const m of e.legalMoves()) {
    e.make(m)
    out.set(moveUci(m), e.key())
    e.unmake()
  }
  return out
}

function toReply(m: number, depth: number, score: number, nodes: number): ChessAIReply {
  const promo = (m >> 14) & 7
  return {
    move: {
      from: sqName(m & 127),
      to: sqName((m >> 7) & 127),
      ...(promo ? { promotion: PROMO_CHARS[promo] as 'q' | 'r' | 'b' | 'n' } : {}),
    },
    depth,
    score,
    nodes,
  }
}

export function* thinkChess(req: ChessAIRequest): Generator<void, ChessAIReply, void> {
  const e = new ChessEngine()
  e.load(req.fen)
  const deadline = performance.now() + req.budgetMs
  const root = e.legalMoves()
  if (root.length === 0) return { move: null, depth: 0, score: 0, nodes: 0 }
  if (root.length === 1) return toReply(root[0], 0, 0, 0)

  // A root move that recreates a position seen before is scored as a draw:
  // the AI avoids repetition when it is ahead and welcomes it when behind.
  const seen = new Set(req.history)
  const repeats = root.map((m) => {
    e.make(m)
    const k = e.key()
    e.unmake()
    return seen.has(k)
  })

  // Captures first for the first iteration; later iterations use the previous scores.
  let order = root.map((_, i) => i)
  const firstGuess = root.map((m) => ((m >> 17) & F_CAPTURE ? 1 : 0) * (VALUE[e.board[(m >> 7) & 127] & 7] + 1))
  order.sort((a, b) => firstGuess[b] - firstGuess[a])

  const margin = Math.max(0, req.randomness)
  let done: { scores: number[]; best: number; depth: number } | null = null

  for (let depth = 1; depth <= req.maxDepth; depth++) {
    e.deadline = depth === 1 ? Infinity : deadline
    const scores = new Array<number>(root.length).fill(-INF)
    let best = -INF
    let complete = true
    for (const idx of order) {
      let s: number
      if (repeats[idx]) s = 0
      else {
        e.make(root[idx])
        // Window lowered by `margin` + 1 so every move scoring >= best - margin
        // gets an exact score; weaker moves only return an upper bound below that.
        s = -e.negamax(depth - 1, -INF, -(best - margin - 1), 1)
        e.unmake()
      }
      if (e.stopped) {
        complete = false
        break
      }
      scores[idx] = s
      if (s > best) best = s
      yield
    }
    if (!complete) break
    done = { scores, best, depth }
    order = [...order].sort((a, b) => scores[b] - scores[a])
    if (Math.abs(best) > MATE - 1000) break
    if (performance.now() > deadline) break
  }

  if (!done) return toReply(root[order[0]], 0, 0, e.nodes)
  const { scores, best, depth } = done
  const window = Math.abs(best) > MATE - 1000 ? 0 : margin
  const candidates = order.filter((i) => scores[i] >= best - window)
  const pick = candidates[Math.floor(Math.random() * candidates.length)] ?? order[0]
  return toReply(root[pick], depth, scores[pick], e.nodes)
}

// American / English draughts: rules and AI search. Pure functions over a
// 64-cell board, shared by checkers.ts (main thread) and checkers.worker.ts.
//
// Board: index = y * 8 + x, y = 0 is the human's back row. Only dark squares
// ((x + y) even, so the human's bottom-left corner is playable) hold pieces.
// Cell values: 1 human man, 2 human king, -1 AI man, -2 AI king, 0 empty.
// The human (side 1) moves first and moves up (+y); the AI (side -1) moves down.

export type CSide = 1 | -1

export interface CMove {
  /** Squares visited, start first. A simple move has 2 entries; a multi-jump has one per hop + 1. */
  path: number[]
  /** Squares of the jumped pieces, in jump order. */
  caps: number[]
  /** A man reached the far row (which also ends the move). */
  crown: boolean
}

const DIRS: [number, number][] = [[1, 1], [-1, 1], [1, -1], [-1, -1]]

export function initialBoard(): Int8Array {
  const b = new Int8Array(64)
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      if ((x + y) % 2 !== 0) continue
      if (y <= 2) b[y * 8 + x] = 1
      else if (y >= 5) b[y * 8 + x] = -1
    }
  }
  return b
}

function crownRow(s: CSide): number {
  return s === 1 ? 7 : 0
}

function jumpDfs(b: Int8Array, sq: number, piece: number, s: CSide, path: number[], caps: number[], out: CMove[]): void {
  const king = piece === 2 || piece === -2
  const x = sq & 7
  const y = sq >> 3
  let extended = false
  for (const [dx, dy] of DIRS) {
    if (!king && dy !== s) continue
    const lx = x + 2 * dx
    const ly = y + 2 * dy
    if (lx < 0 || lx > 7 || ly < 0 || ly > 7) continue
    const mid = (y + dy) * 8 + (x + dx)
    const land = ly * 8 + lx
    // Jumped pieces stay on the board until the move ends: they cannot be
    // jumped twice and they block landing squares.
    if (b[mid] * s >= 0 || b[land] !== 0 || caps.includes(mid)) continue
    extended = true
    path.push(land)
    caps.push(mid)
    if (!king && ly === crownRow(s)) out.push({ path: path.slice(), caps: caps.slice(), crown: true })
    else jumpDfs(b, land, piece, s, path, caps, out)
    path.pop()
    caps.pop()
  }
  if (!extended && caps.length > 0) out.push({ path: path.slice(), caps: caps.slice(), crown: false })
}

/** All legal moves for side s. Captures are mandatory, and multi-jumps run to completion. */
export function genMoves(b: Int8Array, s: CSide): CMove[] {
  const jumps: CMove[] = []
  for (let sq = 0; sq < 64; sq++) {
    const p = b[sq]
    if (p * s <= 0) continue
    b[sq] = 0 // lift the piece so a king may pass back over its start square
    jumpDfs(b, sq, p, s, [sq], [], jumps)
    b[sq] = p
  }
  if (jumps.length) return jumps
  const moves: CMove[] = []
  for (let sq = 0; sq < 64; sq++) {
    const p = b[sq]
    if (p * s <= 0) continue
    const king = p === 2 || p === -2
    const x = sq & 7
    const y = sq >> 3
    for (const [dx, dy] of DIRS) {
      if (!king && dy !== s) continue
      const tx = x + dx
      const ty = y + dy
      if (tx < 0 || tx > 7 || ty < 0 || ty > 7) continue
      const to = ty * 8 + tx
      if (b[to] !== 0) continue
      moves.push({ path: [sq, to], caps: [], crown: !king && ty === crownRow(s) })
    }
  }
  return moves
}

/** Applies a move in place; returns what unmake needs. */
export function makeMove(b: Int8Array, m: CMove): number[] {
  const from = m.path[0]
  const to = m.path[m.path.length - 1]
  const piece = b[from]
  const saved = [piece]
  for (const c of m.caps) saved.push(b[c])
  b[from] = 0
  for (const c of m.caps) b[c] = 0
  b[to] = m.crown ? piece * 2 : piece
  return saved
}

export function unmakeMove(b: Int8Array, m: CMove, saved: number[]): void {
  const from = m.path[0]
  const to = m.path[m.path.length - 1]
  b[to] = 0
  b[from] = saved[0]
  for (let i = 0; i < m.caps.length; i++) b[m.caps[i]] = saved[i + 1]
}

/** Standard 1..32 square number; square 1 is on the human's back row, at the human's right. */
export function squareNumber(sq: number): number {
  const x = sq & 7
  const y = sq >> 3
  return y * 4 + ((7 - x) >> 1) + 1
}

export function moveNotation(m: CMove): string {
  const nums = m.path.map(squareNumber)
  return m.caps.length ? nums.join('x') : `${nums[0]}-${nums[1]}`
}

// ---------------------------------------------------------------- AI

export interface CheckersAIRequest {
  board: number[]
  side: CSide
  maxDepth: number
  budgetMs: number
  /** Root moves within this many points (a man = 100) of the best are picked at random. */
  randomness: number
}

export interface CheckersAIReply {
  path: number[] | null
  depth: number
  score: number
  nodes: number
}

const WIN = 100_000
const MAX_PLY = 40

/** Static evaluation from side s's point of view. Man 100, king 160, plus advancement and centre. */
export function evaluate(b: Int8Array, s: CSide): number {
  let score = 0
  let hm = 0
  let hk = 0
  let am = 0
  let ak = 0
  for (let sq = 0; sq < 64; sq++) {
    const p = b[sq]
    if (!p) continue
    const x = sq & 7
    const y = sq >> 3
    const centre = x >= 2 && x <= 5 && y >= 2 && y <= 5 ? 1 : 0
    if (p === 1) {
      score += 100 + y * 3 + centre * 6 + (y === 0 ? 6 : 0)
      hm++
    } else if (p === 2) {
      score += 160 + centre * 10
      hk++
    } else if (p === -1) {
      score -= 100 + (7 - y) * 3 + centre * 6 + (y === 7 ? 6 : 0)
      am++
    } else {
      score -= 160 + centre * 10
      ak++
    }
  }
  const matH = hm * 100 + hk * 160
  const matA = am * 100 + ak * 160
  const total = hm + hk + am + ak
  if (matH !== matA) {
    // When ahead, trading down is good; and the stronger side's kings hunt.
    const ahead: CSide = matH > matA ? 1 : -1
    score += ahead * (24 - total) * 3
    if (total <= 10) {
      let hunt = 0
      for (let sq = 0; sq < 64; sq++) {
        if (b[sq] !== ahead * 2) continue
        let best = 8
        for (let t = 0; t < 64; t++) {
          if (b[t] * ahead >= 0) continue
          const d = Math.max(Math.abs((sq & 7) - (t & 7)), Math.abs((sq >> 3) - (t >> 3)))
          if (d < best) best = d
        }
        hunt += 8 - best
      }
      score += ahead * hunt * 2
    }
  }
  return score * s
}

class Searcher {
  nodes = 0
  stopped = false
  deadline = Infinity
  private readonly b: Int8Array

  constructor(b: Int8Array) {
    this.b = b
  }

  search(s: CSide, depth: number, alpha: number, beta: number, ply: number): number {
    if ((++this.nodes & 1023) === 0 && performance.now() > this.deadline) this.stopped = true
    if (this.stopped) return 0
    const moves = genMoves(this.b, s)
    if (moves.length === 0) return -WIN + ply
    // Captures are forced, so a capture position is never "quiet": keep
    // searching it past the nominal depth (bounded by MAX_PLY).
    if (depth <= 0 && (moves[0].caps.length === 0 || ply >= MAX_PLY)) return evaluate(this.b, s)
    if (moves.length > 1) moves.sort((a, c) => c.caps.length - a.caps.length || Number(c.crown) - Number(a.crown))
    let best = -Infinity
    for (const m of moves) {
      const saved = makeMove(this.b, m)
      const v = -this.search(-s as CSide, depth - 1, -beta, -alpha, ply + 1)
      unmakeMove(this.b, m, saved)
      if (this.stopped) return 0
      if (v > best) best = v
      if (v > alpha) alpha = v
      if (alpha >= beta) break
    }
    return best
  }
}

export function* thinkCheckers(req: CheckersAIRequest): Generator<void, CheckersAIReply, void> {
  const b = Int8Array.from(req.board)
  const s = req.side
  const root = genMoves(b, s)
  if (root.length === 0) return { path: null, depth: 0, score: 0, nodes: 0 }
  if (root.length === 1) return { path: root[0].path, depth: 0, score: 0, nodes: 0 }
  const deadline = performance.now() + req.budgetMs
  const searcher = new Searcher(b)
  const margin = Math.max(0, req.randomness)
  let order = root.map((_, i) => i)
  let done: { scores: number[]; best: number; depth: number } | null = null

  for (let depth = 1; depth <= req.maxDepth; depth++) {
    searcher.deadline = depth === 1 ? Infinity : deadline
    const scores = new Array<number>(root.length).fill(-Infinity)
    let best = -Infinity
    let complete = true
    for (const idx of order) {
      const m = root[idx]
      const saved = makeMove(b, m)
      // Search the replies one by one so the fallback can yield between them.
      const replies = genMoves(b, -s as CSide)
      let v: number
      if (replies.length === 0) v = WIN - 1
      else {
        // Negamax at ply 1, unrolled: v = -max over replies of their score.
        let alpha1 = -Infinity
        const beta1 = -(best - margin - 1) // see chessAI.ts: exact scores for every candidate
        for (const r of replies) {
          const saved2 = makeMove(b, r)
          const w = -searcher.search(s, depth - 2, -beta1, -alpha1, 2)
          unmakeMove(b, r, saved2)
          if (searcher.stopped) break
          if (w > alpha1) alpha1 = w
          if (alpha1 >= beta1) break
          yield
        }
        v = -alpha1
      }
      unmakeMove(b, m, saved)
      if (searcher.stopped) {
        complete = false
        break
      }
      scores[idx] = v
      if (v > best) best = v
      yield
    }
    if (!complete) break
    done = { scores, best, depth }
    order = [...order].sort((a, c) => scores[c] - scores[a])
    if (Math.abs(best) > WIN - 1000) break
    if (performance.now() > deadline) break
  }

  if (!done) return { path: root[order[0]].path, depth: 0, score: 0, nodes: searcher.nodes }
  const { scores, best, depth } = done
  const window = Math.abs(best) > WIN - 1000 ? 0 : margin
  const candidates = order.filter((i) => scores[i] >= best - window)
  const pick = candidates[Math.floor(Math.random() * candidates.length)] ?? order[0]
  return { path: root[pick].path, depth, score: scores[pick], nodes: searcher.nodes }
}

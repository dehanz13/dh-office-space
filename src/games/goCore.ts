// 9x9 Go: rules, area scoring and AI. Pure functions shared by go.ts (main
// thread) and go.worker.ts.
//
// Board: Int8Array(81), index = y * 9 + x, y = 0 is the human's side (row "1").
// Cells: 0 empty, 1 black (the human, plays first), 2 white (the AI).
// Scoring is area scoring in the Tromp-Taylor style: stones on the board plus
// empty regions that touch only one colour; komi goes to White. There is no
// dead-stone removal, so a game is played out until both sides pass.

export const N = 9
export const AREA = N * N
export const EMPTY = 0
export const BLACK = 1
export const WHITE = 2
export type Stone = 1 | 2

export const NEIGHBORS: number[][] = []
export const DIAGONALS: number[][] = []
for (let p = 0; p < AREA; p++) {
  const x = p % N
  const y = (p / N) | 0
  const nb: number[] = []
  const dg: number[] = []
  if (x > 0) nb.push(p - 1)
  if (x < N - 1) nb.push(p + 1)
  if (y > 0) nb.push(p - N)
  if (y < N - 1) nb.push(p + N)
  for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const ax = x + dx
    const ay = y + dy
    if (ax >= 0 && ax < N && ay >= 0 && ay < N) dg.push(ay * N + ax)
  }
  NEIGHBORS.push(nb)
  DIAGONALS.push(dg)
}

const COLUMNS = 'ABCDEFGHJ' // Go skips the letter I

export function pointName(p: number): string {
  return COLUMNS[p % N] + (((p / N) | 0) + 1)
}

// Scratch space for flood fills (each thread has its own copy of this module).
const mark = new Int32Array(AREA)
const stack = new Int32Array(AREA)
let stamp = 0

function nextStamp(): number {
  if (++stamp > 2_000_000_000) {
    mark.fill(0)
    stamp = 1
  }
  return stamp
}

/** Liberty count of the group at p; pushes its stones into `stones` if given. */
export function groupLibs(b: Int8Array, p: number, stones: number[] | null): number {
  const color = b[p]
  const st = nextStamp()
  let libs = 0
  let sp = 0
  stack[sp++] = p
  mark[p] = st
  while (sp > 0) {
    const q = stack[--sp]
    if (stones) stones.push(q)
    const nb = NEIGHBORS[q]
    for (let i = 0; i < nb.length; i++) {
      const n = nb[i]
      if (mark[n] === st) continue
      const c = b[n]
      if (c === EMPTY) {
        mark[n] = st
        libs++
      } else if (c === color) {
        mark[n] = st
        stack[sp++] = n
      }
    }
  }
  return libs
}

export interface PlayResult {
  captured: number[]
  /** Point the opponent may not play next (simple ko), or -1. */
  ko: number
}

/** Plays `color` at p in place. Returns null (board unchanged) if occupied, the ko point, or suicide. */
export function tryPlay(b: Int8Array, p: number, color: Stone, ko: number): PlayResult | null {
  if (b[p] !== EMPTY || p === ko) return null
  b[p] = color
  const opp = 3 - color
  const captured: number[] = []
  const nb = NEIGHBORS[p]
  for (let i = 0; i < nb.length; i++) {
    const n = nb[i]
    if (b[n] !== opp) continue
    const stones: number[] = []
    if (groupLibs(b, n, stones) === 0) {
      for (const s of stones) {
        b[s] = EMPTY
        captured.push(s)
      }
    }
  }
  const own: number[] = []
  const libs = groupLibs(b, p, own)
  if (libs === 0) {
    b[p] = EMPTY // suicide; nothing was captured or there would be a liberty
    return null
  }
  // Simple ko: a lone stone that captured exactly one stone and now has
  // exactly one liberty (the captured point) may not be retaken at once.
  return { captured, ko: captured.length === 1 && own.length === 1 && libs === 1 ? captured[0] : -1 }
}

export function isLegal(b: Int8Array, p: number, color: Stone, ko: number): boolean {
  return tryPlay(b.slice(), p, color, ko) !== null
}

/** An empty point surrounded by `color` whose diagonals are not mostly the opponent's. */
export function isEye(b: Int8Array, p: number, color: Stone): boolean {
  if (b[p] !== EMPTY) return false
  const nb = NEIGHBORS[p]
  for (let i = 0; i < nb.length; i++) if (b[nb[i]] !== color) return false
  const dg = DIAGONALS[p]
  let bad = 0
  for (let i = 0; i < dg.length; i++) if (b[dg[i]] === 3 - color) bad++
  return dg.length < 4 ? bad === 0 : bad < 2
}

/** Area score without komi: stones plus empty regions bordered by one colour only. */
export function areaScore(b: Int8Array): { black: number; white: number } {
  let black = 0
  let white = 0
  const st = nextStamp()
  for (let p = 0; p < AREA; p++) {
    const c = b[p]
    if (c === BLACK) black++
    else if (c === WHITE) white++
    else if (mark[p] !== st) {
      let size = 0
      let touchB = false
      let touchW = false
      let sp = 0
      stack[sp++] = p
      mark[p] = st
      while (sp > 0) {
        const q = stack[--sp]
        size++
        for (const n of NEIGHBORS[q]) {
          const cn = b[n]
          if (cn === BLACK) touchB = true
          else if (cn === WHITE) touchW = true
          else if (mark[n] !== st) {
            mark[n] = st
            stack[sp++] = n
          }
        }
      }
      if (touchB && !touchW) black += size
      else if (touchW && !touchB) white += size
    }
  }
  return { black, white }
}

// ---------------------------------------------------------------- AI

export interface GoAIRequest {
  board: number[]
  color: Stone
  ko: number
  moveNumber: number
  opponentPassed: boolean
  komi: number
  budgetMs: number
  /** Refine the best heuristic candidates with random playouts. */
  playouts: boolean
}

export interface GoAIReply {
  /** Point to play, or null to pass. */
  point: number | null
  reason: string
  playouts: number
}

const PASS_BELOW = 6
const MC_CANDIDATES = 6
const MC_WEIGHT = 40

function manhattan(a: number, b: number): number {
  return Math.abs((a % N) - (b % N)) + Math.abs(((a / N) | 0) - ((b / N) | 0))
}

/** Influence map: positive = Black, negative = White. */
function influence(b: Int8Array): Int16Array {
  const inf = new Int16Array(AREA)
  for (let s = 0; s < AREA; s++) {
    if (b[s] === EMPTY) continue
    const sign = b[s] === BLACK ? 1 : -1
    for (let p = 0; p < AREA; p++) {
      const d = manhattan(s, p)
      if (d <= 3) inf[p] += sign * (4 - d)
    }
  }
  return inf
}

function lineOf(p: number): number {
  const x = p % N
  const y = (p / N) | 0
  return Math.min(x, y, N - 1 - x, N - 1 - y) + 1
}

const STAR = new Set([2 * N + 2, 2 * N + 6, 6 * N + 2, 6 * N + 6])
const TENGEN = 4 * N + 4
const THREE_FOUR = new Set([
  2 * N + 3, 3 * N + 2, 2 * N + 5, 3 * N + 6, 5 * N + 2, 6 * N + 3, 6 * N + 5, 5 * N + 6,
])

interface Candidate { p: number; score: number }

function scorePoint(
  b: Int8Array, p: number, me: Stone, ko: number, moveNumber: number, inf: Int16Array,
  atariGroups: { rep: number; size: number }[],
): number | null {
  const opp = (3 - me) as Stone
  const c = b.slice()
  const res = tryPlay(c, p, me, ko)
  if (!res) return null
  const caps = res.captured.length
  const own: number[] = []
  const libs = groupLibs(c, p, own)
  let s = 0

  // 1. Capture opponent groups in atari.
  if (caps > 0) s += 60 + 25 * Math.min(caps, 6)

  // 2. Save own groups in atari (by extending or by capturing).
  let saved = 0
  for (const g of atariGroups) {
    if (c[g.rep] !== me) continue
    const l = groupLibs(c, g.rep, null)
    if (l >= 3) saved += g.size
    else if (l === 2) saved += g.size * 0.6
  }
  if (saved > 0) s += 50 + 15 * Math.min(saved, 6)

  // Never walk into atari without a reason.
  if (libs === 1 && caps === 0) s -= 70 + 10 * own.length
  else if (libs === 1 && own.length > 1) s -= 20

  // Pressure on adjacent opponent groups.
  const seenRep: number[] = []
  for (const n of NEIGHBORS[p]) {
    if (c[n] !== opp || seenRep.includes(n)) continue
    const stones: number[] = []
    const l = groupLibs(c, n, stones)
    for (const st of stones) seenRep.push(st)
    if (l === 1 && libs >= 2) s += 14 + 4 * Math.min(stones.length, 5)
    else if (l === 2) s += 3
  }

  // 4. More liberties, good shape.
  s += Math.min(libs, 6) * 2
  let ownNb = 0
  let oppNb = 0
  for (const n of NEIGHBORS[p]) {
    if (b[n] === me) ownNb++
    else if (b[n] === opp) oppNb++
  }
  if (ownNb >= 3) s -= 6

  // Near existing stones.
  let nearest = 99
  let ownWithin2 = false
  let oppWithin2 = false
  for (let q = 0; q < AREA; q++) {
    if (b[q] === EMPTY) continue
    const d = manhattan(p, q)
    if (d < nearest) nearest = d
    if (d <= 2) {
      if (b[q] === me) ownWithin2 = true
      else oppWithin2 = true
    }
  }
  if (nearest <= 2) s += 6
  if (oppNb > 0) s += 3

  // Opening: corners first (3-3 / star points), then the sides and centre.
  const line = lineOf(p)
  if (moveNumber < 10) {
    if (STAR.has(p) && nearest > 2) s += 20
    else if (p === TENGEN && nearest > 1) s += 14
    else if (THREE_FOUR.has(p) && nearest > 1) s += 8
    if (line === 1) s -= 15
    else if (line === 2) s -= 6
  } else if (line === 1 && caps === 0 && saved === 0) s -= 8

  // Territory sense: do not fill your own area, do not dive into theirs late
  // in the game, do play on the frontier.
  const ownInf = me === BLACK ? inf[p] : -inf[p]
  if (oppNb === 0 && !oppWithin2 && ownInf >= 6) s -= 25
  if (moveNumber > 20 && ownInf <= -8 && !ownWithin2 && caps === 0) s -= 12
  if (Math.abs(ownInf) <= 3 && nearest <= 2) s += 6

  return s + Math.random() * 4
}

/** One random game from `first`; true if `me` wins on area score. */
function playout(b0: Int8Array, first: number, me: Stone, ko0: number, komi: number): boolean {
  const b = b0.slice()
  const r0 = tryPlay(b, first, me, ko0)
  if (!r0) return false
  let ko = r0.ko
  let color = (3 - me) as Stone
  const empties: number[] = []
  for (let p = 0; p < AREA; p++) if (b[p] === EMPTY) empties.push(p)
  let passes = 0
  for (let moves = 0; moves < 220 && passes < 2; moves++) {
    let n = empties.length
    let played = false
    while (n > 0) {
      const i = (Math.random() * n) | 0
      const p = empties[i]
      if (!isEye(b, p, color)) {
        const r = tryPlay(b, p, color, ko)
        if (r) {
          ko = r.ko
          empties[i] = empties[empties.length - 1]
          empties.pop()
          for (const c of r.captured) empties.push(c)
          played = true
          break
        }
      }
      n--
      empties[i] = empties[n]
      empties[n] = p
    }
    if (played) passes = 0
    else {
      passes++
      ko = -1
    }
    color = (3 - color) as Stone
  }
  const sc = areaScore(b)
  const white = sc.white + komi
  return me === WHITE ? white > sc.black : sc.black > white
}

export function* thinkGo(req: GoAIRequest): Generator<void, GoAIReply, void> {
  const t0 = performance.now()
  const b = Int8Array.from(req.board)
  const me = req.color

  // Opponent passed and we are ahead on the count that will be used: pass, game over.
  const now = areaScore(b)
  const mine = me === WHITE ? now.white + req.komi : now.black
  const theirs = me === WHITE ? now.black : now.white + req.komi
  if (req.opponentPassed && mine > theirs) return { point: null, reason: 'ahead after a pass', playouts: 0 }

  // Own groups already in atari.
  const atariGroups: { rep: number; size: number }[] = []
  const done = new Uint8Array(AREA)
  for (let p = 0; p < AREA; p++) {
    if (b[p] !== me || done[p]) continue
    const stones: number[] = []
    const l = groupLibs(b, p, stones)
    for (const s of stones) done[s] = 1
    if (l === 1) atariGroups.push({ rep: p, size: stones.length })
  }

  const inf = influence(b)
  const cands: Candidate[] = []
  for (let p = 0; p < AREA; p++) {
    if (b[p] !== EMPTY || p === req.ko || isEye(b, p, me)) continue
    const s = scorePoint(b, p, me, req.ko, req.moveNumber, inf, atariGroups)
    if (s !== null) cands.push({ p, score: s })
    if (p % 9 === 8) yield
  }
  cands.sort((a, c) => c.score - a.score)
  if (cands.length === 0 || cands[0].score < PASS_BELOW) return { point: null, reason: 'no reasonable move', playouts: 0 }

  // Light Monte-Carlo: random playouts for the best few candidates, used as a
  // correction on top of the heuristic (tactics above still dominate).
  let total = 0
  const top = cands.slice(0, MC_CANDIDATES).filter((c) => c.score >= PASS_BELOW)
  if (req.playouts && top.length > 1) {
    const wins = new Array<number>(top.length).fill(0)
    const runs = new Array<number>(top.length).fill(0)
    const stopAt = t0 + req.budgetMs * 0.85
    while (performance.now() < stopAt && total < 4000) {
      for (let i = 0; i < top.length; i++) {
        if (playout(b, top[i].p, me, req.ko, req.komi)) wins[i]++
        runs[i]++
        total++
        yield
      }
    }
    if (total > 0) {
      const rates = top.map((_, i) => (runs[i] ? wins[i] / runs[i] : 0))
      const mean = rates.reduce((a, r) => a + r, 0) / rates.length
      top.forEach((c, i) => (c.score += MC_WEIGHT * (rates[i] - mean)))
      top.sort((a, c) => c.score - a.score)
    }
  }
  return { point: top[0]?.p ?? cands[0].p, reason: 'heuristic', playouts: total }
}

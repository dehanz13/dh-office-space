// Plays random-legal-human vs AI games for chess, checkers and go and checks
// every move event against the engines. Run with: npx tsx scripts/test-games.ts
//
// Node has no Web Worker, so this exercises the chunked main-thread fallback
// of the AI runner (the same think generators the workers run).

import { Chess } from 'chess.js'
import { legalMoveKeys } from '../src/games/chessAI'
import { genMoves, type CSide } from '../src/games/checkersCore'
import { AREA, BLACK, EMPTY, N, WHITE, groupLibs, tryPlay } from '../src/games/goCore'
import { ChessGame, createGame } from '../src/games/index'
import type { BoardGame, GameId, MoveEvent, Piece, Square } from '../src/games/types'

const GAMES_PER_TYPE = 3
const MAX_PLIES = 200

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`Assertion failed: ${msg}`)
}

const sq = (s: Square) => `${s.x},${s.y}`
const same = (a: Square, b: Square) => a.x === b.x && a.y === b.y
const pick = <T>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)]
const snapshot = (ps: Piece[]) => JSON.stringify([...ps].sort((a, b) => (a.id < b.id ? -1 : 1)))

/** Generic invariants: ids unique, captured ids gone, placed ids new, hop chains consistent. */
function checkEvent(game: BoardGame, before: Piece[], ev: MoveEvent, after: Piece[], retired: Set<string>, ctx: string): void {
  const n = game.size
  const ids = new Set<string>()
  const squares = new Set<string>()
  for (const p of after) {
    assert(!ids.has(p.id), `${ctx}: duplicate id ${p.id}`)
    assert(!squares.has(sq(p.at)), `${ctx}: two pieces on ${sq(p.at)}`)
    assert(p.at.x >= 0 && p.at.x < n && p.at.y >= 0 && p.at.y < n, `${ctx}: ${p.id} off board`)
    ids.add(p.id)
    squares.add(sq(p.at))
  }
  const b = new Map(before.map((p) => [p.id, p]))
  const a = new Map(after.map((p) => [p.id, p]))
  for (const id of ev.captured) {
    assert(b.has(id), `${ctx}: captured ${id} was not on the board`)
    assert(!a.has(id), `${ctx}: captured ${id} is still on the board`)
    retired.add(id)
  }
  for (const p of ev.placed) {
    assert(!b.has(p.id) && !retired.has(p.id), `${ctx}: placed id ${p.id} is not new`)
    const q = a.get(p.id)
    assert(q && same(q.at, p.at) && q.kind === p.kind && q.owner === p.owner, `${ctx}: placed ${p.id} does not match pieces()`)
  }
  const hops = new Map<string, MoveEvent['moved']>()
  for (const m of ev.moved) {
    assert(b.has(m.id), `${ctx}: moved ${m.id} was not on the board`)
    const list = hops.get(m.id) ?? []
    if (list.length) assert(same(list[list.length - 1].to, m.from), `${ctx}: hops of ${m.id} are not contiguous`)
    list.push(m)
    hops.set(m.id, list)
  }
  for (const [id, list] of hops) {
    assert(same(b.get(id)!.at, list[0].from), `${ctx}: ${id} did not start where it was`)
    const q = a.get(id)
    if (q) assert(same(q.at, list[list.length - 1].to), `${ctx}: ${id} did not end where the event says`)
    else assert(ev.captured.includes(id), `${ctx}: moved ${id} vanished without being captured`)
  }
  for (const p of before) {
    if (ev.captured.includes(p.id)) continue
    const q = a.get(p.id)
    assert(q, `${ctx}: ${p.id} disappeared without being captured`)
    if (!hops.has(p.id)) assert(same(p.at, q.at), `${ctx}: ${p.id} moved without an event`)
    if (ev.promoted?.id === p.id) assert(q.kind === ev.promoted.kind, `${ctx}: promotion of ${p.id} not applied`)
    else assert(q.kind === p.kind, `${ctx}: ${p.id} changed kind without a promotion`)
  }
  assert(after.length === before.length - ev.captured.length + ev.placed.length, `${ctx}: piece count does not add up`)
  assert(typeof ev.notation === 'string' && ev.notation.length > 0, `${ctx}: empty notation`)
}

// ------------------------------------------------------------ per-game legality checks

/** Chess: the referee (chess.js) and our search engine must agree on legal moves and resulting positions. */
function chessCrossCheck(game: ChessGame, ctx: string): Set<string> {
  const fen = game.fen()
  const ref = new Chess(fen)
  const mine = legalMoveKeys(fen)
  const refMoves = ref.moves({ verbose: true })
  assert(refMoves.length === mine.size, `${ctx}: engine has ${mine.size} legal moves, chess.js ${refMoves.length} (${fen})`)
  const fromTo = new Set<string>()
  for (const m of refMoves) {
    const uci = m.from + m.to + (m.promotion ?? '')
    const key = mine.get(uci)
    assert(key !== undefined, `${ctx}: engine lacks ${uci} (${fen})`)
    assert(key === m.after.split(' ').slice(0, 3).join(' '), `${ctx}: engine position after ${uci} differs`)
    fromTo.add(m.from + m.to)
  }
  // pieces() must mirror the referee's board.
  const board = new Map<string, string>()
  for (const row of ref.board()) for (const c of row) if (c) board.set(c.square, c.color + c.type)
  const ps = game.pieces()
  assert(ps.length === board.size, `${ctx}: pieces() has ${ps.length} pieces, board ${board.size}`)
  for (const p of ps) {
    const name = 'abcdefgh'[p.at.x] + (p.at.y + 1)
    assert(board.get(name) === (p.owner === 'human' ? 'w' : 'b') + p.kind, `${ctx}: pieces() disagrees on ${name}`)
  }
  return fromTo
}

function chessMoveKey(ev: MoveEvent): string {
  const m = ev.moved[0]
  const name = (s: Square) => 'abcdefgh'[s.x] + (s.y + 1)
  return name(m.from) + name(m.to)
}

function checkersBoard(ps: Piece[]): Int8Array {
  const b = new Int8Array(64)
  for (const p of ps) b[p.at.y * 8 + p.at.x] = (p.owner === 'human' ? 1 : -1) * (p.kind === 'king' ? 2 : 1)
  return b
}

function checkersLegalPaths(ps: Piece[], side: CSide): Set<string> {
  return new Set(genMoves(checkersBoard(ps), side).map((m) => m.path.join('-')))
}

function checkersEventPath(ev: MoveEvent): string {
  const idx = (s: Square) => s.y * 8 + s.x
  return [idx(ev.moved[0].from), ...ev.moved.map((m) => idx(m.to))].join('-')
}

function goBoard(ps: Piece[]): Int8Array {
  const b = new Int8Array(AREA)
  for (const p of ps) b[p.at.y * N + p.at.x] = p.owner === 'human' ? BLACK : WHITE
  return b
}

/** Go: the placed stone must be legal (not occupied, not suicide, not the ko point) and capture exactly what the rules say. */
function goCheck(before: Piece[], ev: MoveEvent, ko: number, ctx: string): number {
  if (ev.notation === 'pass') {
    assert(ev.placed.length === 0 && ev.captured.length === 0, `${ctx}: a pass changed the board`)
    return -1
  }
  assert(ev.placed.length === 1 && ev.moved.length === 0, `${ctx}: a go move places exactly one stone`)
  const b = goBoard(before)
  const stone = ev.placed[0]
  const p = stone.at.y * N + stone.at.x
  assert(b[p] === EMPTY, `${ctx}: stone placed on an occupied point`)
  assert(p !== ko, `${ctx}: ko violated at ${ev.notation}`)
  const res = tryPlay(b, p, stone.owner === 'human' ? BLACK : WHITE, -1)
  assert(res, `${ctx}: ${ev.notation} is suicide`)
  const byPoint = new Map(before.map((q) => [q.at.y * N + q.at.x, q.id]))
  const expected = res.captured.map((c) => byPoint.get(c)).sort()
  assert(JSON.stringify(expected) === JSON.stringify([...ev.captured].sort()), `${ctx}: wrong captures for ${ev.notation}`)
  const own: number[] = []
  const libs = groupLibs(b, p, own)
  return res.captured.length === 1 && own.length === 1 && libs === 1 ? res.captured[0] : -1
}

// ------------------------------------------------------------ driver

interface Result { text: string; plies: number; aiMs: number[]; maxBlock: number }

async function playOne(id: GameId): Promise<Result> {
  const game = createGame(id)
  assert(game.lastMove() === null, `${id}: lastMove not null at start`)
  assert((await game.aiMove()) === null, `${id}: AI moved on the human's turn`)
  const retired = new Set<string>()
  const aiMs: number[] = []
  let maxBlock = 0
  let plies = 0
  let ko = -1

  while (!game.status().over && plies < MAX_PLIES) {
    const ctx = `${id} ply ${plies + 1}`
    const before = game.pieces()
    let ev: MoveEvent | null
    let legalChess: Set<string> | null = null
    if (id === 'chess') legalChess = chessCrossCheck(game as ChessGame, ctx)

    if (game.turn() === 'human') {
      assert(game.status().text.startsWith('Your move') || game.status().text.startsWith('Check') || game.status().text.startsWith('The AI passed'), `${ctx}: odd status ${game.status().text}`)
      if (id === 'go') {
        const pts = game.targets(null)
        // An illegal point (occupied) must be refused without changing anything.
        if (before.length) {
          assert(game.play(null, pick(before).at) === null, `${ctx}: occupied point accepted`)
          assert(snapshot(game.pieces()) === snapshot(before), `${ctx}: refused move changed the board`)
        }
        const passNow = pts.length === 0 || (plies > 60 && Math.random() < 0.25)
        ev = passNow ? game.pass!() : game.play(null, pick(pts))
        assert(ev, `${ctx}: listed go point refused`)
        assert(ev.notation !== '', `${ctx}: pass ignored on the human's turn`)
      } else {
        const froms = game.movableFrom()
        assert(froms.length > 0, `${ctx}: no movable pieces but the game is not over`)
        const from = pick(froms)
        const tos = game.targets(from)
        assert(tos.length > 0, `${ctx}: movable piece has no targets`)
        // A destination that is not a target must be refused.
        const bad: Square[] = []
        for (let x = 0; x < game.size; x++) for (let y = 0; y < game.size; y++) if (!tos.some((t) => t.x === x && t.y === y)) bad.push({ x, y })
        assert(game.play(from, pick(bad)) === null, `${ctx}: illegal destination accepted`)
        assert(snapshot(game.pieces()) === snapshot(before), `${ctx}: refused move changed the board`)
        ev = game.play(from, pick(tos))
        assert(ev, `${ctx}: listed target refused`)
        if (id === 'checkers') {
          assert(checkersLegalPaths(before, 1).has(checkersEventPath(ev)), `${ctx}: human jump path not legal`)
        }
      }
    } else {
      assert(game.movableFrom().length === 0, `${ctx}: human can move on the AI's turn`)
      const legalCheckers = id === 'checkers' ? checkersLegalPaths(before, -1) : null
      // Measure how long the main thread is blocked while the AI thinks.
      let lastTick = performance.now()
      let worst = 0
      const timer = setInterval(() => {
        const t = performance.now()
        worst = Math.max(worst, t - lastTick)
        lastTick = t
      }, 1)
      const t0 = performance.now()
      ev = await game.aiMove()
      aiMs.push(performance.now() - t0)
      clearInterval(timer)
      maxBlock = Math.max(maxBlock, worst)
      assert(ev, `${ctx}: AI returned no move but the game is not over`)
      if (legalChess) assert(legalChess.has(chessMoveKey(ev)), `${ctx}: AI chess move ${ev.notation} not legal`)
      if (legalCheckers) assert(legalCheckers.has(checkersEventPath(ev)), `${ctx}: AI checkers path not legal`)
    }

    const after = game.pieces()
    if (id === 'go') ko = goCheck(before, ev, ko, ctx)
    else checkEvent(game, before, ev, after, retired, ctx)
    if (id === 'go') checkEvent(game, before, ev, after, retired, ctx)
    assert(game.lastMove() === ev, `${ctx}: lastMove is not the event just played`)
    plies++
  }

  const st = game.status()
  if (st.over) {
    assert(st.winner !== null, `${id}: finished game without a winner field`)
    assert((await game.aiMove()) === null, `${id}: AI moved after the game ended`)
    assert(game.movableFrom().length === 0 && game.targets(null).length === 0, `${id}: moves offered after the end`)
  }
  const text = st.over ? st.text : `unfinished after ${MAX_PLIES} plies (${st.text})`
  game.reset()
  const fresh = game.pieces().length
  assert(fresh === { chess: 32, checkers: 24, go: 0 }[id], `${id}: reset did not restore the start position`)
  assert(game.turn() === 'human' && game.lastMove() === null, `${id}: reset did not restore turn/lastMove`)
  return { text, plies, aiMs, maxBlock }
}

async function main(): Promise<void> {
  const t0 = performance.now()
  for (const id of ['chess', 'checkers', 'go'] as GameId[]) {
    for (let i = 1; i <= GAMES_PER_TYPE; i++) {
      const r = await playOne(id)
      const avg = r.aiMs.reduce((a, b) => a + b, 0) / Math.max(1, r.aiMs.length)
      console.log(
        `${id.padEnd(8)} game ${i}: ${r.text.padEnd(44)} plies ${String(r.plies).padStart(3)}  ` +
          `AI avg ${avg.toFixed(0).padStart(4)} ms (max ${Math.max(0, ...r.aiMs).toFixed(0)})  main-thread max block ${r.maxBlock.toFixed(1)} ms`,
      )
    }
  }
  console.log(`All checks passed in ${((performance.now() - t0) / 1000).toFixed(1)} s.`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : err)
  ;(globalThis as { process?: { exitCode?: number } }).process!.exitCode = 1
})

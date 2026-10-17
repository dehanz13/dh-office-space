import { useFrame, useThree } from '@react-three/fiber'
import gsap from 'gsap'
import { useEffect, useMemo } from 'react'
import {
  AdditiveBlending,
  type Camera,
  CircleGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  type Object3D,
  PlaneGeometry,
  Raycaster,
  RingGeometry,
  Vector2,
  Vector3,
} from 'three'
import { type BoardGame, CheckersGame, ChessGame, type GameId, GoGame, type MoveEvent, type Piece, type Side, type Square } from '../games'
import { itemById } from '../layout'
import { useGame } from '../state/store'
import { hudSlots } from '../ui/Hud'
import { GamePanel } from './GamePanel'
import { crownChecker, KING_STACK, makePiece, pieceMaterials, setHot, stoneGeometry } from './pieces'
import { boardControls, boardMessage, boardStatus, boardThinking, type Level } from './status'

// The three AI tables. Each board is a small controller around a game engine:
// it keeps one mesh per piece id, turns each MoveEvent into motion (glide,
// hop, slide off the board, drop in), and runs the turn loop. The chessboard
// also plays itself while nobody sits at it, so it reads as an AI board from
// across the room.

const BOARDS: { id: GameId; item: string; surface: number }[] = [
  { id: 'chess', item: 'chess-table', surface: 0.7505 },
  { id: 'checkers', item: 'checkers-table', surface: 0.7505 },
  { id: 'go', item: 'go-table', surface: 0.8205 },
]
const TABLE_TOP = 0.72
const HALF = 0.22
const CELL = 0.055
const GO_MARGIN = 0.44 * 0.06
const GO_STEP = (0.44 - 2 * GO_MARGIN) / 8
const LIFT = 0.0012
/** Even a 5 ms reply waits a beat, so the AI reads as thinking, not twitching. */
const MIN_THINK: Record<GameId, number> = { chess: 900, checkers: 750, go: 150 }
const AMBER = '#ffb35c'
const CYAN = '#29d3ff'

/** Each level is just engine settings: how far the AI looks ahead, how loosely
 *  it picks among good moves, and (Go) whether it plays games out to check. */
function makeGame(id: GameId, level: Level): BoardGame {
  switch (id) {
    case 'chess':
      return new ChessGame({ easy: { depth: 1, randomness: 140 }, medium: { depth: 2, randomness: 45 }, hard: { depth: 3, randomness: 15 } }[level])
    case 'checkers':
      return new CheckersGame({ easy: { depth: 2, randomness: 60 }, medium: { depth: 4, randomness: 15 }, hard: { depth: 6, randomness: 6 } }[level])
    case 'go':
      return new GoGame({ easy: { playouts: false, budgetMs: 120 }, medium: { playouts: true, budgetMs: 280 }, hard: { playouts: true, budgetMs: 600 } }[level])
  }
}

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))
const same = (a: Square, b: Square) => a.x === b.x && a.y === b.y

function squareToLocal(id: GameId, s: Square, out = new Vector3()) {
  if (id === 'go') return out.set(-HALF + GO_MARGIN + s.x * GO_STEP, 0, HALF - GO_MARGIN - s.y * GO_STEP)
  return out.set(-HALF + (s.x + 0.5) * CELL, 0, HALF - (s.y + 0.5) * CELL)
}

function localToSquare(id: GameId, size: number, p: Vector3): Square | null {
  const x = id === 'go' ? Math.round((p.x + HALF - GO_MARGIN) / GO_STEP) : Math.floor((p.x + HALF) / CELL)
  const y = id === 'go' ? Math.round((HALF - GO_MARGIN - p.z) / GO_STEP) : Math.floor((HALF - p.z) / CELL)
  return x < 0 || y < 0 || x >= size || y >= size ? null : { x, y }
}

function flatMaterial(color: string, opacity: number, additive = false) {
  return new MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: additive ? AdditiveBlending : NormalBlending })
}

/** A flat square outline the size of one cell (a 4-sided ring turned 45°). */
function outline(width: number) {
  const outer = (CELL / Math.SQRT2) * 0.97
  return new RingGeometry(outer - width * Math.SQRT2, outer, 4, 1).rotateZ(Math.PI / 4).rotateX(-Math.PI / 2)
}

class BoardController {
  game: BoardGame
  level: Level = 'medium'
  readonly root = new Group()
  private readonly pieces = new Map<string, Group>()
  private fallen: Group[] = []
  private graveyard: Record<Side, number> = { human: 0, ai: 0 }
  private readonly hit: Mesh
  private readonly selectMark: Mesh
  private readonly hoverMark: Mesh
  private readonly targetMarks: InstancedMesh
  private readonly captureMarks: InstancedMesh
  private readonly lastFrom: Mesh
  private readonly lastTo: Mesh
  private readonly lastStone: Mesh
  private readonly ghost: Mesh
  private readonly trail: Mesh
  private readonly scan: Mesh
  private epoch = 0
  private busy = false
  private selected: Square | null = null
  private legal: { movable: Square[]; go: Square[] } | null = null
  private lastAi = ''
  private humanMoves = 0
  mode: 'demo' | 'play'
  private nextDemoAt = 4
  private overAt = 0
  private idleTimer = 0

  constructor(readonly id: GameId) {
    this.game = makeGame(id, this.level)
    this.mode = id === 'chess' ? 'demo' : 'play'
    const hidden = new MeshBasicMaterial({ visible: false })
    this.hit = new Mesh(new PlaneGeometry(0.48, 0.48).rotateX(-Math.PI / 2), hidden)
    // Chess-app conventions: a tinted square under the picked piece, dots on
    // empty destinations, rings round pieces that can be taken.
    const fill = new PlaneGeometry(CELL, CELL).rotateX(-Math.PI / 2)
    this.selectMark = new Mesh(fill, flatMaterial(AMBER, 0.55))
    this.hoverMark = new Mesh(outline(0.0025), flatMaterial('#ffffff', 0.7))
    this.targetMarks = new InstancedMesh(new CircleGeometry(0.0085, 24).rotateX(-Math.PI / 2), flatMaterial(AMBER, 0.85), 32)
    this.captureMarks = new InstancedMesh(new RingGeometry(0.021, 0.0255, 32).rotateX(-Math.PI / 2), flatMaterial(AMBER, 0.9), 16)
    this.lastFrom = new Mesh(fill, flatMaterial(CYAN, 0.18))
    this.lastTo = new Mesh(fill, flatMaterial(CYAN, 0.3))
    this.lastStone = new Mesh(new RingGeometry(0.0052, 0.0078, 28).rotateX(-Math.PI / 2), flatMaterial(CYAN, 0.95))
    this.ghost = new Mesh(stoneGeometry, pieceMaterials.slate.clone())
    Object.assign(this.ghost.material, { transparent: true, opacity: 0.45, depthWrite: false })
    this.trail = new Mesh(new PlaneGeometry(1, 0.0035).rotateX(-Math.PI / 2), flatMaterial(CYAN, 0, true))
    this.scan = new Mesh(new PlaneGeometry(0.44, 0.012).rotateX(-Math.PI / 2), flatMaterial(CYAN, 0.0, true))
    for (const m of [this.selectMark, this.hoverMark, this.lastFrom, this.lastTo, this.lastStone, this.ghost, this.trail, this.scan]) m.visible = false
    this.targetMarks.count = 0
    this.captureMarks.count = 0
    this.root.add(this.hit, this.selectMark, this.hoverMark, this.targetMarks, this.captureMarks, this.lastFrom, this.lastTo, this.lastStone, this.ghost, this.trail, this.scan)
    this.sync(true)
    this.refreshStatus()
  }

  // ── Pieces ──────────────────────────────────────────────────────────────────

  /** Make the meshes match the engine: add, remove, re-crown, and optionally snap into place. */
  private sync(snap: boolean) {
    this.legal = null
    const live = this.game.pieces()
    const ids = new Set(live.map((p) => p.id))
    for (const [id, mesh] of this.pieces) {
      if (!ids.has(id)) {
        this.root.remove(mesh)
        this.pieces.delete(id)
      }
    }
    for (const p of live) {
      let mesh = this.pieces.get(p.id)
      if (mesh && mesh.userData.kind !== p.kind) {
        if (this.id === 'checkers' && p.kind === 'king') crownChecker(mesh)
        else {
          this.root.remove(mesh)
          mesh = undefined
        }
      }
      if (!mesh) {
        mesh = makePiece(this.id, p)
        this.root.add(mesh)
        this.pieces.set(p.id, mesh)
        snap = true
      }
      if (snap) squareToLocal(this.id, p.at, mesh.position)
    }
  }

  private glide(mesh: Object3D, to: Vector3, arc: number, duration = 0.42) {
    const from = mesh.position.clone()
    const s = { t: 0 }
    return new Promise<void>((resolve) => {
      gsap.to(s, {
        t: 1,
        duration,
        ease: 'power2.inOut',
        onUpdate: () => {
          mesh.position.lerpVectors(from, to, s.t)
          mesh.position.y += Math.sin(Math.PI * s.t) * arc
        },
        onComplete: resolve,
      })
    })
  }

  /** A taken piece slides off to its owner's side of the table. */
  private capture(id: string) {
    const mesh = this.pieces.get(id)
    if (!mesh) return Promise.resolve()
    this.pieces.delete(id)
    if (this.id === 'go') return this.vanish(mesh)
    this.fallen.push(mesh)
    const owner = mesh.userData.owner as Side
    const k = this.graveyard[owner]++
    const side = owner === 'ai' ? 1 : -1
    const x = side * (0.305 + (k % 2) * 0.05)
    const z = side * (0.2 - Math.floor(k / 2) * 0.05)
    return this.glide(mesh, new Vector3(x, TABLE_TOP - this.surface, z), 0.06, 0.55)
  }

  private vanish(mesh: Object3D) {
    return new Promise<void>((resolve) => {
      gsap.to(mesh.scale, {
        x: 0.01,
        y: 0.01,
        z: 0.01,
        duration: 0.28,
        ease: 'power2.in',
        onComplete: () => {
          this.root.remove(mesh)
          resolve()
        },
      })
    })
  }

  private place(p: Piece) {
    const mesh = makePiece(this.id, p)
    squareToLocal(this.id, p.at, mesh.position)
    this.root.add(mesh)
    this.pieces.set(p.id, mesh)
    return new Promise<void>((resolve) => {
      if (this.id === 'go') {
        mesh.position.y = 0.03
        gsap.to(mesh.position, { y: 0, duration: 0.22, ease: 'power2.in', onComplete: resolve })
      } else {
        mesh.scale.setScalar(0.01)
        gsap.to(mesh.scale, { x: 1, y: 1, z: 1, duration: 0.4, ease: 'back.out(2)', onComplete: resolve })
      }
    })
  }

  private get surface() {
    return BOARDS.find((b) => b.id === this.id)?.surface ?? 0.75
  }

  /** Play one MoveEvent out on the board. */
  private async animate(ev: MoveEvent, who: Side) {
    const epoch = this.epoch
    const ai = who === 'ai'
    const pending = [...ev.captured]
    const movedIds = new Set(ev.moved.map((m) => m.id))
    this.showLast(ev, who)
    if (ai && ev.moved[0]) this.showTrail(ev.moved[0].from, ev.moved[ev.moved.length - 1].to)
    for (const m of ev.moved) {
      const mesh = this.pieces.get(m.id)
      if (!mesh) continue
      const hop = this.id === 'checkers' && Math.abs(m.to.x - m.from.x) === 2
      const knight = mesh.userData.kind === 'n'
      if (ai) setHot(mesh, true)
      await this.glide(mesh, squareToLocal(this.id, m.to), hop || knight ? 0.04 : 0.016, ai ? 0.55 : 0.4)
      if (epoch !== this.epoch) return
      if (ai) setHot(mesh, false)
      // Checkers: the piece jumped on each hop leaves as the hop lands.
      if (hop && pending.length) void this.capture(pending.shift() as string)
    }
    const captures = () => Promise.all(pending.map((id) => (movedIds.has(id) ? this.vanishId(id) : this.capture(id))))
    const placed = () => Promise.all(ev.placed.map((p) => this.place(p)))
    if (this.id === 'go') {
      await placed()
      await captures()
    } else {
      await captures()
      await placed()
    }
    if (epoch !== this.epoch) return
    if (ev.promoted && this.id === 'checkers') {
      const mesh = this.pieces.get(ev.promoted.id)
      const crown = mesh ? crownChecker(mesh) : undefined
      if (crown) {
        crown.position.y = 0.05
        await new Promise<void>((resolve) => gsap.to(crown.position, { y: KING_STACK, duration: 0.3, ease: 'bounce.out', onComplete: resolve }))
      }
    }
    if (epoch !== this.epoch) return
    this.sync(true)
    this.placeLastStone(ev, who)
  }

  private vanishId(id: string) {
    const mesh = this.pieces.get(id)
    if (!mesh) return Promise.resolve()
    this.pieces.delete(id)
    return this.vanish(mesh)
  }

  // ── Markers ─────────────────────────────────────────────────────────────────

  private mark(mesh: Object3D, s: Square | null, y = LIFT) {
    mesh.visible = !!s
    if (s) squareToLocal(this.id, s, mesh.position).setY(y)
  }

  private showLast(ev: MoveEvent, who: Side) {
    const colour = who === 'ai' ? CYAN : AMBER
    for (const m of [this.lastFrom, this.lastTo, this.lastStone]) (m.material as MeshBasicMaterial).color.set(colour)
    const first = ev.moved[0]
    const last = ev.moved[ev.moved.length - 1]
    this.mark(this.lastFrom, this.id === 'go' ? null : (first?.from ?? null))
    this.mark(this.lastTo, this.id === 'go' ? null : (last?.to ?? null))
    this.lastStone.visible = false
  }

  private placeLastStone(ev: MoveEvent, who: Side) {
    if (this.id !== 'go') return
    const stone = ev.placed[0]
    ;(this.lastStone.material as MeshBasicMaterial).color.set(who === 'ai' ? CYAN : AMBER)
    this.mark(this.lastStone, stone ? stone.at : null, 0.0186)
  }

  /** A cyan line from the AI's square to where it lands, fading out. */
  private showTrail(from: Square, to: Square) {
    const a = squareToLocal(this.id, from)
    const b = squareToLocal(this.id, to)
    const length = a.distanceTo(b)
    if (length < 0.001) return
    this.trail.position.copy(a).add(b).multiplyScalar(0.5).setY(LIFT * 2)
    this.trail.scale.set(length, 1, 1)
    this.trail.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x)
    this.trail.visible = true
    const material = this.trail.material as MeshBasicMaterial
    gsap.killTweensOf(material)
    gsap.fromTo(material, { opacity: 0.9 }, { opacity: 0, duration: 2.2, ease: 'power1.in', delay: 0.4 })
  }

  private targetsOf(s: Square) {
    return this.game.targets(s)
  }

  private legalNow() {
    if (!this.legal) this.legal = { movable: this.game.movableFrom(), go: this.id === 'go' ? this.game.targets(null) : [] }
    return this.legal
  }

  private select(s: Square | null) {
    this.selected = s
    this.mark(this.selectMark, s)
    const targets = s ? this.targetsOf(s) : []
    const occupied = new Set(this.game.pieces().map((p) => `${p.at.x},${p.at.y}`))
    const m = new Matrix4()
    let dots = 0
    let rings = 0
    for (const t of targets) {
      const p = squareToLocal(this.id, t).setY(LIFT * 2)
      if (occupied.has(`${t.x},${t.y}`)) {
        if (rings < 16) this.captureMarks.setMatrixAt(rings++, m.makeTranslation(p.x, p.y, p.z))
      } else if (dots < 32) this.targetMarks.setMatrixAt(dots++, m.makeTranslation(p.x, p.y, p.z))
    }
    this.targetMarks.count = dots
    this.captureMarks.count = rings
    this.targetMarks.instanceMatrix.needsUpdate = true
    this.captureMarks.instanceMatrix.needsUpdate = true
  }

  private canAct() {
    return !this.busy && this.game.turn() === 'human' && !this.game.status().over
  }

  debug() {
    return { mode: this.mode, busy: this.busy, epoch: this.epoch, turn: this.game.turn(), over: this.game.status().over, movable: this.game.movableFrom().length, selected: this.selected, pieces: this.pieces.size }
  }

  // ── Input (only while the visitor sits at this board) ──────────────────────

  pick(ray: Raycaster): Square | null {
    const hits = ray.intersectObjects([this.hit, ...this.pieces.values()], true)
    for (const h of hits) {
      if (h.object === this.hit) return localToSquare(this.id, this.game.size, this.root.worldToLocal(h.point.clone()))
      let o: Object3D | null = h.object
      while (o && !o.userData.id) o = o.parent
      const id = o?.userData.id as string | undefined
      const piece = id ? this.game.pieces().find((p) => p.id === id) : undefined
      if (piece) return piece.at
    }
    return null
  }

  hover(s: Square | null) {
    let clickable = false
    if (s && this.canAct()) {
      if (this.id === 'go') clickable = this.legalNow().go.some((t) => same(t, s))
      else clickable = this.legalNow().movable.some((t) => same(t, s)) || (!!this.selected && this.targetsOf(this.selected).some((t) => same(t, s)))
    }
    document.body.style.cursor = clickable ? 'pointer' : ''
    if (this.id === 'go') {
      this.mark(this.ghost, clickable ? s : null, 0)
      this.hoverMark.visible = false
    } else this.mark(this.hoverMark, clickable ? s : null)
  }

  click(s: Square | null) {
    if (!s || !this.canAct()) return
    if (this.id === 'go') {
      if (this.legalNow().go.some((t) => same(t, s))) void this.humanMove(null, s)
      return
    }
    if (this.selected && this.targetsOf(this.selected).some((t) => same(t, s))) {
      void this.humanMove(this.selected, s)
      return
    }
    const pickable = this.legalNow().movable.some((t) => same(t, s))
    this.select(pickable && !(this.selected && same(this.selected, s)) ? s : null)
  }

  // ── Turns ───────────────────────────────────────────────────────────────────

  private async humanMove(from: Square | null, to: Square) {
    if (!this.canAct()) return
    const ev = this.game.play(from, to)
    if (!ev) return
    this.humanMoves++
    this.select(null)
    this.hover(null)
    this.busy = true
    const epoch = this.epoch
    await this.animate(ev, 'human')
    if (epoch !== this.epoch) return
    await this.aiTurn()
  }

  pass() {
    if (this.id !== 'go' || !this.canAct() || !this.game.pass) return
    const ev = this.game.pass()
    if (!ev.notation) return
    this.humanMoves++
    this.busy = true
    void this.aiTurn()
  }

  private async aiTurn() {
    const epoch = this.epoch
    if (this.game.status().over || this.game.turn() !== 'ai') {
      this.busy = false
      this.refreshStatus()
      return
    }
    this.busy = true
    boardThinking[this.id] = true
    this.refreshStatus()
    const [ev] = await Promise.all([this.game.aiMove(), sleep(MIN_THINK[this.id])])
    if (epoch !== this.epoch) return
    boardThinking[this.id] = false
    if (ev) {
      this.lastAi = ev.notation
      if (ev.notation !== 'pass') await this.animate(ev, 'ai')
    }
    if (epoch !== this.epoch) return
    this.busy = false
    this.sync(true)
    this.refreshStatus()
  }

  newGame() {
    this.epoch++
    this.game.reset()
    gsap.killTweensOf(this.trail.material)
    boardThinking[this.id] = false
    this.busy = false
    this.lastAi = ''
    this.humanMoves = 0
    this.overAt = 0
    for (const mesh of [...this.pieces.values(), ...this.fallen]) this.root.remove(mesh)
    this.pieces.clear()
    this.fallen = []
    this.graveyard = { human: 0, ai: 0 }
    for (const m of [this.lastFrom, this.lastTo, this.lastStone, this.trail]) m.visible = false
    this.select(null)
    this.sync(true)
    this.refreshStatus()
  }

  /** A new level means a new opponent: swap the engine and start afresh. */
  setLevel(level: Level) {
    if (level === this.level) return
    ;(this.game as { dispose?: () => void }).dispose?.()
    this.level = level
    this.game = makeGame(this.id, level)
    this.newGame()
  }

  /** The short line for the board's strip and the full sentence for the panel. */
  private refreshStatus() {
    const s = this.game.status()
    const thinking = boardThinking[this.id]
    let strip: string
    if (this.mode === 'demo') strip = s.over ? 'demo over · new game soon' : thinking ? 'demo · thinking' : 'demo · sit down to play'
    else if (thinking) strip = 'thinking…'
    else if (s.over) strip = s.winner === 'human' ? 'you win' : s.winner === 'ai' ? 'AI wins' : 'draw'
    else strip = this.lastAi ? `${this.lastAi} · your move` : 'your move'
    boardStatus[this.id] = strip
    const played = this.lastAi && !thinking ? (this.lastAi === 'pass' ? 'The AI passed. ' : `The AI played ${this.lastAi}. `) : ''
    boardMessage[this.id] = thinking ? 'The AI is thinking…' : s.over ? s.text : this.id === 'go' && this.lastAi === 'pass' ? s.text : played + s.text
  }

  // ── Sitting down and walking away ───────────────────────────────────────────

  setActive(active: boolean) {
    window.clearTimeout(this.idleTimer)
    if (active) {
      if (this.mode === 'demo') {
        this.mode = 'play'
        this.newGame()
      }
      this.refreshStatus()
      return
    }
    this.select(null)
    this.hover(null)
    if (this.id !== 'chess' || this.mode !== 'play') return
    // Back to the self-playing demo once the visitor has been away a while
    // (sooner if they never moved or the game is finished).
    const away = this.humanMoves === 0 || this.game.status().over ? 30000 : 180000
    this.idleTimer = window.setTimeout(() => {
      this.mode = 'demo'
      this.newGame()
      this.nextDemoAt = 0
    }, away)
  }

  /** The demo's stand-in for a human: take something if it can, else any legal move. */
  private demoMove(): [Square, Square] | null {
    const ai = new Set(this.game.pieces().filter((p) => p.owner === 'ai').map((p) => `${p.at.x},${p.at.y}`))
    const all: [Square, Square][] = []
    for (const from of this.game.movableFrom()) for (const to of this.game.targets(from)) all.push([from, to])
    const takes = all.filter(([, to]) => ai.has(`${to.x},${to.y}`))
    const pool = takes.length && Math.random() < 0.7 ? takes : all
    return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null
  }

  frame(t: number) {
    const thinking = boardThinking[this.id]
    if (this.id === 'chess') {
      this.scan.visible = thinking
      if (thinking) {
        const phase = (t * 0.7) % 1
        this.scan.position.set(0, LIFT * 3, -HALF + phase * 0.44)
        ;(this.scan.material as MeshBasicMaterial).opacity = 0.5 * Math.sin(Math.PI * phase)
      }
    }
    this.selectMark.scale.setScalar(1 + Math.sin(t * 5) * 0.02)
    if (this.mode !== 'demo' || this.busy) return
    if (this.game.status().over) {
      if (!this.overAt) {
        this.overAt = t
        this.refreshStatus()
      } else if (t - this.overAt > 6) {
        this.newGame()
        this.nextDemoAt = t + 2
      }
      return
    }
    if (t < this.nextDemoAt || this.game.turn() !== 'human') return
    const move = this.demoMove()
    this.nextDemoAt = t + 2.4
    if (!move) return
    const ev = this.game.play(move[0], move[1])
    if (!ev) return
    this.busy = true
    const epoch = this.epoch
    void this.animate(ev, 'human').then(() => (epoch === this.epoch ? this.aiTurn() : undefined))
  }
}

const controllers = new Map<GameId, BoardController>()
let lastCamera: Camera | null = null

/** Dev test hook: what a board's controller thinks is going on. */
export function boardState(id: GameId, at?: { x: number; y: number }) {
  const c = controllers.get(id)
  const canvas = document.querySelector('canvas')
  if (!c || !at || !lastCamera || !canvas) return c?.debug()
  const rect = canvas.getBoundingClientRect()
  const ray = new Raycaster()
  ray.setFromCamera(new Vector2(((at.x - rect.left) / rect.width) * 2 - 1, -((at.y - rect.top) / rect.height) * 2 + 1), lastCamera)
  return { ...c.debug(), pick: c.pick(ray), hits: ray.intersectObject(c.root, true).length }
}

/** Dev test hook: where a board square sits on screen, in client pixels;
 *  `height` aims at a piece's body instead of the square (tall pieces hide squares behind them). */
export function squareOnScreen(id: GameId, s: Square, height = 0) {
  const c = controllers.get(id)
  const canvas = document.querySelector('canvas')
  if (!c || !lastCamera || !canvas) return null
  const p = c.root.localToWorld(squareToLocal(id, s).setY(height)).project(lastCamera)
  const rect = canvas.getBoundingClientRect()
  return { x: rect.left + ((p.x + 1) / 2) * rect.width, y: rect.top + ((1 - p.y) / 2) * rect.height }
}
function controllerFor(id: GameId) {
  let c = controllers.get(id)
  if (!c) {
    c = new BoardController(id)
    controllers.set(id, c)
    boardControls[id] = {
      newGame: () => c?.newGame(),
      pass: () => c?.pass(),
      canPass: () => id === 'go',
      level: () => c?.level ?? 'medium',
      setLevel: (level: Level) => c?.setLevel(level),
    }
  }
  return c
}

hudSlots.game = (id: string) => <GamePanel id={id as GameId} />

function Board({ id, item, surface }: { id: GameId; item: string; surface: number }) {
  const controller = useMemo(() => controllerFor(id), [id])
  const table = itemById.get(item)
  const active = useGame((s) => s.phase === 'inspect' && s.inspectId === id)
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)

  useEffect(() => controller.setActive(active), [controller, active])

  useEffect(() => {
    if (!active) return
    const el = gl.domElement
    const ray = new Raycaster()
    const ndc = new Vector2()
    const pick = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect()
      ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
      ray.setFromCamera(ndc, camera)
      return controller.pick(ray)
    }
    const move = (e: PointerEvent) => controller.hover(pick(e))
    const down = (e: PointerEvent) => {
      if (e.button === 0) controller.click(pick(e))
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerdown', down)
    return () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerdown', down)
      controller.hover(null)
    }
  }, [active, camera, controller, gl])

  useFrame(({ clock }) => controller.frame(clock.elapsedTime))
  useEffect(() => {
    lastCamera = camera
  }, [camera])

  if (!table) return null
  return (
    <group position={table.position} rotation-y={((table.rotY ?? 0) * Math.PI) / 180}>
      <primitive object={controller.root} position-y={surface} />
    </group>
  )
}

export function GameBoards() {
  return (
    <>
      {BOARDS.map((b) => (
        <Board key={b.id} {...b} />
      ))}
    </>
  )
}

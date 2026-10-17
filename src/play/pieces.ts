import {
  BoxGeometry,
  type BufferGeometry,
  Group,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector2,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { GameId, Piece } from '../games'

// Game pieces at real tabletop scale (a 55 mm chess square). Chess pieces are
// turned on a lathe from a profile, as a wood turner would; the knight gets a
// carved head. The AI's pieces carry a thin cyan ring at the base: the board's
// way of saying "this side plays itself".

const SEGMENTS = 28

function lathe(profile: [number, number][]) {
  return new LatheGeometry(profile.map(([r, y]) => new Vector2(r, y)), SEGMENTS)
}

function at<T extends BufferGeometry>(geometry: T, x: number, y: number, z: number, rx = 0) {
  if (rx) geometry.rotateX(rx)
  geometry.translate(x, y, z)
  return geometry
}

const BASE: [number, number][] = [
  [0, 0],
  [0.019, 0],
  [0.019, 0.004],
  [0.0165, 0.0065],
  [0.0145, 0.0095],
  [0.0115, 0.0135],
]

function chessGeometry(kind: string): BufferGeometry {
  switch (kind) {
    case 'p':
      return mergeGeometries([
        lathe([[0, 0], [0.0165, 0], [0.0165, 0.0035], [0.0135, 0.006], [0.0115, 0.009], [0.0075, 0.013], [0.006, 0.022], [0.0095, 0.0235], [0.0095, 0.0255], [0.006, 0.027], [0, 0.027]]),
        at(new SphereGeometry(0.0088, 20, 12), 0, 0.0345, 0),
      ])
    case 'r': {
      const merlons = [0, 1, 2, 3].map((k) => {
        const a = (k * Math.PI) / 2 + Math.PI / 4
        return at(new BoxGeometry(0.0075, 0.0055, 0.0075), Math.cos(a) * 0.0108, 0.0495, Math.sin(a) * 0.0108)
      })
      return mergeGeometries([lathe([...BASE, [0.0105, 0.017], [0.0098, 0.034], [0.0135, 0.037], [0.0145, 0.047], [0.0095, 0.047], [0.0095, 0.043], [0, 0.043]]), ...merlons])
    }
    case 'n': {
      const neck = at(new BoxGeometry(0.0135, 0.03, 0.019), 0, 0.031, -0.002, -0.25)
      const head = at(new BoxGeometry(0.0125, 0.013, 0.03), 0, 0.046, 0.006, 0.42)
      const ears = [-1, 1].map((s) => at(new BoxGeometry(0.003, 0.008, 0.004), s * 0.0038, 0.0545, -0.004))
      const mane = at(new BoxGeometry(0.004, 0.03, 0.006), 0, 0.034, -0.0115, -0.25)
      return mergeGeometries([lathe([...BASE, [0.0105, 0.016], [0.0125, 0.0175], [0.0125, 0.0195], [0, 0.0195]]), neck, head, ...ears, mane])
    }
    case 'b':
      return mergeGeometries([
        lathe([...BASE, [0.0085, 0.02], [0.0072, 0.031], [0.0115, 0.0335], [0.0115, 0.0355], [0.0075, 0.0368], [0.0092, 0.042], [0.0102, 0.0475], [0.0088, 0.0535], [0.0048, 0.0578], [0, 0.0598]]),
        at(new SphereGeometry(0.0032, 12, 8), 0, 0.0618, 0),
      ])
    case 'q': {
      const crown = Array.from({ length: 9 }, (_, k) => {
        const a = (k * 2 * Math.PI) / 9
        return at(new SphereGeometry(0.0022, 8, 6), Math.cos(a) * 0.0118, 0.0612, Math.sin(a) * 0.0118)
      })
      return mergeGeometries([
        lathe([...BASE, [0.0088, 0.022], [0.0074, 0.038], [0.0128, 0.0415], [0.0128, 0.0435], [0.0082, 0.0452], [0.0098, 0.051], [0.0125, 0.0598], [0.0098, 0.0612], [0.0062, 0.0645], [0, 0.066]]),
        at(new SphereGeometry(0.0046, 14, 10), 0, 0.0695, 0),
        ...crown,
      ])
    }
    default:
      return mergeGeometries([
        lathe([...BASE, [0.009, 0.022], [0.0076, 0.04], [0.013, 0.0435], [0.013, 0.0455], [0.0085, 0.0472], [0.0102, 0.053], [0.0128, 0.0615], [0.0112, 0.0638], [0.0068, 0.0662], [0, 0.067]]),
        at(new BoxGeometry(0.0042, 0.0145, 0.0042), 0, 0.0742, 0),
        at(new BoxGeometry(0.0115, 0.0042, 0.0042), 0, 0.0765, 0),
      ])
  }
}

const checkerGeometry = lathe([
  [0, 0],
  [0.0205, 0],
  [0.022, 0.0012],
  [0.022, 0.0068],
  [0.0205, 0.008],
  [0.0165, 0.008],
  [0.0158, 0.0072],
  [0.0118, 0.0072],
  [0.011, 0.008],
  [0, 0.008],
])

export const stoneGeometry = new SphereGeometry(0.0213, 28, 14).scale(1, 0.42, 1).translate(0, 0.0091, 0)
const ringGeometry = new TorusGeometry(0.0182, 0.0011, 8, 40).rotateX(Math.PI / 2).translate(0, 0.0012, 0)
const checkerRingGeometry = new TorusGeometry(0.0138, 0.0009, 8, 40).rotateX(Math.PI / 2).translate(0, 0.0083, 0)

const chessCache = new Map<string, BufferGeometry>()

export const pieceMaterials = {
  ivory: new MeshStandardMaterial({ color: '#efe4cf', roughness: 0.34 }),
  ebony: new MeshStandardMaterial({ color: '#1f1c20', roughness: 0.24, metalness: 0.08 }),
  red: new MeshStandardMaterial({ color: '#a82329', roughness: 0.3 }),
  black: new MeshStandardMaterial({ color: '#19181b', roughness: 0.28 }),
  slate: new MeshStandardMaterial({ color: '#141416', roughness: 0.42 }),
  shell: new MeshStandardMaterial({ color: '#f3f0e8', roughness: 0.22 }),
  aiRing: new MeshStandardMaterial({ color: '#000000', emissive: '#29d3ff', emissiveIntensity: 1.6 }),
  aiRingHot: new MeshStandardMaterial({ color: '#000000', emissive: '#29d3ff', emissiveIntensity: 5 }),
}

/** Height of the piece's top, for lifting and stacking. */
export const KING_STACK = 0.0082

/** A mesh group for one piece. userData.kind lets the board notice a promotion. */
export function makePiece(game: GameId, piece: Piece) {
  const group = new Group()
  group.userData = { id: piece.id, kind: piece.kind, owner: piece.owner }
  const ai = piece.owner === 'ai'
  if (game === 'chess') {
    let geometry = chessCache.get(piece.kind)
    if (!geometry) {
      geometry = chessGeometry(piece.kind)
      chessCache.set(piece.kind, geometry)
    }
    const body = new Mesh(geometry, ai ? pieceMaterials.ebony : pieceMaterials.ivory)
    // Knights look across the board at the other side.
    if (piece.kind === 'n') body.rotation.y = ai ? 0 : Math.PI
    group.add(body)
    if (ai) group.add(new Mesh(ringGeometry, pieceMaterials.aiRing))
  } else if (game === 'checkers') {
    const material = ai ? pieceMaterials.black : pieceMaterials.red
    group.add(new Mesh(checkerGeometry, material))
    if (ai) group.add(new Mesh(checkerRingGeometry, pieceMaterials.aiRing))
    if (piece.kind === 'king') crownChecker(group)
  } else {
    group.add(new Mesh(stoneGeometry, ai ? pieceMaterials.shell : pieceMaterials.slate))
  }
  group.traverse((o) => {
    if (o instanceof Mesh) {
      o.castShadow = true
      o.receiveShadow = true
    }
  })
  return group
}

/** A checkers king: a second disc stacked on the first. */
export function crownChecker(group: Group) {
  if (group.getObjectByName('crown')) return group.getObjectByName('crown')
  const first = group.children[0] as Mesh
  const crown = new Group()
  crown.name = 'crown'
  crown.add(new Mesh(checkerGeometry, first.material))
  if (group.userData.owner === 'ai') crown.add(new Mesh(checkerRingGeometry, pieceMaterials.aiRing))
  crown.position.y = KING_STACK
  crown.traverse((o) => {
    if (o instanceof Mesh) o.castShadow = true
  })
  group.add(crown)
  group.userData.kind = 'king'
  return crown
}

/** Swap a piece's AI ring to the bright one while it moves, and back. */
export function setHot(group: Group, hot: boolean) {
  group.traverse((o) => {
    if (o instanceof Mesh && (o.material === pieceMaterials.aiRing || o.material === pieceMaterials.aiRingHot)) {
      o.material = hot ? pieceMaterials.aiRingHot : pieceMaterials.aiRing
    }
  })
}

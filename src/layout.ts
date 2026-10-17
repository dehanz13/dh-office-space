import { Vector3 } from 'three'
import raw from '../layout/office.json'

// Typed access to layout/office.json, the file Blender also builds from.
// Items and hotspots are written in each item's local frame; everything here
// resolves them to world space once, at start-up.

export type V2 = [number, number]
export type V3 = [number, number, number]

export interface Item {
  id: string
  type: string
  position: V3
  rotY?: number
  size?: number[]
  colliders?: { c: V2; s: V2 }[]
  note?: string
  art?: string
  target?: V3
  sitHeight?: number
  standHeight?: number
  spot?: number
  shelves?: number[]
  groups?: BlindGroup[]
}

export interface BlindGroup {
  id: string
  wall: 'north' | 'west'
  from: number
  to: number
  plate: number
}

export type HotspotKind = 'inspect' | 'desk' | 'switch' | 'game' | 'exercise' | 'desk-button' | 'blinds'

/** Which desk a hotspot rides with when it rises. */
export type DeskId = 'main' | 'lab'

interface ViewDef {
  eye: V3
  look: V3
}

interface HotspotDef {
  id: string
  kind: HotspotKind
  label: string
  item?: string
  anchor: V3
  radius: number
  views?: ViewDef[]
  followsDesk?: DeskId
  desk?: DeskId
}

interface Layout {
  room: { width: number; depth: number; height: number; wallThickness: number }
  spawn: { position: V3; lookAt: V3 }
  items: Item[]
  hotspots: HotspotDef[]
}

export const layout = raw as unknown as Layout

const DEG = Math.PI / 180
export const itemById = new Map(layout.items.map((item) => [item.id, item]))

/** Item-local point -> world. Local +z is the item's front (rotY 0 faces south). */
export function toWorld(item: Item | undefined, p: V3, out = new Vector3()) {
  if (!item) return out.set(p[0], p[1], p[2])
  const t = (item.rotY ?? 0) * DEG
  const c = Math.cos(t)
  const s = Math.sin(t)
  const [x, y, z] = item.position
  return out.set(x + p[0] * c + p[2] * s, y + p[1], z - p[0] * s + p[2] * c)
}

export interface View {
  eye: Vector3
  look: Vector3
}

export interface Hotspot {
  id: string
  kind: HotspotKind
  label: string
  item?: Item
  anchor: Vector3
  radius: number
  views: View[]
  followsDesk: DeskId | null
  desk: DeskId | null
}

export const hotspots: Hotspot[] = layout.hotspots.map((h) => {
  const item = h.item ? itemById.get(h.item) : undefined
  if (h.item && !item) throw new Error(`Hotspot ${h.id} points at missing item ${h.item}`)
  return {
    id: h.id,
    kind: h.kind,
    label: h.label,
    item,
    anchor: toWorld(item, h.anchor),
    radius: h.radius,
    followsDesk: h.followsDesk ?? null,
    desk: h.desk ?? null,
    views: (h.views ?? []).map((v) => ({ eye: toWorld(item, v.eye), look: toWorld(item, v.look) })),
  }
})

export const hotspotById = new Map(hotspots.map((h) => [h.id, h]))

/** An oriented footprint on the floor: centre, half sizes, and the cos/sin of its rotation. */
export interface Footprint {
  x: number
  z: number
  hx: number
  hz: number
  c: number
  s: number
}

export const footprints: Footprint[] = layout.items.flatMap((item) =>
  (item.colliders ?? []).map((col) => {
    const centre = toWorld(item, [col.c[0], 0, col.c[1]])
    const t = (item.rotY ?? 0) * DEG
    return { x: centre.x, z: centre.z, hx: col.s[0] / 2, hz: col.s[1] / 2, c: Math.cos(t), s: Math.sin(t) }
  }),
)

const desk = itemById.get('desk')
export const DESK_SIT = desk?.sitHeight ?? 0.74
export const DESK_LIFT = (desk?.standHeight ?? 1.12) - DESK_SIT

/** The roller blind groups, each covering three panes. */
export const blindGroups: BlindGroup[] = itemById.get('blinds')?.groups ?? []

import { footprints, layout } from '../layout'

// The office floor is flat, so collision is 2D: a circle (the visitor) against
// rotated rectangles (furniture footprints from the layout) plus the room walls.
// No physics engine needed; this runs in microseconds.

export interface Point2 {
  x: number
  z: number
}

const halfW = layout.room.width / 2
const halfD = layout.room.depth / 2

export function collide(p: Point2, radius: number) {
  // A few passes settle corners where two footprints push in different directions.
  for (let pass = 0; pass < 3; pass++) {
    for (const b of footprints) {
      // World -> footprint-local (inverse rotation).
      const dx = p.x - b.x
      const dz = p.z - b.z
      const lx = b.c * dx - b.s * dz
      const lz = b.s * dx + b.c * dz
      // Closest point of the rectangle to the circle centre.
      const qx = Math.max(-b.hx, Math.min(b.hx, lx))
      const qz = Math.max(-b.hz, Math.min(b.hz, lz))
      const ex = lx - qx
      const ez = lz - qz
      const d2 = ex * ex + ez * ez
      if (d2 >= radius * radius) continue
      let mx: number
      let mz: number
      if (d2 > 1e-10) {
        const d = Math.sqrt(d2)
        const k = (radius - d) / d
        mx = ex * k
        mz = ez * k
      } else {
        // Centre is inside the rectangle: leave by the shallowest side.
        const px = b.hx - Math.abs(lx) + radius
        const pz = b.hz - Math.abs(lz) + radius
        if (px < pz) {
          mx = Math.sign(lx || 1) * px
          mz = 0
        } else {
          mx = 0
          mz = Math.sign(lz || 1) * pz
        }
      }
      // Footprint-local push -> world.
      p.x += b.c * mx + b.s * mz
      p.z += -b.s * mx + b.c * mz
    }
  }
  p.x = Math.max(-halfW + radius, Math.min(halfW - radius, p.x))
  p.z = Math.max(-halfD + radius, Math.min(halfD - radius, p.z))
}

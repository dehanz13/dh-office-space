import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three'
import { owner } from '../content'

// Everything drawn onto still surfaces: the brainstorm on the glass, the
// whiteboard, sticky notes, notebook pages, the pin board, art, the rugs, the
// floors, the travertine table top, game boards, clock faces, signs, number
// plates, can labels, blind linen, the motherboard and leaves.
// (Moving screens live in screens.ts.)
// Textures for meshes exported from Blender need flipY = false.

const MARKER = '"Permanent Marker", "Comic Sans MS", cursive'
const SANS = '"Avenir Next", "Segoe UI", system-ui, sans-serif'
const MONO = '"SF Mono", "JetBrains Mono", Menlo, Consolas, monospace'

function surface(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas unavailable')
  return { canvas, ctx }
}

export function toTexture(canvas: HTMLCanvasElement) {
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.flipY = false
  texture.anisotropy = 8
  return texture
}

/** Small deterministic random generator, so drawings look the same every visit. */
export function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Ctx = CanvasRenderingContext2D

// ── Marker on glass ──────────────────────────────────────────────────────────

export class Marker {
  constructor(private ctx: Ctx, private rand: () => number) {}

  colour(c: string) {
    this.ctx.strokeStyle = c
    this.ctx.fillStyle = c
    return this
  }

  line(pts: [number, number][], width = 6) {
    const { ctx, rand } = this
    ctx.lineWidth = width
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    pts.forEach(([x, y], i) => {
      const jx = (rand() - 0.5) * 3
      const jy = (rand() - 0.5) * 3
      if (i === 0) ctx.moveTo(x + jx, y + jy)
      else ctx.lineTo(x + jx, y + jy)
    })
    ctx.stroke()
  }

  seg(x1: number, y1: number, x2: number, y2: number, steps = 8): [number, number][] {
    return Array.from({ length: steps + 1 }, (_, i) => [x1 + ((x2 - x1) * i) / steps, y1 + ((y2 - y1) * i) / steps])
  }

  box(x: number, y: number, w: number, h: number, label: string, size = 34) {
    this.line([...this.seg(x, y, x + w, y), ...this.seg(x + w, y, x + w, y + h), ...this.seg(x + w, y + h, x, y + h), ...this.seg(x, y + h, x, y + 2)])
    this.text(label, x + w / 2, y + h / 2 + 2, size, 'center')
  }

  arrow(x1: number, y1: number, x2: number, y2: number, dashed = false) {
    if (dashed) this.ctx.setLineDash([16, 14])
    this.line(this.seg(x1, y1, x2, y2, 10), 5)
    this.ctx.setLineDash([])
    const a = Math.atan2(y2 - y1, x2 - x1)
    const head = 22
    this.line([[x2 - head * Math.cos(a - 0.45), y2 - head * Math.sin(a - 0.45)], [x2, y2], [x2 - head * Math.cos(a + 0.45), y2 - head * Math.sin(a + 0.45)]], 5)
  }

  text(t: string, x: number, y: number, size = 34, align: CanvasTextAlign = 'left') {
    this.ctx.font = `${size}px ${MARKER}`
    this.ctx.textAlign = align
    this.ctx.textBaseline = 'middle'
    this.ctx.fillText(t, x, y)
  }

  title(t: string, x: number, y: number) {
    this.text(t, x, y, 46)
    const w = this.ctx.measureText(t).width
    this.line(this.seg(x - 4, y + 30, x + w + 8, y + 26, 12), 5)
  }

  circle(x: number, y: number, rx: number, ry: number) {
    this.ctx.lineWidth = 5
    this.ctx.beginPath()
    this.ctx.ellipse(x, y, rx, ry, -0.05, 0, Math.PI * 2)
    this.ctx.stroke()
  }

  cross(x: number, y: number, w: number) {
    this.line([[x - w / 2, y - 8], [x + w / 2, y + 8]], 5)
  }

  sticky(x: number, y: number, text: string, tilt = 0.04) {
    const ctx = this.ctx
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(tilt)
    ctx.fillStyle = '#ffe36e'
    ctx.fillRect(-85, -70, 170, 140)
    ctx.fillStyle = '#2a2414'
    ctx.font = `26px ${MARKER}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    text.split('\n').forEach((l, i, all) => ctx.fillText(l, 0, (i - (all.length - 1) / 2) * 32))
    ctx.restore()
  }
}

const INK = '#16161b'
const BLUE = '#1d4fd8'
const RED = '#d0342c'
const GREEN = '#17925a'

/**
 * The glass behind the desk: a distributed-systems brainstorm on the left
 * panes, then this office, an agent loop and an event pipeline on the right.
 * 7.9 m of glass at about 520 px per metre.
 * PLACEHOLDER: sample diagrams until you send your own (see PLACEHOLDERS.md).
 */
export function paintGlassBoard() {
  const W = 4096
  const H = 804
  const { canvas, ctx } = surface(W, H)
  const m = new Marker(ctx, rng(7))
  const pw = W / 6

  // 1. Consistency and consensus.
  let ox = 40
  m.colour(INK).title('CONSISTENCY?', ox, 70)
  const tri: [number, number][] = [[ox + 150, 170], [ox + 40, 360], [ox + 260, 360]]
  m.line([...m.seg(...tri[0], ...tri[1]), ...m.seg(...tri[1], ...tri[2]), ...m.seg(...tri[2], ...tri[0])])
  m.text('C', tri[0][0], tri[0][1] - 26, 36, 'center')
  m.text('A', tri[1][0] - 22, tri[1][1] + 10, 36, 'center')
  m.text('P', tri[2][0] + 22, tri[2][1] + 10, 36, 'center')
  m.colour(RED).text('pick 2', ox + 150, 300, 28, 'center')
  m.cross(ox + 150, 300, 110)
  m.text('PACELC!', ox + 330, 250, 32)
  m.colour(INK).text('Raft', ox + 30, 450, 38)
  m.box(ox + 200, 430, 130, 70, 'leader', 28)
  ;[0, 1, 2].forEach((i) => {
    m.colour(INK).box(ox + 60 + i * 190, 610, 130, 64, `f${i + 1}`, 28)
    m.colour(BLUE).arrow(ox + 265, 505, ox + 125 + i * 190, 600)
  })
  m.colour(GREEN).text('heartbeat 150ms', ox + 370, 470, 26)
  m.colour(RED).text('term 7', ox + 360, 720, 30)

  // 2. Sharding on a consistent-hash ring.
  ox = pw + 40
  m.colour(INK).title('SHARDING', ox, 70)
  const rcx = ox + 280
  const rcy = 400
  m.circle(rcx, rcy, 190, 190)
  const nodes: [string, number][] = [['A', -1.2], ['B', 0.6], ['C', 2.3]]
  nodes.forEach(([label, a]) => {
    const x = rcx + Math.cos(a) * 190
    const y = rcy + Math.sin(a) * 190
    m.colour(BLUE)
    ctx.beginPath()
    ctx.arc(x, y, 26, 0, Math.PI * 2)
    ctx.fill()
    m.colour('#ffffff').text(label, x, y + 2, 28, 'center')
  })
  ;[-0.5, 1.4, 3.1, 4.4].forEach((a, i) => {
    const x = rcx + Math.cos(a) * 190
    const y = rcy + Math.sin(a) * 190
    m.colour(GREEN).text(`k${i + 1}`, x + Math.cos(a) * 46, y + Math.sin(a) * 46, 26, 'center')
  })
  m.colour(INK).text('vnodes x128', rcx - 90, rcy, 28)
  m.colour(RED).text('rebalance?', ox + 30, 690, 32)
  m.sticky(ox + 560, 220, 'hot keys!\nsplit them', -0.06)

  // 3. Multi-region: Dallas and Jakarta.
  ox = 2 * pw + 30
  m.colour(INK).title('MULTI-REGION', ox, 70)
  m.box(ox, 170, 240, 110, 'us-central', 30)
  m.text('(DFW)', ox + 120, 300, 24, 'center')
  m.box(ox + 380, 170, 240, 110, 'ap-southeast', 30)
  m.text('(JKT)', ox + 500, 300, 24, 'center')
  m.colour(BLUE).arrow(ox + 245, 210, ox + 372, 210)
  m.arrow(ox + 372, 250, ox + 245, 250)
  m.colour(GREEN).text('async ~180ms', ox + 310, 330, 26, 'center')
  m.colour(INK).text('write local, read local', ox + 20, 410, 30)
  m.colour(RED).text('conflict -> LWW?', ox + 20, 470, 30)
  m.cross(ox + 150, 470, 250)
  m.text('CRDTs!', ox + 320, 470, 32)
  m.circle(ox + 362, 470, 78, 34)
  m.colour(INK).text('SAGA', ox + 20, 560, 36)
  const steps = ['reserve', 'charge', 'ship']
  steps.forEach((s, i) => m.colour(INK).box(ox + 20 + i * 205, 600, 170, 60, s, 26))
  m.colour(BLUE).arrow(ox + 192, 630, ox + 222, 630)
  m.arrow(ox + 397, 630, ox + 427, 630)
  m.colour(RED).arrow(ox + 520, 670, ox + 120, 700, true)
  m.text('compensate', ox + 320, 740, 26, 'center')

  // 4. How this office is built.
  ox = 3 * pw + 40
  m.colour(INK).title('THIS OFFICE', ox, 70)
  m.box(ox, 160, 170, 90, 'Blender')
  m.box(ox + 240, 160, 170, 90, 'GLB+bake')
  m.box(ox + 460, 300, 150, 90, 'R3F')
  m.colour(BLUE).arrow(ox + 175, 205, ox + 232, 205)
  m.arrow(ox + 412, 225, ox + 470, 295)
  m.colour(INK).box(ox + 460, 470, 150, 90, 'GSAP')
  m.colour(BLUE).arrow(ox + 535, 465, ox + 535, 398)
  m.colour(RED).text('you ->', ox + 30, 350, 34)
  m.arrow(ox + 150, 345, ox + 450, 345, true)
  m.text('walk + press E', ox + 140, 420, 34)

  // 5. An agent loop.
  ox = 4 * pw + 40
  m.colour(INK).title('AGENT LOOP', ox, 70)
  const cx = ox + 290
  const cy = 420
  const r = 180
  const ring: [string, number][] = [['Plan', -Math.PI / 2], ['Code', 0], ['Test', Math.PI / 2], ['Review', Math.PI]]
  ring.forEach(([label, a]) => m.colour(INK).box(cx + Math.cos(a) * r - 80, cy + Math.sin(a) * r - 42, 160, 84, label, 32))
  for (let i = 0; i < 4; i++) {
    const a1 = ring[i][1] + 0.55
    const a2 = ring[(i + 1) % 4][1] - 0.55
    m.colour(GREEN).arrow(cx + Math.cos(a1) * r * 0.95, cy + Math.sin(a1) * r * 0.95, cx + Math.cos(a2) * r * 0.95, cy + Math.sin(a2) * r * 0.95)
  }
  m.colour(RED).arrow(cx + r + 60, cy - 40, cx + r + 110, cy - 160)
  m.text('ship!', cx + r + 30, cy - 190, 36)

  // 6. An event pipeline.
  ox = 5 * pw + 30
  m.colour(INK).title('EVENT PIPELINE', ox, 70)
  m.box(ox, 170, 140, 84, 'API')
  m.box(ox + 200, 170, 160, 84, 'Queue')
  m.box(ox + 420, 170, 180, 84, 'Workers')
  m.box(ox + 420, 390, 180, 84, 'DB')
  m.box(ox, 390, 140, 84, 'Cache')
  m.colour(BLUE).arrow(ox + 145, 212, ox + 192, 212)
  m.arrow(ox + 365, 212, ox + 412, 212)
  m.arrow(ox + 510, 260, ox + 510, 382)
  m.arrow(ox + 70, 260, ox + 70, 382)
  m.colour(RED).text('retry x3', ox + 440, 140, 30)
  m.circle(ox + 270, 580, 125, 46)
  m.text('p99 < 200ms', ox + 270, 580, 32, 'center')
  m.colour(INK).text('idempotency keys', ox + 20, 690, 28)

  // Brainstorm glue: a question that links the left session to the pipeline.
  m.colour(RED).arrow(2 * pw + 600, 760, 5 * pw + 60, 760, true)
  m.text('back-pressure across regions?', 3.5 * pw, 730, 30, 'center')

  return toTexture(canvas)
}

// ── Sticky notes and signs ───────────────────────────────────────────────────

export function paintNote(text: string) {
  const S = 512
  const { canvas, ctx } = surface(S, S)
  const g = ctx.createLinearGradient(0, 0, 0, S)
  g.addColorStop(0, '#ffe36e')
  g.addColorStop(1, '#f6cf3f')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, S, S)
  ctx.fillStyle = 'rgba(0,0,0,0.06)'
  ctx.fillRect(0, 0, S, 36)
  ctx.fillStyle = '#2a2414'
  ctx.font = `48px ${MARKER}`
  ctx.textBaseline = 'top'
  const lines: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width > S - 70 && line) {
      lines.push(line)
      line = word
    } else line = test
  }
  if (line) lines.push(line)
  const top = (S - lines.length * 60) / 2 + 10
  lines.forEach((l, i) => ctx.fillText(l, 36, top + i * 60))
  return toTexture(canvas)
}

export function paintSign(text: string) {
  const { canvas, ctx } = surface(520, 180)
  ctx.fillStyle = '#f3f1ec'
  ctx.fillRect(0, 0, 520, 180)
  ctx.fillStyle = '#1b1b1f'
  ctx.font = `600 64px ${SANS}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 260, 92)
  return toTexture(canvas)
}

// ── Pin board ────────────────────────────────────────────────────────────────

function pin(ctx: Ctx, x: number, y: number, colour: string) {
  ctx.fillStyle = 'rgba(0,0,0,0.25)'
  ctx.beginPath()
  ctx.ellipse(x + 5, y + 7, 13, 9, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = colour
  ctx.beginPath()
  ctx.arc(x, y, 13, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.beginPath()
  ctx.arc(x - 4, y - 4, 4, 0, Math.PI * 2)
  ctx.fill()
}

function card(ctx: Ctx, x: number, y: number, w: number, h: number, tilt: number, draw: () => void, pinColour: string) {
  ctx.save()
  ctx.translate(x + w / 2, y + h / 2)
  ctx.rotate(tilt)
  ctx.fillStyle = 'rgba(0,0,0,0.22)'
  ctx.fillRect(-w / 2 + 8, -h / 2 + 10, w, h)
  ctx.fillStyle = '#fbf8f1'
  ctx.fillRect(-w / 2, -h / 2, w, h)
  ctx.translate(-w / 2, -h / 2)
  draw()
  ctx.restore()
  pin(ctx, x + w / 2, y + 16, pinColour)
}

/** The "About me" board. Content comes from src/content.ts. */
export function paintPinBoard(photos: (HTMLImageElement | null)[] = []) {
  const W = 1800
  const H = 1165
  const { canvas, ctx } = surface(W, H)
  ctx.fillStyle = '#b58a5c'
  ctx.fillRect(0, 0, W, H)
  const rand = rng(11)
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle = rand() > 0.5 ? 'rgba(80,50,25,0.18)' : 'rgba(240,210,170,0.16)'
    ctx.fillRect(rand() * W, rand() * H, 2 + rand() * 3, 2 + rand() * 3)
  }
  const heading = (text: string, y: number) => {
    ctx.fillStyle = '#1d1d22'
    ctx.font = `600 34px ${SANS}`
    ctx.textAlign = 'left'
    ctx.fillText(text, 30, y)
  }
  const body = (lines: string[], y: number, size = 26) => {
    ctx.fillStyle = '#35353d'
    ctx.font = `${size}px ${SANS}`
    lines.forEach((line, i) => ctx.fillText(line, 30, y + i * (size + 12)))
  }
  card(ctx, 70, 70, 560, 300, -0.02, () => {
    ctx.fillStyle = '#16161b'
    ctx.font = `800 88px ${SANS}`
    ctx.fillText(owner.name.toUpperCase(), 30, 130)
    body([owner.role, owner.location], 190, 30)
  }, '#d33b33')
  card(ctx, 690, 60, 520, 470, 0.015, () => {
    heading('Experience', 70)
    body(owner.experience.flatMap((e) => [e.title, `   ${e.where} · ${e.when}`]), 120)
  }, '#2b5bd7')
  card(ctx, 1270, 90, 460, 400, -0.025, () => {
    heading('Skills', 70)
    let x = 30
    let y = 110
    ctx.font = `24px ${SANS}`
    for (const skill of owner.skills) {
      const w = ctx.measureText(skill).width + 32
      if (x + w > 430) {
        x = 30
        y += 56
      }
      ctx.fillStyle = '#e9e2d3'
      ctx.beginPath()
      ctx.roundRect(x, y, w, 42, 21)
      ctx.fill()
      ctx.fillStyle = '#2a2a30'
      ctx.fillText(skill, x + 16, y + 29)
      x += w + 10
    }
  }, '#f2b632')
  card(ctx, 90, 450, 470, 240, 0.02, () => {
    heading('Education', 70)
    body(owner.education, 120)
  }, '#2b5bd7')
  card(ctx, 90, 760, 470, 300, -0.015, () => {
    heading('Now building', 70)
    body(owner.nowBuilding, 120)
  }, '#22a06b')
  const slots: [number, number, number][] = [[660, 600, 0.04], [1010, 640, -0.03], [1360, 580, 0.02]]
  slots.forEach(([x, y, tilt], i) => {
    card(ctx, x, y, 300, 360, tilt, () => {
      const photo = photos[i]
      if (photo) {
        const s = Math.max(260 / photo.width, 260 / photo.height)
        ctx.save()
        ctx.beginPath()
        ctx.rect(20, 20, 260, 260)
        ctx.clip()
        ctx.drawImage(photo, 150 - (photo.width * s) / 2, 150 - (photo.height * s) / 2, photo.width * s, photo.height * s)
        ctx.restore()
      } else {
        ctx.fillStyle = '#d9d4ca'
        ctx.fillRect(20, 20, 260, 260)
        ctx.fillStyle = '#a9a294'
        ctx.font = `24px ${SANS}`
        ctx.textAlign = 'center'
        ctx.fillText('your photo', 150, 160)
      }
      ctx.fillStyle = '#35353d'
      ctx.font = `26px ${MARKER}`
      ctx.textAlign = 'center'
      ctx.fillText(owner.photos[i]?.caption ?? '', 150, 325)
    }, ['#d33b33', '#22a06b', '#f2b632'][i])
  })
  return toTexture(canvas)
}

// ── Art: four freely licensed works (credits in public/art/CREDITS.md) ──────

const ARTWORKS: Record<string, { src: string; photo?: boolean }> = {
  voyage: { src: '/art/voyage.jpg' },
  adulthood: { src: '/art/adulthood.jpg' },
  buddha: { src: '/art/buddha.jpg' },
  jobs: { src: '/art/jobs.jpg', photo: true },
}

/** Black and white with a print's contrast: an S-curve on luminance, a little grain. */
function toBlackAndWhite(ctx: Ctx, x: number, y: number, w: number, h: number) {
  const image = ctx.getImageData(x, y, w, h)
  const d = image.data
  const rand = rng(17)
  for (let i = 0; i < d.length; i += 4) {
    // Lift the shadows first: the original is a dark suit on deep red.
    const l = Math.pow((0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255, 0.68)
    const s = l < 0.5 ? 2 * l * l : 1 - 2 * (1 - l) * (1 - l)
    const v = Math.max(0, Math.min(255, (0.35 * l + 0.65 * s) * 255 + (rand() - 0.5) * 10))
    d[i] = d[i + 1] = d[i + 2] = v
  }
  ctx.putImageData(image, x, y)
}

/** A painting fills its frame edge to edge; a photograph gets a white mat. The
 *  picture is cropped to the frame's proportions and arrives when it has loaded. */
export function paintArtwork(key: string, widthM: number, heightM: number) {
  const W = widthM >= heightM ? 2000 : 1200
  const H = Math.round((W * heightM) / widthM)
  const { canvas, ctx } = surface(W, H)
  const art = ARTWORKS[key]
  ctx.fillStyle = art?.photo ? '#f4f2ec' : '#cfc6b4'
  ctx.fillRect(0, 0, W, H)
  const texture = toTexture(canvas)
  if (!art) return texture
  const img = new Image()
  img.onload = () => {
    const mat = art.photo ? Math.round(W * 0.09) : 0
    const bw = W - 2 * mat
    const bh = H - 2 * mat
    const s = Math.max(bw / img.width, bh / img.height)
    const dw = img.width * s
    const dh = img.height * s
    ctx.save()
    ctx.beginPath()
    ctx.rect(mat, mat, bw, bh)
    ctx.clip()
    ctx.drawImage(img, mat + (bw - dw) / 2, mat + (bh - dh) / 2, dw, dh)
    ctx.restore()
    if (art.photo) {
      toBlackAndWhite(ctx, mat, mat, bw, bh)
      // The mat's bevelled inner edge.
      ctx.strokeStyle = 'rgba(0,0,0,0.18)'
      ctx.lineWidth = 3
      ctx.strokeRect(mat - 2, mat - 2, bw + 4, bh + 4)
    } else {
      // Varnish and canvas weave, very faint.
      const rand = rng(key.length * 13)
      for (let i = 0; i < 30000; i++) {
        ctx.fillStyle = `rgba(${rand() < 0.5 ? '255,250,235' : '20,15,10'},${rand() * 0.035})`
        ctx.fillRect(rand() * W, rand() * H, 2, 2)
      }
    }
    texture.needsUpdate = true
  }
  img.src = art.src
  return texture
}

// ── Rug: a Persian carpet ───────────────────────────────────────────────────

const RUG = { red: '#7a1c1f', redDeep: '#5e1316', indigo: '#1b2142', ivory: '#e9dcc0', gold: '#c99a45', green: '#3f5a3c', rust: '#a8452a', sky: '#5d7fa8' }

function lobed(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, lobes: number, depth: number) {
  ctx.beginPath()
  for (let i = 0; i <= 360; i++) {
    const a = (i / 360) * Math.PI * 2
    const k = 1 - depth * Math.pow(Math.abs(Math.sin((a * lobes) / 2)), 0.6)
    const x = cx + Math.cos(a) * rx * k
    const y = cy + Math.sin(a) * ry * k
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
}

function rosette(ctx: Ctx, x: number, y: number, r: number, petals: number, outer: string, inner: string, heart: string) {
  ctx.fillStyle = outer
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * Math.PI * 2
    ctx.beginPath()
    ctx.ellipse(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.48, r * 0.24, a, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = inner
  ctx.beginPath()
  ctx.arc(x, y, r * 0.38, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = heart
  ctx.beginPath()
  ctx.arc(x, y, r * 0.16, 0, Math.PI * 2)
  ctx.fill()
}

function leafMotif(ctx: Ctx, x: number, y: number, size: number, angle: number, colour: string) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  ctx.fillStyle = colour
  ctx.beginPath()
  ctx.moveTo(0, -size)
  ctx.quadraticCurveTo(size * 0.55, 0, 0, size)
  ctx.quadraticCurveTo(-size * 0.55, 0, 0, -size)
  ctx.fill()
  ctx.restore()
}

/** A hand-knotted Persian rug: crimson field of small flowers on a vine lattice, a
 *  lobed indigo medallion with pendants, corner pieces, a wide indigo border of
 *  rosettes between guard stripes, and the wool's own unevenness. Symmetric both ways. */
export function paintPersianRug(widthM = 4.6, depthM = 3.6) {
  const W = 2048
  const H = Math.round((W * depthM) / widthM)
  const { canvas, ctx } = surface(W, H)
  const rand = rng(71)
  // Field, with abrash: bands where a new dye lot began.
  ctx.fillStyle = RUG.red
  ctx.fillRect(0, 0, W, H)
  for (let i = 0; i < 9; i++) {
    const x = rand() * W
    ctx.fillStyle = `rgba(${rand() < 0.5 ? '40,5,8' : '150,50,40'},${0.06 + rand() * 0.06})`
    ctx.fillRect(x, 0, 30 + rand() * 120, H)
  }
  const border = H * 0.13
  const fx0 = border
  const fy0 = border
  const fx1 = W - border
  const fy1 = H - border
  const cx = W / 2
  const cy = H / 2
  // Field lattice: diamonds of vine with a flower at every crossing.
  ctx.save()
  ctx.beginPath()
  ctx.rect(fx0, fy0, fx1 - fx0, fy1 - fy0)
  ctx.clip()
  const step = 74
  ctx.strokeStyle = 'rgba(233,220,192,0.35)'
  ctx.lineWidth = 3
  for (let k = -40; k < 40; k++) {
    ctx.beginPath()
    ctx.moveTo(cx + k * step - H, cy - H)
    ctx.lineTo(cx + k * step + H, cy + H)
    ctx.moveTo(cx + k * step + H, cy - H)
    ctx.lineTo(cx + k * step - H, cy + H)
    ctx.stroke()
  }
  for (let i = -16; i <= 16; i++) {
    for (let j = -12; j <= 12; j++) {
      const x = cx + i * step
      const y = cy + j * step
      if ((i + j) % 2 !== 0) continue
      const pick = (Math.abs(i * 7 + j * 3) % 4)
      if (pick === 0) rosette(ctx, x, y, 22, 8, RUG.ivory, RUG.indigo, RUG.gold)
      else if (pick === 1) rosette(ctx, x, y, 18, 6, RUG.gold, RUG.redDeep, RUG.ivory)
      else if (pick === 2) {
        for (let q = 0; q < 4; q++) leafMotif(ctx, x, y, 16, (q * Math.PI) / 2 + Math.PI / 4, q % 2 ? RUG.green : RUG.sky)
        ctx.fillStyle = RUG.ivory
        ctx.beginPath()
        ctx.arc(x, y, 6, 0, Math.PI * 2)
        ctx.fill()
      } else rosette(ctx, x, y, 15, 5, RUG.indigo, RUG.ivory, RUG.rust)
    }
  }
  // Corner pieces: quarter medallions in indigo.
  for (const [qx, qy] of [[fx0, fy0], [fx1, fy0], [fx0, fy1], [fx1, fy1]]) {
    ctx.fillStyle = RUG.indigo
    lobed(ctx, qx, qy, 300, 240, 10, 0.12)
    ctx.fill()
    ctx.strokeStyle = RUG.ivory
    ctx.lineWidth = 5
    ctx.stroke()
    ctx.fillStyle = RUG.redDeep
    lobed(ctx, qx, qy, 190, 150, 8, 0.15)
    ctx.fill()
    rosette(ctx, qx + (qx < cx ? 110 : -110), qy + (qy < cy ? 80 : -80), 30, 8, RUG.ivory, RUG.indigo, RUG.gold)
  }
  ctx.restore()
  // The medallion: lobed layers, pendants at both ends, a rosette at the heart.
  for (const s of [-1, 1]) {
    ctx.fillStyle = RUG.indigo
    lobed(ctx, cx + s * 470, cy, 110, 80, 8, 0.14)
    ctx.fill()
    ctx.strokeStyle = RUG.ivory
    ctx.lineWidth = 5
    ctx.stroke()
    rosette(ctx, cx + s * 470, cy, 46, 8, RUG.gold, RUG.redDeep, RUG.ivory)
    ctx.fillStyle = RUG.ivory
    ctx.fillRect(cx + s * 370 - 6, cy - 6, 12, 12)
  }
  const layers: [number, number, number, number, string][] = [
    [440, 330, 16, 0.1, RUG.indigo],
    [395, 292, 16, 0.12, RUG.ivory],
    [350, 255, 12, 0.14, RUG.red],
    [250, 180, 12, 0.16, RUG.indigo],
    [150, 108, 8, 0.18, RUG.gold],
  ]
  for (const [rx, ry, lobes, depth, colour] of layers) {
    ctx.fillStyle = colour
    lobed(ctx, cx, cy, rx, ry, lobes, depth)
    ctx.fill()
  }
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2
    leafMotif(ctx, cx + Math.cos(a) * 300, cy + Math.sin(a) * 222, 22, a + Math.PI / 2, i % 2 ? RUG.gold : RUG.green)
    rosette(ctx, cx + Math.cos(a + 0.2) * 200, cy + Math.sin(a + 0.2) * 145, 14, 6, RUG.ivory, RUG.rust, RUG.indigo)
  }
  rosette(ctx, cx, cy, 70, 12, RUG.redDeep, RUG.ivory, RUG.indigo)
  rosette(ctx, cx, cy, 30, 8, RUG.gold, RUG.indigo, RUG.ivory)
  // Border: indigo band of rosettes and leaves between ivory guard stripes.
  ctx.fillStyle = RUG.indigo
  ctx.fillRect(0, 0, W, border)
  ctx.fillRect(0, H - border, W, border)
  ctx.fillRect(0, 0, border, H)
  ctx.fillRect(W - border, 0, border, H)
  const mid = border / 2
  const along = (x0: number, y0: number, x1: number, y1: number, gap: number) => {
    const n = Math.floor(Math.hypot(x1 - x0, y1 - y0) / gap)
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n
      const y = y0 + ((y1 - y0) * i) / n
      if (i % 2 === 0) rosette(ctx, x, y, 34, 8, RUG.rust, RUG.ivory, RUG.indigo)
      else {
        leafMotif(ctx, x, y, 26, Math.atan2(y1 - y0, x1 - x0) + Math.PI / 2, RUG.gold)
        leafMotif(ctx, x, y, 18, Math.atan2(y1 - y0, x1 - x0), RUG.green)
      }
    }
  }
  along(mid, mid, W - mid, mid, 92)
  along(mid, H - mid, W - mid, H - mid, 92)
  along(mid, mid, mid, H - mid, 92)
  along(W - mid, mid, W - mid, H - mid, 92)
  for (const [inset, width, colour] of [[10, 10, RUG.ivory], [border - 26, 8, RUG.gold], [border - 10, 10, RUG.ivory], [border + 4, 5, RUG.indigo]] as const) {
    ctx.strokeStyle = colour
    ctx.lineWidth = width
    ctx.strokeRect(inset, inset, W - inset * 2, H - inset * 2)
  }
  // Guard stripe with little reciprocal triangles.
  ctx.fillStyle = RUG.red
  for (let x = 30; x < W - 30; x += 24) {
    for (const y of [26, H - 26]) {
      ctx.beginPath()
      ctx.moveTo(x, y - 7)
      ctx.lineTo(x + 12, y + 7)
      ctx.lineTo(x - 12, y + 7)
      ctx.fill()
    }
  }
  // Wool: knots, a pile direction, and gentle wear in the middle.
  for (let i = 0; i < 120000; i++) {
    ctx.fillStyle = `rgba(${rand() < 0.5 ? '0,0,0' : '255,240,220'},${0.03 + rand() * 0.045})`
    ctx.fillRect(rand() * W, rand() * H, 2, 3)
  }
  const wear = ctx.createRadialGradient(cx, cy, 50, cx, cy, W * 0.45)
  wear.addColorStop(0, 'rgba(255,235,210,0.07)')
  wear.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = wear
  ctx.fillRect(0, 0, W, H)
  return toTexture(canvas)
}

// ── Floors: oak planks, and the kitchen's large porcelain tiles ──────────────

/** Metres of floor one copy of the plank texture covers (25 rows of 192 mm planks). */
export const FLOOR_TILE_M = 4.8

/** Wide oak planks running east-west, each its own shade, with grain and seams.
 *  Planks that run off one edge continue on the other, so the texture tiles. */
export function paintFloor() {
  const S = 2048
  const { canvas, ctx } = surface(S, S)
  const rand = rng(23)
  const rows = 25
  const rowH = S / rows
  const pxPerM = S / FLOOR_TILE_M
  for (let r = 0; r < rows; r++) {
    const y = r * rowH
    let x = rand() * S
    const end = x + S
    while (x < end) {
      const len = Math.min((1.1 + rand() * 1.3) * pxPerM, end - x)
      const tone = 0.9 + rand() * 0.2
      const warm = rand()
      const base = [176 * tone, 136 * tone - warm * 6, 96 * tone - warm * 10]
      for (const shift of [0, -S]) {
        const px = x + shift
        if (px > S || px + len < 0) continue
        ctx.fillStyle = `rgb(${base.map((v) => Math.round(v)).join(',')})`
        ctx.fillRect(px, y, len, rowH)
        // Grain: long, slightly wavy strokes along the plank.
        ctx.save()
        ctx.beginPath()
        ctx.rect(px, y, len, rowH)
        ctx.clip()
        const g = rng(Math.floor(x * 7 + r * 131))
        for (let k = 0; k < 9; k++) {
          const gy = y + g() * rowH
          ctx.strokeStyle = `rgba(${g() < 0.5 ? '90,62,38' : '215,185,145'},${0.08 + g() * 0.12})`
          ctx.lineWidth = 0.8 + g() * 1.6
          ctx.beginPath()
          ctx.moveTo(px, gy)
          for (let sx = 0; sx <= len; sx += 60) ctx.lineTo(px + sx, gy + Math.sin(sx * 0.01 + g() * 6) * 2.5)
          ctx.stroke()
        }
        if (g() < 0.25) {
          // The odd knot.
          ctx.fillStyle = 'rgba(95,62,36,0.35)'
          ctx.beginPath()
          ctx.ellipse(px + g() * len, y + rowH * (0.3 + g() * 0.4), 9 + g() * 8, 4 + g() * 3, 0, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.restore()
        // End seam.
        ctx.fillStyle = 'rgba(60,42,28,0.55)'
        ctx.fillRect(px + len - 1.5, y, 1.5, rowH)
      }
      x += len
    }
    // Long seam between rows.
    ctx.fillStyle = 'rgba(55,38,25,0.5)'
    ctx.fillRect(0, y, S, 1.5)
  }
  const texture = toTexture(canvas)
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.anisotropy = 16
  return texture
}

/** The game lounge rug: slate wool with a two-line cream border. */
export function paintGameRug(widthM: number, depthM: number) {
  const W = 2048
  const H = Math.round((W * depthM) / widthM)
  const { canvas, ctx } = surface(W, H)
  ctx.fillStyle = '#2d3238'
  ctx.fillRect(0, 0, W, H)
  const rand = rng(41)
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle = `rgba(${rand() < 0.5 ? '255,255,255' : '0,0,0'},${0.025 + rand() * 0.03})`
    ctx.fillRect(rand() * W, rand() * H, 2, 2 + rand() * 3)
  }
  const m = W / widthM
  ctx.strokeStyle = '#c9b48f'
  ctx.lineWidth = 0.03 * m
  ctx.strokeRect(0.16 * m, 0.16 * m, W - 0.32 * m, H - 0.32 * m)
  ctx.lineWidth = 0.012 * m
  ctx.strokeRect(0.24 * m, 0.24 * m, W - 0.48 * m, H - 0.48 * m)
  return toTexture(canvas)
}

export function paintTile() {
  const S = 512
  const { canvas, ctx } = surface(S, S)
  ctx.fillStyle = '#d6d3cc'
  ctx.fillRect(0, 0, S, S)
  const rand = rng(5)
  ctx.strokeStyle = 'rgba(150,145,138,0.35)'
  ctx.lineWidth = 2
  for (let i = 0; i < 5; i++) {
    ctx.beginPath()
    let x = rand() * S
    let y = 0
    ctx.moveTo(x, y)
    while (y < S) {
      x += (rand() - 0.5) * 40
      y += 30 + rand() * 30
      ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
  ctx.strokeStyle = '#a7a39a'
  ctx.lineWidth = 4
  ctx.strokeRect(0, 0, S, S)
  const texture = toTexture(canvas)
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  return texture
}

// ── Game boards ──────────────────────────────────────────────────────────────

export function paintBoard(game: string) {
  const S = 1024
  const { canvas, ctx } = surface(S, S)
  if (game === 'go') {
    ctx.fillStyle = '#d6a95e'
    ctx.fillRect(0, 0, S, S)
    const rand = rng(17)
    ctx.strokeStyle = 'rgba(120,80,30,0.18)'
    for (let i = 0; i < 70; i++) {
      ctx.lineWidth = 1 + rand() * 2
      ctx.beginPath()
      const y = rand() * S
      ctx.moveTo(0, y)
      ctx.bezierCurveTo(S * 0.3, y + 10, S * 0.7, y - 10, S, y + (rand() - 0.5) * 20)
      ctx.stroke()
    }
    const n = 9
    const m = S * 0.06
    const step = (S - 2 * m) / (n - 1)
    ctx.strokeStyle = '#1a1208'
    ctx.lineWidth = 3
    for (let i = 0; i < n; i++) {
      ctx.beginPath()
      ctx.moveTo(m + i * step, m)
      ctx.lineTo(m + i * step, S - m)
      ctx.moveTo(m, m + i * step)
      ctx.lineTo(S - m, m + i * step)
      ctx.stroke()
    }
    ctx.fillStyle = '#1a1208'
    for (const [x, y] of [[2, 2], [6, 2], [4, 4], [2, 6], [6, 6]]) {
      ctx.beginPath()
      ctx.arc(m + x * step, m + y * step, 9, 0, Math.PI * 2)
      ctx.fill()
    }
  } else {
    const light = game === 'chess' ? '#e9dcc0' : '#efe3c6'
    const dark = game === 'chess' ? '#5d3d26' : '#2f5a3e'
    const step = S / 8
    // Canvas row 0 lands on the AI's side, so the human's rank r is row 7 - r.
    // Their bottom-left square (a1, and checkers' first playable square) is dark.
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        ctx.fillStyle = (x + 7 - y) % 2 ? light : dark
        ctx.fillRect(x * step, y * step, step, step)
      }
    }
    if (game === 'chess') {
      // A faint circuit trace under the squares: this board plays back.
      ctx.strokeStyle = 'rgba(41,211,255,0.16)'
      ctx.lineWidth = 3
      for (let i = 1; i < 8; i++) {
        ctx.beginPath()
        ctx.moveTo(i * step, 0)
        ctx.lineTo(i * step, S)
        ctx.moveTo(0, i * step)
        ctx.lineTo(S, i * step)
        ctx.stroke()
      }
    }
  }
  return toTexture(canvas)
}

// ── Chair mesh: a fine weave you can see through ─────────────────────────────

export function paintChairMesh() {
  const S = 256
  const { canvas, ctx } = surface(S, S)
  ctx.clearRect(0, 0, S, S)
  ctx.strokeStyle = '#141518'
  ctx.lineWidth = 3
  for (let i = 0; i <= S; i += 8) {
    ctx.beginPath()
    ctx.moveTo(i, 0)
    ctx.lineTo(i, S)
    ctx.stroke()
  }
  ctx.lineWidth = 2
  for (let i = 0; i <= S; i += 6) {
    ctx.beginPath()
    ctx.moveTo(0, i)
    ctx.lineTo(S, i)
    ctx.stroke()
  }
  const texture = toTexture(canvas)
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.repeat.set(6, 8)
  return texture
}

// ── Treadmill belt ───────────────────────────────────────────────────────────

export function paintBelt() {
  const { canvas, ctx } = surface(128, 512)
  ctx.fillStyle = '#16171a'
  ctx.fillRect(0, 0, 128, 512)
  ctx.fillStyle = '#202227'
  for (let y = 0; y < 512; y += 16) ctx.fillRect(0, y, 128, 5)
  const texture = toTexture(canvas)
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.repeat.set(1, 4)
  return texture
}

// ── Clock faces and labels ───────────────────────────────────────────────────

export function paintClockFace(city: string) {
  const S = 1024
  const { canvas, ctx } = surface(S, S)
  const c = S / 2
  ctx.fillStyle = '#f6f3ec'
  ctx.fillRect(0, 0, S, S)
  ctx.strokeStyle = '#141416'
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2
    const major = i % 5 === 0
    ctx.lineWidth = major ? 22 : 7
    const r0 = major ? c * 0.8 : c * 0.89
    ctx.beginPath()
    ctx.moveTo(c + Math.sin(a) * r0, c - Math.cos(a) * r0)
    ctx.lineTo(c + Math.sin(a) * c * 0.96, c - Math.cos(a) * c * 0.96)
    ctx.stroke()
  }
  // Big numerals, readable from across the kitchen.
  ctx.fillStyle = '#141416'
  ctx.font = `700 118px ${SANS}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let h = 1; h <= 12; h++) {
    const a = (h / 12) * Math.PI * 2
    ctx.fillText(String(h), c + Math.sin(a) * c * 0.62, c - Math.cos(a) * c * 0.62 + 6)
  }
  ctx.fillStyle = '#c4502c'
  ctx.font = `700 62px ${SANS}`
  ctx.fillText(city.toUpperCase(), c, c * 1.36)
  return toTexture(canvas)
}

export function paintClockLabel(city: string, time: string) {
  const W = 872
  const H = 160
  const { canvas, ctx } = surface(W, H)
  ctx.fillStyle = '#141416'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#f4f1ea'
  ctx.font = `700 70px ${SANS}`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(city, 36, 84)
  ctx.font = `700 74px ${MONO}`
  ctx.textAlign = 'right'
  ctx.fillStyle = '#ffb35c'
  ctx.fillText(time, W - 34, 86)
  return toTexture(canvas)
}

/** The number plate on a coming-soon spot: say "#3" instead of "the one by the sofa". */
export function paintSpotNumber(n: number) {
  const W = 640
  const H = 280
  const { canvas, ctx } = surface(W, H)
  ctx.fillStyle = '#fbfaf6'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#f6c945'
  ctx.fillRect(0, 0, 26, H)
  ctx.fillStyle = '#2a2414'
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.font = `700 42px ${SANS}`
  ctx.fillText('COMING SOON', 64, 62)
  ctx.font = `800 170px ${SANS}`
  ctx.fillText(`#${n}`, 58, 184)
  ctx.font = `46px ${MARKER}`
  ctx.fillStyle = '#7a6a3a'
  ctx.textAlign = 'right'
  ctx.fillText('spot', W - 40, 200)
  return toTexture(canvas)
}

/** Honed travertine for the round coffee table: soft banding and open pores. */
export function paintTravertine() {
  const S = 2048
  const { canvas, ctx } = surface(S, S)
  ctx.fillStyle = '#d8ccb4'
  ctx.fillRect(0, 0, S, S)
  const rand = rng(83)
  for (let i = 0; i < 70; i++) {
    const y = rand() * S
    const h = 6 + rand() * 60
    ctx.fillStyle = rand() < 0.5 ? `rgba(196,176,140,${0.18 + rand() * 0.25})` : `rgba(236,228,212,${0.2 + rand() * 0.3})`
    ctx.beginPath()
    ctx.moveTo(0, y)
    for (let x = 0; x <= S; x += 64) ctx.lineTo(x, y + Math.sin(x * 0.004 + i) * 14)
    for (let x = S; x >= 0; x -= 64) ctx.lineTo(x, y + h + Math.sin(x * 0.004 + i * 1.3) * 14)
    ctx.closePath()
    ctx.fill()
  }
  for (let i = 0; i < 900; i++) {
    const w = 3 + rand() * 18
    ctx.fillStyle = `rgba(150,128,96,${0.25 + rand() * 0.35})`
    ctx.beginPath()
    ctx.ellipse(rand() * S, rand() * S, w, 1.5 + rand() * 3, (rand() - 0.5) * 0.12, 0, Math.PI * 2)
    ctx.fill()
  }
  return toTexture(canvas)
}

/** A slim energy-drink can: silver with a flavour colour sweep and the name
 *  running up the side in a plain bold face. */
export function paintCanLabel(colour: string) {
  const W = 512
  const H = 512
  const { canvas, ctx } = surface(W, H)
  const metal = ctx.createLinearGradient(0, 0, W, 0)
  for (const [t, c] of [[0, '#c9ced4'], [0.25, '#f4f6f8'], [0.5, '#dfe3e7'], [0.75, '#f7f8fa'], [1, '#c9ced4']] as const) metal.addColorStop(t, c)
  ctx.fillStyle = metal
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = colour
  ctx.beginPath()
  ctx.moveTo(0, H * 0.62)
  ctx.bezierCurveTo(W * 0.3, H * 0.5, W * 0.6, H * 0.78, W, H * 0.6)
  ctx.lineTo(W, H)
  ctx.lineTo(0, H)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#9aa1a8'
  ctx.fillRect(0, 0, W, 16)
  ctx.fillRect(0, H - 16, W, 16)
  // The wordmark runs up the can, centred on the label's middle (u = 0.5).
  ctx.save()
  ctx.translate(W / 2, H * 0.47)
  ctx.rotate(-Math.PI / 2)
  ctx.fillStyle = '#111827'
  ctx.font = `900 84px ${SANS}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('CELSIUS', 0, 0)
  ctx.restore()
  return toTexture(canvas)
}

/** Linen for the roller blinds: a fine, slightly uneven weave. */
export function paintLinen() {
  const S = 256
  const { canvas, ctx } = surface(S, S)
  ctx.fillStyle = '#dcd6cb'
  ctx.fillRect(0, 0, S, S)
  const rand = rng(97)
  for (let i = 0; i < S; i += 3) {
    ctx.fillStyle = `rgba(150,140,125,${0.12 + rand() * 0.12})`
    ctx.fillRect(0, i, S, 1)
    ctx.fillStyle = `rgba(255,255,255,${0.08 + rand() * 0.1})`
    ctx.fillRect(i, 0, 1, S)
  }
  const texture = toTexture(canvas)
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  return texture
}

// ── Whiteboard: maths and physics in marker ─────────────────────────────────

/** Text with ^{superscripts}, _{subscripts} and √{roots}, in the marker hand. */
function equation(ctx: Ctx, text: string, x: number, y: number, size: number, colour: string) {
  ctx.fillStyle = colour
  ctx.strokeStyle = colour
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  let cx = x
  const re = /(\^\{[^}]*\}|_\{[^}]*\}|√\{[^}]*\})/g
  for (const part of text.split(re)) {
    if (!part) continue
    if (part.startsWith('^{') || part.startsWith('_{')) {
      const small = size * 0.6
      ctx.font = `${small}px ${MARKER}`
      const dy = part[0] === '^' ? -size * 0.45 : size * 0.22
      ctx.fillText(part.slice(2, -1), cx, y + dy)
      cx += ctx.measureText(part.slice(2, -1)).width + 2
    } else if (part.startsWith('√{')) {
      ctx.font = `${size}px ${MARKER}`
      const inner = part.slice(2, -1)
      const w = ctx.measureText(inner).width
      ctx.lineWidth = Math.max(3, size * 0.07)
      ctx.beginPath()
      ctx.moveTo(cx, y - size * 0.35)
      ctx.lineTo(cx + size * 0.15, y)
      ctx.lineTo(cx + size * 0.32, y - size * 0.95)
      ctx.lineTo(cx + size * 0.4 + w + 6, y - size * 0.95)
      ctx.stroke()
      ctx.fillText(inner, cx + size * 0.38, y)
      cx += size * 0.4 + w + 10
    } else {
      ctx.font = `${size}px ${MARKER}`
      ctx.fillText(part, cx, y)
      cx += ctx.measureText(part).width
    }
  }
  return cx
}

/** The rolling whiteboard by the desk: mechanics on the left, Maxwell in the middle,
 *  quantum and a few favourite identities on the right. 1280 px per metre. */
export function paintWhiteboard(widthM = 1.6, heightM = 1.0) {
  const W = 2048
  const H = Math.round((W * heightM) / widthM)
  const { canvas, ctx } = surface(W, H)
  ctx.fillStyle = '#f7f8f8'
  ctx.fillRect(0, 0, W, H)
  // Ghosts of old erased work.
  const rand = rng(53)
  for (let i = 0; i < 14; i++) {
    ctx.fillStyle = `rgba(120,130,140,${0.03 + rand() * 0.03})`
    ctx.beginPath()
    ctx.ellipse(rand() * W, rand() * H, 80 + rand() * 160, 20 + rand() * 40, rand() * 3, 0, Math.PI * 2)
    ctx.fill()
  }
  const m = new Marker(ctx, rng(9))
  const ink = '#1c1f26'
  const blue = '#1f4fbf'
  const red = '#c8322b'
  const green = '#15805a'
  // Projectile motion.
  m.colour(ink).title('Projectile', 60, 70)
  m.colour(ink).arrow(90, 470, 90, 160)
  m.arrow(90, 470, 700, 470)
  ctx.lineWidth = 6
  m.colour(blue)
  const arc: [number, number][] = []
  for (let i = 0; i <= 30; i++) {
    const t = i / 30
    arc.push([90 + t * 560, 470 - 4 * 250 * t * (1 - t)])
  }
  m.line(arc, 6)
  m.colour(red).arrow(90, 470, 230, 330)
  equation(ctx, 'v_{0}', 200, 320, 40, red)
  equation(ctx, 'θ', 150, 450, 40, red)
  equation(ctx, 'y = x tanθ − gx^{2} / 2v_{0}^{2}cos^{2}θ', 70, 545, 46, ink)
  equation(ctx, 'R = v_{0}^{2} sin2θ / g', 70, 615, 46, blue)
  // Block on an incline with its forces.
  ctx.lineWidth = 6
  m.colour(ink).line([[80, 980], [600, 980], [80, 700], [80, 980]], 6)
  ctx.save()
  ctx.translate(300, 812)
  ctx.rotate(Math.atan2(280, 520))
  ctx.strokeStyle = ink
  ctx.lineWidth = 6
  ctx.strokeRect(-55, -90, 110, 90)
  ctx.restore()
  m.colour(red).arrow(300, 790, 300, 940)
  equation(ctx, 'mg', 312, 930, 40, red)
  m.colour(green).arrow(300, 790, 220, 650)
  equation(ctx, 'N', 190, 640, 40, green)
  m.colour(blue).arrow(300, 790, 440, 860)
  equation(ctx, 'f = μN', 450, 880, 40, blue)
  equation(ctx, 'ΣF = ma', 630, 975, 54, ink)
  // Maxwell's equations, boxed.
  m.colour(ink).title("Maxwell", 820, 70)
  const mx = 820
  equation(ctx, '∇ · E = ρ / ε_{0}', mx, 200, 54, blue)
  equation(ctx, '∇ · B = 0', mx, 290, 54, blue)
  equation(ctx, '∇ × E = −∂B/∂t', mx, 380, 54, blue)
  equation(ctx, '∇ × B = μ_{0}J + μ_{0}ε_{0}∂E/∂t', mx, 470, 54, blue)
  m.colour(blue).line([...m.seg(800, 130, 1400, 128), ...m.seg(1400, 128, 1402, 500), ...m.seg(1402, 500, 800, 502), ...m.seg(800, 502, 800, 130)], 4)
  equation(ctx, 'c = 1/√{μ₀ε₀}', 860, 600, 52, red)
  equation(ctx, 'E = mc^{2}', 860, 720, 70, ink)
  equation(ctx, 'γ = 1/√{1 − v²/c²}', 860, 840, 50, green)
  // Pendulum.
  m.colour(ink).line([[1240, 640], [1380, 640]], 5)
  m.line([[1310, 640], [1360, 880]], 4)
  ctx.beginPath()
  ctx.arc(1365, 900, 22, 0, Math.PI * 2)
  ctx.fillStyle = ink
  ctx.fill()
  ctx.setLineDash([12, 12])
  m.line([[1310, 640], [1310, 900]], 3)
  ctx.setLineDash([])
  equation(ctx, 'T = 2π√{L/g}', 1200, 980, 46, red)
  // Quantum and identities.
  m.colour(ink).title('Quantum', 1500, 70)
  equation(ctx, 'iħ ∂ψ/∂t = Ĥψ', 1500, 200, 58, ink)
  equation(ctx, 'Ĥ = −ħ^{2}/2m ∇^{2} + V', 1500, 290, 46, blue)
  equation(ctx, 'ΔxΔp ≥ ħ/2', 1500, 380, 50, green)
  equation(ctx, 'e^{iπ} + 1 = 0', 1520, 520, 70, red)
  m.colour(red).circle(1680, 498, 210, 78)
  equation(ctx, 'f̂(ξ) = ∫ f(x) e^{−2πixξ} dx', 1480, 660, 44, ink)
  equation(ctx, 'Σ 1/n^{2} = π^{2}/6', 1500, 770, 52, blue)
  // A wave with its wavelength.
  m.colour(green)
  const wave: [number, number][] = []
  for (let x = 0; x <= 420; x += 10) wave.push([1500 + x, 900 + Math.sin((x / 420) * Math.PI * 4) * 38])
  m.line(wave, 5)
  m.colour(green).arrow(1500, 960, 1710, 960)
  equation(ctx, 'λ', 1590, 1010, 44, green)
  equation(ctx, 'v = fλ', 1760, 1010, 44, ink)
  m.colour(red).sticky(1860, 190, 'why does\nit work?', 0.06)
  return toTexture(canvas)
}

// ── Notebook pages on the lab desk ──────────────────────────────────────────

const PEN = '"Noteworthy", "Bradley Hand", "Segoe Print", "Comic Sans MS", cursive'

/** Two facing pages: notes on the agent factory, and a to-do list with a sketch. */
export function paintNotebookPage(side: 'left' | 'right') {
  const W = 740
  const H = 1034
  const { canvas, ctx } = surface(W, H)
  ctx.fillStyle = '#f4efe2'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = 'rgba(80,90,110,0.28)'
  for (let y = 40; y < H; y += 34) for (let x = 30; x < W; x += 34) ctx.fillRect(x, y, 3, 3)
  // The gutter's shadow.
  const g = ctx.createLinearGradient(side === 'left' ? W : 0, 0, side === 'left' ? W - 70 : 70, 0)
  g.addColorStop(0, 'rgba(60,50,30,0.25)')
  g.addColorStop(1, 'rgba(60,50,30,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
  const ink = '#1c2a52'
  const write = (text: string, x: number, y: number, size = 38, colour = ink) => {
    ctx.fillStyle = colour
    ctx.font = `${size}px ${PEN}`
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(text, x, y)
  }
  const pen = new Marker(ctx, rng(side === 'left' ? 2 : 3))
  if (side === 'left') {
    write('Agent factory', 60, 110, 52)
    pen.colour(ink).line(pen.seg(60, 125, 400, 120, 10), 3)
    write('scout → plan → build', 60, 200)
    write('→ test → review → ship', 60, 250)
    write('• tests first, always', 60, 340)
    write('• one task per agent', 60, 395)
    write('• humans approve merges', 60, 450)
    const boxes: [number, string][] = [[70, 'plan'], [270, 'build'], [470, 'review']]
    ctx.lineWidth = 4
    for (const [x, label] of boxes) {
      pen.colour(ink).line([...pen.seg(x, 560, x + 170, 560), ...pen.seg(x + 170, 560, x + 170, 650), ...pen.seg(x + 170, 650, x, 650), ...pen.seg(x, 650, x, 562)], 4)
      write(label, x + 26, 618, 36)
    }
    pen.colour(ink).arrow(242, 605, 268, 605)
    pen.colour(ink).arrow(442, 605, 468, 605)
    pen.colour('#c0392b').arrow(555, 655, 160, 700, true)
    write('revise', 300, 745, 34, '#c0392b')
    // A coffee ring.
    ctx.strokeStyle = 'rgba(120,80,40,0.25)'
    ctx.lineWidth = 10
    ctx.beginPath()
    ctx.arc(560, 900, 85, 0.3, Math.PI * 1.85)
    ctx.stroke()
  } else {
    write('Oct 17 — to do', 60, 110, 50)
    const items: [string, boolean][] = [
      ['blinds panel by the door', true],
      ['whiteboard + physics', true],
      ['Mac minis under monitors', true],
      ['ship v5', false],
      ['call mom', false],
    ]
    items.forEach(([text, done], i) => {
      const y = 200 + i * 70
      ctx.strokeStyle = ink
      ctx.lineWidth = 3
      ctx.strokeRect(62, y - 30, 32, 32)
      if (done) pen.colour('#1e7b4f').line([[66, y - 14], [78, y - 2], [100, y - 40]], 5)
      write(text, 116, y)
    })
    // A little sketch of the desk.
    pen.colour(ink).line([[90, 780], [520, 780]], 4)
    pen.line([[120, 780], [120, 900]], 4)
    pen.line([[490, 780], [490, 900]], 4)
    pen.line([[180, 780], [180, 680], [330, 680], [330, 780]], 4)
    pen.line([[360, 780], [360, 700], [470, 700], [470, 780]], 4)
    write('the L', 540, 800, 36)
  }
  return toTexture(canvas)
}

// ── PC: motherboard and power supply label ──────────────────────────────────

/** The motherboard's face: matte black PCB, copper traces, white silkscreen. */
export function paintPcb() {
  const W = 488
  const H = 610
  const { canvas, ctx } = surface(W, H)
  ctx.fillStyle = '#0d1114'
  ctx.fillRect(0, 0, W, H)
  const rand = rng(61)
  ctx.lineCap = 'round'
  for (let i = 0; i < 220; i++) {
    ctx.strokeStyle = `rgba(${rand() < 0.7 ? '150,110,60' : '70,140,150'},${0.18 + rand() * 0.25})`
    ctx.lineWidth = 1 + rand() * 1.5
    let x = rand() * W
    let y = rand() * H
    ctx.beginPath()
    ctx.moveTo(x, y)
    for (let k = 0; k < 4; k++) {
      const len = 20 + rand() * 90
      const dir = Math.floor(rand() * 4)
      const diag = rand() < 0.3
      x += dir === 0 ? len : dir === 1 ? -len : diag ? len * 0.7 : 0
      y += dir === 2 ? len : dir === 3 ? -len : diag ? len * 0.7 : 0
      ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
  for (let i = 0; i < 160; i++) {
    ctx.fillStyle = 'rgba(190,170,120,0.5)'
    ctx.beginPath()
    ctx.arc(rand() * W, rand() * H, 1.5 + rand(), 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = 'rgba(235,235,235,0.75)'
  ctx.font = `700 13px ${SANS}`
  const labels: [string, number, number][] = [
    ['CPU_FAN', 60, 40], ['AIO_PUMP', 150, 40], ['DIMM_A1', 330, 160], ['DIMM_B1', 370, 160], ['M.2_1 (PCIe 5.0)', 60, 395],
    ['PCIEX16_1', 60, 345], ['PCIEX16_2', 60, 470], ['CHA_FAN1', 400, 560], ['ATX_24P', 420, 300], ['EZ DEBUG', 400, 380], ['BIOS FLASHBACK', 20, 590],
  ]
  for (const [text, x, y] of labels) ctx.fillText(text, x, y)
  ctx.strokeStyle = 'rgba(235,235,235,0.5)'
  ctx.lineWidth = 1.5
  ctx.strokeRect(150, 90, 150, 150)
  for (let i = 0; i < 6; i++) ctx.strokeRect(330 + (i % 2) * 40, 175 + Math.floor(i / 2) * 2, 26, 4)
  // A graphic band across the lower board, like a brand's racing stripe without the brand.
  ctx.fillStyle = 'rgba(160,170,185,0.16)'
  ctx.beginPath()
  ctx.moveTo(0, 470)
  ctx.lineTo(W, 420)
  ctx.lineTo(W, 450)
  ctx.lineTo(0, 500)
  ctx.fill()
  return toTexture(canvas)
}

export function paintPsuLabel() {
  const W = 600
  const H = 240
  const { canvas, ctx } = surface(W, H)
  ctx.fillStyle = '#16181b'
  ctx.fillRect(0, 0, W, H)
  ctx.strokeStyle = '#3a3f46'
  ctx.lineWidth = 4
  ctx.strokeRect(10, 10, W - 20, H - 20)
  ctx.fillStyle = '#f1f3f5'
  ctx.font = `800 110px ${SANS}`
  ctx.textBaseline = 'middle'
  ctx.fillText('1600W', 40, 105)
  ctx.font = `700 26px ${SANS}`
  ctx.fillStyle = '#c9a94a'
  ctx.fillText('80 PLUS TITANIUM', 44, 185)
  ctx.fillStyle = '#9aa3ad'
  ctx.textAlign = 'right'
  ctx.fillText('FULLY MODULAR', W - 40, 185)
  ctx.fillText('ATX 3.1', W - 40, 60)
  return toTexture(canvas)
}

// ── Dyson: the filter's perforated shell ────────────────────────────────────

export function paintPerforation() {
  const S = 128
  const { canvas, ctx } = surface(S, S)
  ctx.fillStyle = '#d8dce1'
  ctx.fillRect(0, 0, S, S)
  ctx.fillStyle = '#5b616a'
  const step = S / 8
  for (let j = 0; j < 9; j++) {
    for (let i = 0; i < 9; i++) {
      const x = i * step + (j % 2 ? step / 2 : 0)
      const y = j * step * 0.866 * (8 / 6.928)
      ctx.beginPath()
      ctx.arc(x % S, y % S, step * 0.22, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  const texture = toTexture(canvas)
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  return texture
}

// ── Leaves: veins, and the snake plant's bands ──────────────────────────────

/** A leaf's colour with a pale midrib and side veins (u across the leaf, v along it). */
export function paintLeaf(base: string, vein: string, bands = false) {
  const W = 256
  const H = 512
  const { canvas, ctx } = surface(W, H)
  ctx.fillStyle = base
  ctx.fillRect(0, 0, W, H)
  const shade = ctx.createLinearGradient(0, 0, W, 0)
  shade.addColorStop(0, 'rgba(0,0,0,0.18)')
  shade.addColorStop(0.5, 'rgba(255,255,255,0.06)')
  shade.addColorStop(1, 'rgba(0,0,0,0.18)')
  ctx.fillStyle = shade
  ctx.fillRect(0, 0, W, H)
  if (bands) {
    // Snake plant: pale wavy cross bands and yellow margins.
    const rand = rng(29)
    for (let y = 10; y < H; y += 26 + rand() * 18) {
      ctx.fillStyle = `rgba(150,190,120,${0.35 + rand() * 0.2})`
      ctx.beginPath()
      ctx.moveTo(0, y)
      for (let x = 0; x <= W; x += 16) ctx.lineTo(x, y + Math.sin(x * 0.05 + y) * 6)
      for (let x = W; x >= 0; x -= 16) ctx.lineTo(x, y + 7 + Math.sin(x * 0.05 + y + 1) * 6)
      ctx.fill()
    }
    ctx.fillStyle = '#c9b84a'
    ctx.fillRect(0, 0, 18, H)
    ctx.fillRect(W - 18, 0, 18, H)
  } else {
    ctx.strokeStyle = vein
    ctx.lineWidth = 7
    ctx.beginPath()
    ctx.moveTo(W / 2, 0)
    ctx.lineTo(W / 2, H)
    ctx.stroke()
    ctx.lineWidth = 3
    for (let y = 30; y < H - 20; y += 46) {
      for (const s of [-1, 1]) {
        ctx.beginPath()
        ctx.moveTo(W / 2, y)
        ctx.quadraticCurveTo(W / 2 + s * W * 0.25, y + 30, W / 2 + s * W * 0.48, y + 70)
        ctx.stroke()
      }
    }
  }
  return toTexture(canvas)
}

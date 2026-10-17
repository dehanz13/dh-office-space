import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  DataTexture,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  NearestFilter,
  PlaneGeometry,
  RedFormat,
  ShaderMaterial,
  UnsignedByteType,
  Vector3,
} from 'three'
import { tod } from '../state/store'
import { SUN_DIR } from './Sky'

// The neighbourhood around a high-rise, the office twenty-three floors up (the street is
// 100 m below the office floor). Towers come in four facade styles and several
// shapes; streets have lanes, crossings, parks, streetlights and traffic.
// By night some office floors stay lit, homes light single rooms, and a few
// windows switch on or off now and then, slowly.

const STREET = -100
const BLOCK = 80
const GRID = { min: -15, max: 9 }
const DOWNTOWN = { x: -520, z: -620, radius: 440 }
const FOG_DAY = new Vector3(0.68, 0.77, 0.88)
const FOG_NIGHT = new Vector3(0.05, 0.045, 0.07)

/** Sidewalk kerb, measured from a road's centre line (roads are 18 m wide). */
const KERB = 10.5

/** True where a point along a road falls inside a crossing street. */
function onCrossing(along: number) {
  const q = Math.abs((((along + BLOCK / 2) % BLOCK) + BLOCK) % BLOCK - BLOCK / 2)
  return q > 27
}

function rng(seed: number) {
  let s = seed
  return () => ((s = (s * 16807) % 2147483647) / 2147483647)
}

const shared = /* glsl */ `
  uniform float uNight;
  uniform float uTime;
  uniform vec3 uFogDay;
  uniform vec3 uFogNight;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  vec3 applyFog(vec3 col, vec3 world) {
    float dist = length(world - cameraPosition);
    float fog = 1.0 - exp(-pow(dist * mix(0.00078, 0.0011, uNight), 1.5));
    return mix(col, mix(uFogDay, uFogNight, uNight), fog);
  }
`

// ── Towers ───────────────────────────────────────────────────────────────────

const towerVertex = /* glsl */ `
  attribute vec4 aInfo;  // type, seed, office, kind
  attribute vec3 aTint;
  uniform float uRound;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec4 vInfo;
  varying vec3 vTint;
  varying vec2 vFacade;
  void main() {
    vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormal = normalize(mat3(modelMatrix * instanceMatrix) * normal);
    vInfo = aInfo;
    vTint = aTint;
    if (uRound > 0.5) {
      vec3 c = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      float r = length((instanceMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz);
      vFacade = vec2(atan(world.z - c.z, world.x - c.x) * r, world.y - (${STREET.toFixed(1)}));
    } else {
      vFacade = vec2(abs(vNormal.x) > 0.5 ? world.z : world.x, world.y - (${STREET.toFixed(1)}));
    }
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

const towerFragment = /* glsl */ `
  ${shared}
  uniform vec3 uSun;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec4 vInfo;
  varying vec3 vTint;
  varying vec2 vFacade;
  void main() {
    vec3 n = normalize(vNormal);
    float type = vInfo.x;
    float seed = vInfo.y;
    float office = vInfo.z;
    float kind = vInfo.w;
    float roof = step(0.6, n.y);
    float sun = max(dot(n, uSun), 0.0);

    float floorH = type < 0.5 ? 3.9 : type < 1.5 ? 3.4 : type < 2.5 ? 3.7 : 4.0;
    float bayW = type < 0.5 ? 1.5 : type < 1.5 ? 2.8 : type < 2.5 ? 6.0 : 1.2;
    vec2 cell = vec2(vFacade.x / bayW, vFacade.y / floorH);
    vec2 id = floor(cell);
    vec2 uv = fract(cell);
    float win;
    if (type < 0.5) win = step(0.05, uv.x) * step(uv.x, 0.95) * step(0.12, uv.y) * step(uv.y, 0.97);
    else if (type < 1.5) win = step(0.22, uv.x) * step(uv.x, 0.78) * step(0.22, uv.y) * step(uv.y, 0.8);
    else if (type < 2.5) win = step(0.38, uv.y) * step(uv.y, 0.92);
    else win = step(0.12, uv.x) * step(uv.x, 0.9) * step(0.08, uv.y) * step(uv.y, 0.95);

    // Day: glass reflects a sky gradient, walls take the building's tint.
    float up = clamp(vFacade.y / 260.0, 0.0, 1.0);
    vec3 skyRefl = mix(vec3(0.72, 0.8, 0.88), vec3(0.32, 0.5, 0.78), clamp(0.3 + up * 0.5, 0.0, 1.0));
    // Glass towers by day are darker than they seem: they mirror the sky at a
    // fraction of its brightness, pane by pane.
    vec3 glass = mix(vec3(0.05, 0.065, 0.085), skyRefl, 0.36 + 0.12 * hash(id + seed)) * vTint * 1.15;
    vec3 day;
    if (type < 0.5) day = mix(vec3(0.16, 0.17, 0.19), glass, win);
    else if (type < 2.5) day = mix(vTint, glass * 0.85, win);
    else day = mix(vec3(0.24, 0.23, 0.21), vec3(0.035, 0.04, 0.045) + skyRefl * 0.16, win);
    // Faces turned from the sun fall well into shade, and the street canyons
    // get less sky than the upper floors.
    day *= (0.36 + 0.8 * sun) * mix(0.62, 1.0, smoothstep(0.0, 45.0, vFacade.y));

    // Night: office floors lit end to end (cool), homes room by room (warm).
    float floorLit = office * step(0.74, hash(vec2(id.y, seed * 13.0)));
    float roomLit = step(0.86, hash(id + seed * 7.13));
    // Only a few windows ever change, each on its own slow 1-3 minute cycle, fading.
    float changes = step(0.94, hash(id * 1.31 + seed));
    float period = 60.0 + 120.0 * hash(id + 9.1);
    float ph = fract(uTime / period + hash(id + 2.7));
    float churn = changes * smoothstep(0.0, 0.03, ph) * (1.0 - smoothstep(0.5, 0.53, ph));
    float lit = clamp(max(floorLit, roomLit) + churn, 0.0, 1.0);
    vec3 lightCol = mix(vec3(1.0, 0.72, 0.42), vec3(0.8, 0.88, 1.0), floorLit) * (0.5 + 0.55 * hash(id + 3.1));
    vec3 night = mix(vec3(0.009, 0.011, 0.017), lightCol, win * lit);

    if (kind > 0.5 && kind < 1.5) {
      // Podium: shopfronts along the street glow warm at night.
      float shop = (1.0 - step(6.5, vFacade.y)) * step(0.08, uv.x) * step(uv.x, 0.92) * (1.0 - roof);
      night = mix(night, vec3(1.0, 0.78, 0.52) * 1.15, shop);
      day = mix(day, vec3(0.1, 0.11, 0.12) + skyRefl * 0.25, shop);
    } else if (kind > 1.5 && kind < 2.5) {
      day = vec3(0.32, 0.33, 0.34) * (0.55 + 0.45 * sun);
      night = vec3(0.014);
    } else if (kind > 2.5) {
      // Lit crowns, the skyline's signature at night.
      day = vTint * 0.6 * (0.6 + 0.4 * sun);
      night = vTint * (1.8 + 0.25 * sin(uTime * 0.3 + seed));
    }
    vec3 col = mix(day, night, uNight);
    vec3 roofCol = mix(vec3(0.3, 0.31, 0.33) * (0.5 + 0.5 * sun), vec3(0.014), uNight);
    col = mix(col, roofCol, roof * (1.0 - step(2.5, kind)));
    gl_FragColor = vec4(applyFog(col, vWorld), 1.0);
    #include <colorspace_fragment>
  }
`

// ── Ground: streets, lanes, crossings, sidewalks ─────────────────────────────

const groundVertex = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

// Parks are painted into the ground itself, from a block-by-block map. A lawn
// plane laid a few centimetres above the street would fight it for depth a
// hundred metres away and flicker as you walk.
const PARK_GRID = GRID.max - GRID.min + 1

const groundFragment = /* glsl */ `
  ${shared}
  uniform sampler2D uParks;
  varying vec3 vWorld;
  void main() {
    vec2 p = vWorld.xz;
    vec2 q = mod(p + ${(BLOCK / 2).toFixed(1)}, ${BLOCK.toFixed(1)}) - ${(BLOCK / 2).toFixed(1)};
    vec2 a = abs(q);
    float roadX = step(31.0, a.y);           // road running along x
    float roadZ = step(31.0, a.x);           // road running along z
    float road = max(roadX, roadZ);
    float walk = max(step(27.0, a.x), step(27.0, a.y)) * (1.0 - road);
    vec3 asphalt = vec3(0.17, 0.175, 0.18) + (hash(floor(p * 0.5)) - 0.5) * 0.02;
    vec3 concrete = vec3(0.52, 0.51, 0.49);
    // Each block's ground is its own: dark parking, pale plaza, or something between.
    float plot = hash(floor((p + ${(BLOCK / 2).toFixed(1)}) / ${BLOCK.toFixed(1)}));
    vec3 lot = mix(vec3(0.2, 0.205, 0.21), vec3(0.47, 0.46, 0.44), plot);
    vec2 block = floor((p + ${(BLOCK / 2).toFixed(1)}) / ${BLOCK.toFixed(1)}) - ${GRID.min.toFixed(1)};
    float inGrid = step(0.0, block.x) * step(0.0, block.y) * step(block.x, ${(PARK_GRID - 1).toFixed(1)}) * step(block.y, ${(PARK_GRID - 1).toFixed(1)});
    float park = inGrid * texture2D(uParks, (block + 0.5) / ${PARK_GRID.toFixed(1)}).r * (1.0 - walk) * (1.0 - road);
    float mow = hash(floor(p * 0.7)) * 0.05 + sin(p.x * 0.35) * 0.012;
    float path = 1.0 - step(1.6, min(abs(q.x), abs(q.y)));
    vec3 lawn = mix(vec3(0.15, 0.29, 0.11) + mow, vec3(0.6, 0.56, 0.48), path);
    vec3 day = mix(lot, concrete, walk);
    day = mix(day, lawn, park);
    day = mix(day, asphalt, road);
    // Markings: double yellow centre lines, dashed lane lines, zebra crossings.
    float dx = 40.0 - a.y;
    float dz = 40.0 - a.x;
    float onlyX = roadX * (1.0 - roadZ);
    float onlyZ = roadZ * (1.0 - roadX);
    float yellow = onlyX * (step(0.1, dx) - step(0.25, dx) + step(0.45, dx) - step(0.6, dx))
                 + onlyZ * (step(0.1, dz) - step(0.25, dz) + step(0.45, dz) - step(0.6, dz));
    float dashX = onlyX * (step(4.4, dx) - step(4.6, dx)) * step(fract(p.x / 9.0), 0.5);
    float dashZ = onlyZ * (step(4.4, dz) - step(4.6, dz)) * step(fract(p.y / 9.0), 0.5);
    float zebraX = roadX * step(27.0, a.x) * (1.0 - step(31.0, a.x)) * step(fract(p.y / 1.4), 0.5);
    float zebraZ = roadZ * step(27.0, a.y) * (1.0 - step(31.0, a.y)) * step(fract(p.x / 1.4), 0.5);
    // Paint thinner than a pixel fades out instead of shimmering into moire.
    float aa = 1.0 - smoothstep(0.25, 0.9, max(fwidth(p.x), fwidth(p.y)));
    yellow *= aa;
    float white = clamp(dashX + dashZ, 0.0, 1.0) * aa + clamp(zebraX + zebraZ, 0.0, 1.0) * (1.0 - smoothstep(0.5, 1.6, max(fwidth(p.x), fwidth(p.y))));
    day = mix(day, vec3(0.85, 0.7, 0.2), clamp(yellow, 0.0, 1.0));
    day = mix(day, vec3(0.88), clamp(white, 0.0, 1.0));
    // Night: dark asphalt, warm pools under the streetlights along the sidewalks.
    vec2 lamp = vec2(fract(p.x / 32.0), fract(p.y / 32.0));
    float pool = walk * (1.0 - smoothstep(0.0, 0.18, length(lamp - 0.5) * 0.9));
    float roadGlow = road * 0.05;
    vec3 night = mix(vec3(0.012), vec3(0.03, 0.028, 0.026), walk) + vec3(1.0, 0.68, 0.36) * (pool * 0.55 + roadGlow);
    night = mix(night, vec3(0.006, 0.01, 0.006), park);
    night += vec3(0.5) * white * 0.04;
    vec3 col = mix(day, night, uNight);
    gl_FragColor = vec4(applyFog(col, vWorld), 1.0);
    #include <colorspace_fragment>
  }
`

// ── Cars, driven entirely in the shader ──────────────────────────────────────

const carVertex = /* glsl */ `
  attribute vec4 aLane;  // axis (0 = along x, 1 = along z), fixed coordinate, lane offset (signed), speed
  attribute vec2 aCar;   // start phase, colour seed
  uniform float uTime;
  varying vec3 vWorld;
  varying vec3 vLocal;
  varying float vSeed;
  void main() {
    float dir = sign(aLane.z);
    float span = 2400.0;
    float s = mod(aCar.x + uTime * aLane.w * dir, span) - span * 0.5;
    vec3 along = aLane.x < 0.5 ? vec3(dir, 0.0, 0.0) : vec3(0.0, 0.0, dir);
    vec3 side = vec3(along.z, 0.0, -along.x);
    vec3 base = aLane.x < 0.5 ? vec3(s, 0.0, aLane.y + aLane.z) : vec3(aLane.y + aLane.z, 0.0, s);
    vec3 world = base + along * position.x + side * position.z + vec3(0.0, position.y + ${(STREET + 0.75).toFixed(2)}, 0.0);
    vWorld = world;
    vLocal = position;
    vSeed = aCar.y;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`

const carFragment = /* glsl */ `
  ${shared}
  varying vec3 vWorld;
  varying vec3 vLocal;
  varying float vSeed;
  void main() {
    float pick = fract(vSeed * 7.31);
    vec3 paint = pick < 0.25 ? vec3(0.85) : pick < 0.45 ? vec3(0.08) : pick < 0.6 ? vec3(0.45, 0.47, 0.5) : pick < 0.72 ? vec3(0.55, 0.08, 0.08) : pick < 0.84 ? vec3(0.12, 0.2, 0.42) : vec3(0.7, 0.66, 0.6);
    vec3 day = paint * (0.6 + 0.4 * step(0.4, vLocal.y));
    float front = step(2.0, vLocal.x);
    float back = 1.0 - step(-2.0, vLocal.x);
    vec3 night = vec3(0.012) + vec3(1.0, 0.96, 0.85) * 2.4 * front + vec3(1.0, 0.08, 0.05) * 1.6 * back;
    vec3 col = mix(day, night, uNight);
    gl_FragColor = vec4(applyFog(col, vWorld), 1.0);
    #include <colorspace_fragment>
  }
`

// ── Point lights in the city: streetlights and red aviation beacons ─────────

const pointsVertex = /* glsl */ `
  attribute float aSize;
  attribute float aBlink;
  uniform float uTime;
  uniform float uNight;
  uniform float uScale;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float blink = aBlink > 0.0 ? step(0.5, fract(uTime * 0.5 + aBlink)) : 1.0;
    vAlpha = uNight * blink;
    // A lamp is a few pixels across at a block or two, never a glowing ball.
    gl_PointSize = clamp(aSize * uScale / -mv.z, 1.5, 7.0);
    gl_Position = projectionMatrix * mv;
  }
`

const pointsFragment = /* glsl */ `
  uniform vec3 uColour;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(uColour * 2.0, a * a * vAlpha);
  }
`

const TINTS = {
  curtain: [[0.55, 0.72, 0.9], [0.55, 0.85, 0.76], [0.82, 0.84, 0.88], [0.86, 0.72, 0.52]],
  wall: [[0.74, 0.68, 0.58], [0.56, 0.57, 0.59], [0.56, 0.34, 0.27], [0.84, 0.83, 0.8]],
  crown: [[0.25, 1.0, 0.45], [0.3, 0.55, 1.0], [1.0, 0.95, 0.85], [0.7, 0.4, 1.0]],
} as const

interface Segment {
  x: number
  z: number
  w: number
  d: number
  y0: number
  h: number
  type: number
  seed: number
  office: number
  kind: number
  tint: readonly number[]
  round: boolean
}

function buildCity() {
  const rand = rng(424242)
  const segments: Segment[] = []
  const parks: [number, number][] = []
  const beacons: number[] = []
  for (let gx = GRID.min; gx <= GRID.max; gx++) {
    for (let gz = GRID.min; gz <= GRID.max; gz++) {
      if (gx === 0 && gz === 0) continue // our own building's block
      const cx = gx * BLOCK
      const cz = gz * BLOCK
      const dist = Math.hypot(cx, cz)
      if (rand() < 0.14) {
        parks.push([cx, cz])
        continue
      }
      const near = Math.min(1, Math.max(0, (dist - 80) / 520))
      const downtown = Math.max(0, 1 - Math.hypot(cx - DOWNTOWN.x, cz - DOWNTOWN.z) / DOWNTOWN.radius)
      const count = rand() < 0.3 ? 2 : 1
      for (let k = 0; k < count; k++) {
        const w = count === 2 ? 14 + rand() * 12 : 20 + rand() * 18
        const d = count === 2 ? 14 + rand() * 12 : 20 + rand() * 18
        const ox = count === 2 ? (k ? 12 : -12) : (rand() - 0.5) * 10
        const oz = count === 2 ? (k ? -10 : 10) : (rand() - 0.5) * 10
        const x = cx + ox
        const z = cz + oz
        // Thirty floors up, most neighbours sit below the window; the tall ones
        // gather downtown, with the odd tower standing alone further out.
        let h = 16 + rand() * (34 + near * 70) + downtown * downtown * (120 + rand() * 210)
        if (dist > 420 && rand() < 0.06) h += 50 + rand() * 70
        if (dist < 260) h = Math.min(h, 62 + dist * 0.12)
        if (count === 2) h *= 0.75
        const seed = rand() * 100
        const tall = h > 130
        const r = rand()
        const type = tall ? (r < 0.6 ? 0 : 3) : r < 0.35 ? 0 : r < 0.62 ? 1 : r < 0.85 ? 2 : 3
        const office = type === 1 ? (rand() < 0.3 ? 1 : 0) : rand() < 0.65 ? 1 : 0
        const tint = type === 0 ? TINTS.curtain[Math.floor(rand() * 4)] : TINTS.wall[Math.floor(rand() * 4)]
        const round = h > 80 && count === 1 && rand() < 0.08
        // Podium along the street.
        if (count === 1 && rand() < 0.5) {
          const ph = 8 + rand() * 8
          const pw = Math.min(w * 1.35, 50)
          const pd = Math.min(d * 1.35, 50)
          segments.push({ x: cx, z: cz, w: pw, d: pd, y0: 0, h: ph, type: rand() < 0.5 ? 3 : 1, seed: seed + 1, office: 0, kind: 1, tint: TINTS.wall[Math.floor(rand() * 4)], round: false })
        }
        // Shaft, with a setback crown on some tall towers.
        const setback = tall && !round && rand() < 0.4
        const shaftH = setback ? h * 0.72 : h
        segments.push({ x, z, w, d, y0: 0, h: shaftH, type, seed, office, kind: 0, tint, round })
        let top = shaftH
        let tw = w
        let td = d
        if (setback) {
          tw = w * 0.68
          td = d * 0.68
          segments.push({ x, z, w: tw, d: td, y0: shaftH, h: h - shaftH, type, seed: seed + 0.5, office, kind: 0, tint, round: false })
          top = h
        }
        if (tall && rand() < 0.5) {
          segments.push({ x, z, w: tw + 0.6, d: td + 0.6, y0: top - 3.2, h: 2.4, type, seed, office: 0, kind: 3, tint: TINTS.crown[Math.floor(rand() * 4)], round })
        }
        if (!round && rand() < 0.7) {
          segments.push({ x: x + (rand() - 0.5) * tw * 0.3, z: z + (rand() - 0.5) * td * 0.3, w: tw * 0.4, d: td * 0.35, y0: top, h: 3 + rand() * 3, type, seed, office: 0, kind: 2, tint, round: false })
        }
        if (h > 160 && rand() < 0.45) {
          const spire = 18 + rand() * 30
          segments.push({ x, z, w: 1.2, d: 1.2, y0: top, h: spire, type: 3, seed, office: 0, kind: 2, tint, round: true })
          beacons.push(x, STREET + top + spire + 0.5, z)
        }
      }
    }
  }
  return { segments, parks, beacons }
}

function towerMaterial(round: boolean) {
  return new ShaderMaterial({
    vertexShader: towerVertex,
    fragmentShader: towerFragment,
    uniforms: {
      uNight: { value: 0 },
      uTime: { value: 0 },
      uRound: { value: round ? 1 : 0 },
      uSun: { value: SUN_DIR },
      uFogDay: { value: FOG_DAY },
      uFogNight: { value: FOG_NIGHT },
    },
  })
}

function instanced(segments: Segment[], geometry: BoxGeometry | CylinderGeometry, material: ShaderMaterial) {
  const mesh = new InstancedMesh(geometry, material, Math.max(1, segments.length))
  const info = new Float32Array(segments.length * 4)
  const tints = new Float32Array(segments.length * 3)
  const m = new Matrix4()
  segments.forEach((s, i) => {
    const sx = s.round ? Math.min(s.w, s.d) / 2 : s.w
    const sz = s.round ? Math.min(s.w, s.d) / 2 : s.d
    m.makeScale(sx, s.h, sz)
    m.setPosition(s.x, STREET + s.y0 + s.h / 2, s.z)
    mesh.setMatrixAt(i, m)
    info.set([s.type, s.seed, s.office, s.kind], i * 4)
    tints.set(s.tint, i * 3)
  })
  geometry.setAttribute('aInfo', new InstancedBufferAttribute(info, 4))
  geometry.setAttribute('aTint', new InstancedBufferAttribute(tints, 3))
  mesh.count = segments.length
  mesh.frustumCulled = false
  return mesh
}

function buildTraffic() {
  const rand = rng(99)
  const lanes: number[] = []
  const cars: number[] = []
  for (let k = GRID.min; k <= GRID.max; k++) {
    const roadCoord = k * BLOCK + BLOCK / 2
    for (const axis of [0, 1]) {
      for (const offset of [-6.6, -2.2, 2.2, 6.6]) {
        const speed = 9 + rand() * 6
        const perLane = 5 + Math.floor(rand() * 4)
        for (let c = 0; c < perLane; c++) {
          lanes.push(axis, roadCoord, offset, speed)
          cars.push(rand() * 2400, rand() * 100)
        }
      }
    }
  }
  const count = cars.length / 2
  const geometry = new BoxGeometry(4.4, 1.5, 1.9)
  geometry.setAttribute('aLane', new InstancedBufferAttribute(new Float32Array(lanes), 4))
  geometry.setAttribute('aCar', new InstancedBufferAttribute(new Float32Array(cars), 2))
  const material = new ShaderMaterial({
    vertexShader: carVertex,
    fragmentShader: carFragment,
    uniforms: { uNight: { value: 0 }, uTime: { value: 0 }, uFogDay: { value: FOG_DAY }, uFogNight: { value: FOG_NIGHT } },
  })
  const mesh = new InstancedMesh(geometry, material, count)
  mesh.frustumCulled = false
  return { mesh, material }
}

/** One texel per city block: 255 where the block is a park. */
function parkMap(parks: [number, number][]) {
  const data = new Uint8Array(PARK_GRID * PARK_GRID)
  for (const [x, z] of parks) data[(z / BLOCK - GRID.min) * PARK_GRID + (x / BLOCK - GRID.min)] = 255
  const texture = new DataTexture(data, PARK_GRID, PARK_GRID, RedFormat, UnsignedByteType)
  texture.magFilter = NearestFilter
  texture.minFilter = NearestFilter
  texture.needsUpdate = true
  return texture
}

function buildTrees(parks: [number, number][]) {
  const rand = rng(7)
  const m = new Matrix4()
  const trees: [number, number, number][] = []
  for (const [x, z] of parks) for (let i = 0; i < 34; i++) trees.push([x + (rand() - 0.5) * 46, z + (rand() - 0.5) * 46, 1.8 + rand() * 1.6])
  // Street trees on the sidewalks near the building, clear of the crossings.
  for (let k = -5; k <= 4; k++) {
    for (let i = -28; i <= 28; i++) {
      const x = i * 9 + rand() * 2
      if (rand() < 0.45 || onCrossing(x)) continue
      trees.push([x, k * BLOCK + BLOCK / 2 + (rand() < 0.5 ? -KERB : KERB), 1.4 + rand() * 0.7])
    }
  }
  const canopy = new InstancedMesh(new IcosahedronGeometry(1, 1), new MeshStandardMaterial({ color: '#4a6b3c', roughness: 0.9, flatShading: true }), trees.length)
  trees.forEach(([x, z, r], i) => {
    m.makeScale(r, r * 0.85, r)
    m.setPosition(x, STREET + r * 1.6, z)
    canopy.setMatrixAt(i, m)
  })
  canopy.frustumCulled = false
  return canopy
}

function pointsLayer(positions: number[], size: number, colour: [number, number, number], blink: boolean) {
  const geometry = new BufferGeometry()
  const count = positions.length / 3
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  geometry.setAttribute('aSize', new BufferAttribute(new Float32Array(count).fill(size), 1))
  const blinks = new Float32Array(count)
  if (blink) for (let i = 0; i < count; i++) blinks[i] = 0.001 + ((i * 0.37) % 1)
  geometry.setAttribute('aBlink', new BufferAttribute(blinks, 1))
  const material = new ShaderMaterial({
    vertexShader: pointsVertex,
    fragmentShader: pointsFragment,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: { uNight: { value: 0 }, uTime: { value: 0 }, uScale: { value: 900 }, uColour: { value: new Vector3(...colour) } },
  })
  return { geometry, material }
}

export function Skyline() {
  const city = useMemo(() => {
    const { segments, parks, beacons } = buildCity()
    const boxMat = towerMaterial(false)
    const roundMat = towerMaterial(true)
    const boxes = instanced(segments.filter((s) => !s.round), new BoxGeometry(1, 1, 1), boxMat)
    const rounds = instanced(segments.filter((s) => s.round), new CylinderGeometry(1, 1, 1, 28, 1), roundMat)
    const groundMaterial = new ShaderMaterial({
      vertexShader: groundVertex,
      fragmentShader: groundFragment,
      uniforms: { uNight: { value: 0 }, uTime: { value: 0 }, uFogDay: { value: FOG_DAY }, uFogNight: { value: FOG_NIGHT }, uParks: { value: parkMap(parks) } },
    })
    const traffic = buildTraffic()
    const trees = buildTrees(parks)
    const lampPositions: number[] = []
    for (let k = GRID.min; k <= GRID.max; k++) {
      const c = k * BLOCK + BLOCK / 2
      for (let s = -1200; s <= 1200; s += 32) {
        if (onCrossing(s)) continue
        for (const side of [-KERB, KERB]) {
          lampPositions.push(s, STREET + 8, c + side)
          lampPositions.push(c + side, STREET + 8, s)
        }
      }
    }
    const lamps = pointsLayer(lampPositions, 0.6, [1.0, 0.72, 0.42], false)
    const beaconLights = pointsLayer(beacons, 1.6, [1.0, 0.12, 0.08], true)
    return { boxes, rounds, boxMat, roundMat, groundMaterial, traffic, trees, lamps, beaconLights }
  }, [])

  useFrame(({ clock }) => {
    const n = tod.value
    const t = clock.elapsedTime
    for (const mat of [city.boxMat, city.roundMat, city.groundMaterial, city.traffic.material, city.lamps.material, city.beaconLights.material]) {
      mat.uniforms.uNight.value = n
      mat.uniforms.uTime.value = t
    }
  })

  const ground = useMemo(() => new PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2), [])
  return (
    <>
      <primitive object={city.boxes} />
      <primitive object={city.rounds} />
      <mesh geometry={ground} material={city.groundMaterial} position={[0, STREET, 0]} />
      <primitive object={city.traffic.mesh} />
      <primitive object={city.trees} />
      <points geometry={city.lamps.geometry} material={city.lamps.material} frustumCulled={false} />
      <points geometry={city.beaconLights.geometry} material={city.beaconLights.material} frustumCulled={false} />
    </>
  )
}

import { useGLTF } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import gsap from 'gsap'
import { useEffect, useMemo } from 'react'
import {
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  type Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  PMREMGenerator,
  PointLight,
  Quaternion,
  SpotLight,
  type Texture,
  Vector3,
} from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { owner } from '../content'
import { blindGroups, DESK_SIT, type Item, itemById, layout } from '../layout'
import { exercise } from '../exercise/state'
import { musicPulse } from '../music/spotify'
import { boardStatus, boardThinking } from '../play/status'
import { blindHold, blinds, deskState, tod, useGame } from '../state/store'
import * as paint from './paint'
import * as screens from './screens'

// Dresses the model Blender exported: animated screens, painted surfaces,
// clocks on real time zones, glowing night lights, the sit/stand desk and the
// moving parts of the bike and treadmill.

export const MODEL_URL = '/models/office.glb'
export const DRACO_PATH = '/draco/'

const WARM = new Color('#ffb066')
const COOL = new Color('#7d97ff')
const WHITE = new Color('#ffffff')
const CYAN = new Color('#29d3ff')

/** How brightly each kind of light part glows by day and by night. */
function glowFor(name: string) {
  const table: [string, Color, number, number][] = [
    ['EMI_cove', WARM, 0, 3.2],
    ['EMI_downlight', WARM, 0, 5],
    ['EMI_spot', WARM, 0, 9],
    ['EMI_pendant', WARM, 0, 6],
    ['EMI_kitchen_pendant', WARM, 0.15, 3.5],
    ['EMI_kitchen_shelf', WARM, 0, 3],
    ['EMI_island_led', WARM, 0, 3.5],
    ['EMI_shelf_leds', WARM, 0, 3.5],
    ['EMI_lamp', WARM, 0, 1.4],
    ['EMI_desk', COOL, 0.3, 5],
    ['EMI_tv', COOL, 0, 1.6],
    ['EMI_game', COOL, 2, 4],
    ['EMI_credenza', WARM, 0, 4],
    ['EMI_switch', WARM, 0, 1.6],
    ['EMI_mini', WHITE, 2, 3],
    ['EMI_dock', WHITE, 2, 3],
    ['EMI_ring', COOL, 0, 1.2],
    ['EMI_cooler', new Color('#cfe6ff'), 1.4, 2.4],
    ['EMI_ai', CYAN, 1.4, 2.6],
    ['EMI_lightbar', new Color('#fff3e2'), 1.6, 3.2],
    ['EMI_pcgpu', WHITE, 2, 2.6],
    ['EMI_media', WARM, 0, 3],
    ['EMI_coffee', new Color('#fff3e2'), 1.2, 2.4],
    ['EMI_niche', new Color('#ffcf94'), 0.9, 3.2],
    ['EMI_pcled', WHITE, 2, 3],
    ['EMI_spk_led', CYAN, 1.6, 2.4],
    ['EMI_mixer_fx', CYAN, 1.6, 2.6],
    ['EMI_mixer_cue', new Color('#ff9a3c'), 1.6, 2.6],
    ['EMI_tt_light', WHITE, 1.2, 2.4],
    ['EMI_tt_strobe', new Color('#ff5a3c'), 1.6, 2.6],
    ['EMI_dyson', WHITE, 1.6, 2.4],
  ]
  for (const [prefix, colour, day, night] of table) if (name.startsWith(prefix)) return { colour, day, night }
  return { colour: WARM, day: 0, night: 2 }
}

interface Glow {
  material: MeshStandardMaterial
  day: number
  night: number
  ring: boolean
  ai: 'chess' | 'checkers' | 'go' | null
}

/** A steady 120 bpm thump; the Spotify player doesn't expose its audio. */
const beat = (s: number) => Math.pow(0.5 + 0.5 * Math.cos(s * Math.PI * 4), 6)

const LIVE_SCREENS: Record<string, () => screens.LiveScreen> = {
  SCR_main: screens.mainScreen,
  SCR_vertical: screens.verticalScreen,
  SCR_laptop: screens.laptopScreen,
  SCR_agent_a: screens.agentGraphScreen,
  SCR_agent_b: screens.agentLogScreen,
  SCR_tv: screens.tvScreen,
  SCR_music: () => screens.musicScreen(() => musicPulse.playing, (t) => 0.3 + 0.7 * beat(t)),
  SCR_bike: screens.bikeScreen,
  SCR_tread: screens.treadmillScreen,
  SCR_ai_chess: () => screens.aiStatusScreen(() => boardStatus.chess),
  SCR_KEYPAD_main: () => screens.keypadScreen(() => DESK_SIT + deskState.lift),
  SCR_KEYPAD_lab: () => screens.keypadScreen(() => DESK_SIT + deskState.labLift),
  SCR_coffee: screens.coffeeScreen,
  SCR_pcpump: screens.pumpScreen,
  SCR_pcpost: screens.postScreen,
  SCR_ipad: screens.ipadScreen,
  SCR_dyson: screens.dysonScreen,
  SCR_blindpanel: () =>
    screens.blindPanelScreen(() => ({
      groups: blindGroups.map((g) => ({ id: g.id, down: blinds[g.id] ?? 0 })),
      moving: blindHold.dir !== 0 ? blindHold.id : '',
    })),
}

/** Blind groups a held button moves: one group, or every group from the door panel. */
function heldGroups() {
  if (blindHold.id === 'all') return blindGroups.map((g) => g.id)
  return blindHold.id in blinds ? [blindHold.id] : []
}

/** Leaves get their veins (and the snake plant its bands); u runs across a leaf, v along it. */
const LEAVES: Record<string, () => Texture> = {
  M_leaf_fiddle: () => paint.paintLeaf('#2c5a22', '#77a356'),
  M_leaf_monstera: () => paint.paintLeaf('#1d4a22', '#5e8f4b'),
  M_leaf_bop: () => paint.paintLeaf('#365f30', '#86ab6c'),
  M_leaf_snake: () => paint.paintLeaf('#23502a', '', true),
}

/** How far a blind can drop: from under its cassette to the sill. */
const BLIND_DROP = layout.room.height - 0.16 - 0.07
/** Blinds move at a motor's pace: about four and a half seconds top to bottom. */
const BLIND_SPEED = 0.22

interface Blind {
  roll?: Object3D
  hem?: Object3D
  texture?: Texture
}

/** Celsius-style flavours: the colour of each can's sweep. */
const FLAVOURS = ['#f26b1d', '#6cc24a', '#7b3fa0', '#f7a07a', '#48b3e6']

/** Slim cans filling the cooler's shelves, two rows deep, labels to the door. */
function stockCooler(item: Item) {
  const depth = item.size?.[2] ?? 0.58
  const geometry = new CylinderGeometry(0.0305, 0.0305, 0.155, 28)
  const group = new Group()
  group.name = 'COOL_stock'
  const slots: { flavour: number; x: number; y: number; z: number; turn: number }[] = []
  ;(item.shelves ?? []).forEach((shelf, s) => {
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 7; col++) {
        const flavour = (s + Math.floor(col / 3) + row) % FLAVOURS.length
        // The label's middle is on the can's far side; half a turn brings it to the door.
        const turn = Math.PI + Math.sin(col * 7.1 + s * 3.3 + row) * 0.35
        slots.push({ flavour, x: -0.21 + col * 0.07, y: shelf + 0.004 + 0.0775, z: depth / 2 - 0.075 - row * 0.085, turn })
      }
    }
  })
  const m = new Matrix4()
  const q = new Quaternion()
  const up = new Vector3(0, 1, 0)
  const one = new Vector3(1, 1, 1)
  const materials: MeshStandardMaterial[] = []
  FLAVOURS.forEach((colour, f) => {
    const mine = slots.filter((slot) => slot.flavour === f)
    const label = paint.paintCanLabel(colour)
    // three's own cylinder has v up the side, so this texture keeps the default flip.
    label.flipY = true
    const material = new MeshStandardMaterial({ map: label, metalness: 0.55, roughness: 0.32 })
    materials.push(material)
    const mesh = new InstancedMesh(geometry, material, Math.max(1, mine.length))
    mine.forEach((slot, i) => mesh.setMatrixAt(i, m.compose(new Vector3(slot.x, slot.y, slot.z), q.setFromAxisAngle(up, slot.turn), one)))
    mesh.count = mine.length
    group.add(mesh)
  })
  return { group, materials }
}

interface Clock {
  zone: string
  city: string
  hour?: Object3D
  minute?: Object3D
  second?: Object3D
  label?: MeshStandardMaterial
  offsetMs: number
}

function zoneOffsetMs(zone: string, now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  )
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second)
  return Math.round((asUtc - now.getTime()) / 60000) * 60000
}

function zoneTimeText(zone: string) {
  return new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit' }).format(new Date())
}

// Dressing swaps materials on useGLTF's cached scene, so it must happen once per
// scene: React may run a memo twice (Strict Mode does in development), and a
// second pass would put fresh screen textures on the meshes while the frame
// loop kept redrawing the first pass's canvases.
const dressedScenes = new WeakMap<Object3D, ReturnType<typeof dressOnce>>()

function dress(root: Object3D) {
  let dressed = dressedScenes.get(root)
  if (!dressed) {
    dressed = dressOnce(root)
    dressedScenes.set(root, dressed)
  }
  return dressed
}

function dressOnce(root: Object3D) {
  const glows: Glow[] = []
  const switches: Object3D[] = []
  const live: screens.LiveScreen[] = []
  const notes: { material: MeshStandardMaterial; text: string }[] = []
  const woofers: Object3D[] = []
  const platters: Object3D[] = []
  let dysonHead: Object3D | null = null
  let whiteboard: MeshStandardMaterial | null = null
  const pages: { material: MeshStandardMaterial; side: 'left' | 'right' }[] = []
  const clocks = new Map<string, Clock>()
  let deskTop: Object3D | null = null
  let labTop: Object3D | null = null
  let spine: Object3D | null = null
  let labSpine: Object3D | null = null
  let lightBar: SpotLight | null = null
  let pcLight: PointLight | null = null
  let zeusLight: PointLight | null = null
  let cooler: Object3D | null = null
  const rotors: Object3D[] = []
  const rgb: MeshStandardMaterial[] = []
  const blindParts = new Map<string, Blind>()
  const metals = new Set<MeshStandardMaterial>()
  const fabrics: MeshStandardMaterial[] = []
  const linen = paint.paintLinen()
  const blindPart = (id: string) => {
    const part = blindParts.get(id) ?? {}
    blindParts.set(id, part)
    return part
  }
  let crank: Object3D | null = null
  let flywheel: Object3D | null = null
  let belt: Texture | null = null
  let board: MeshStandardMaterial | null = null
  let pinBoard: MeshStandardMaterial | null = null

  const clocksItem = itemById.get('world-clocks') as unknown as { clocks?: { city: string; zone: string }[] } | undefined
  for (const c of clocksItem?.clocks ?? []) clocks.set(c.city, { city: c.city, zone: c.zone, offsetMs: zoneOffsetMs(c.zone) })

  // Low-E glazing tints the view slightly darker and green-grey; a pale glass
  // would lay a white film over the whole city instead.
  const glass = new MeshStandardMaterial({ name: 'office-glass', color: '#2f3d3c', transparent: true, opacity: 0.14, roughness: 0.03, metalness: 0.1, depthWrite: false })
  const acrylic = new MeshStandardMaterial({ color: '#0b0b10', transparent: true, opacity: 0.55, roughness: 0.12 })
  const coolerGlass = new MeshStandardMaterial({ color: '#1c2430', transparent: true, opacity: 0.32, roughness: 0.05, metalness: 0.2, depthWrite: false })
  const chairMesh = new MeshStandardMaterial({ map: paint.paintChairMesh(), alphaTest: 0.5, side: DoubleSide, roughness: 0.8 })
  const pcGlass = new MeshPhysicalMaterial({ color: '#c9d4dc', transparent: true, opacity: 0.12, roughness: 0.04, depthWrite: false })
  const clearGlass = new MeshStandardMaterial({ color: '#e8f2f6', transparent: true, opacity: 0.22, roughness: 0.04, metalness: 0.1, side: DoubleSide, depthWrite: false })
  // Thinner glass for vessels with something in them (the cold-drip tower, the syrups), so
  // the coffee and syrup inside keep their colour; and the water in the drip globe.
  const vesselGlass = new MeshStandardMaterial({ color: '#f2f7f9', transparent: true, opacity: 0.1, roughness: 0.03, metalness: 0.1, side: DoubleSide, depthWrite: false })
  const water = new MeshStandardMaterial({ color: '#86c0dc', transparent: true, opacity: 0.26, roughness: 0.04, depthWrite: false })
  const sharedLeaves: Record<string, MeshStandardMaterial> = {}

  root.traverse((object) => {
    const name = object.name
    if (name === 'DESK_top') deskTop = object
    if (name === 'LAB_top') labTop = object
    if (name === 'DESK_spine') spine = object
    if (name === 'LAB_spine') labSpine = object
    if (name === 'ITEM_wine-cooler') cooler = object
    if (/^PCFAN_\d+_rotor$/.test(name)) rotors.push(object)
    if (name.startsWith('TT_spin_')) platters.push(object)
    if (name === 'DYSON_head') dysonHead = object
    // Each woofer pulses as one unit: cone, surround, cap and its light ring.
    if (/^(SPK_woof|STD_woof|SUB_woofer).*_unit$/.test(name)) woofers.push(object)
    if (name === 'LIGHTBAR') {
      // A monitor light bar: a soft, wide beam down onto the keyboard and mouse.
      lightBar = new SpotLight('#fff3e2', 0, 1.8, 0.95, 0.85, 2)
      lightBar.position.set(0, -0.02, 0.02)
      const aim = new Object3D()
      aim.position.set(0, -0.72, 0.43)
      object.add(lightBar, aim)
      lightBar.target = aim
    }
    if (name === 'LGT_zeus') {
      // A small warm light in the statue's niche, so the marble isn't a silhouette.
      zeusLight = new PointLight('#ffd9a8', 0, 1.6, 2)
      object.add(zeusLight)
    }
    if (name === 'PC') {
      // A little of the fans' colour spills onto the desk around the case.
      pcLight = new PointLight('#ff00ff', 0, 0.9, 2)
      pcLight.position.set(-0.05, 0.25, 0)
      object.add(pcLight)
    }
    const blindMatch = /^BLIND(ROLL|HEM)_(\w+)$/.exec(name)
    if (blindMatch) blindPart(blindMatch[2])[blindMatch[1] === 'ROLL' ? 'roll' : 'hem'] = object
    if (name === 'BIKE_crank') crank = object
    if (name === 'BIKE_flywheel') flywheel = object
    if (name.startsWith('SWT_')) switches.push(object)
    const clockHand = /^CLOCK_([hms])_([A-Za-z]+)$/.exec(name)
    if (clockHand) {
      const c = clocks.get(clockHand[2])
      if (c) c[clockHand[1] === 'h' ? 'hour' : clockHand[1] === 'm' ? 'minute' : 'second'] = object
    }

    const mesh = object as Mesh
    if (!mesh.isMesh) return
    const material = mesh.material as MeshStandardMaterial
    const flat = /^(FLR_|WAL_|CEIL|SOFFIT|GLS_|BASE_|RUG|BOARD_|TAPE_|NOTE_|SIGN_)/.test(name)
    mesh.castShadow = !flat && !name.startsWith('EMI_') && !name.startsWith('SCR_')
    mesh.receiveShadow = true

    if (material.metalness >= 0.5 && !name.startsWith('EMI_')) metals.add(material)
    if (material.name === 'M_glass') {
      mesh.material = glass
      mesh.castShadow = false
    } else if (material.name === 'M_pc_glass') {
      mesh.material = pcGlass
      mesh.castShadow = false
    } else if (name.startsWith('BLINDF_')) {
      // Linen, lit from behind by day so it glows a little like real fabric.
      const texture = linen.clone()
      texture.needsUpdate = true
      const fabric = new MeshStandardMaterial({ map: texture, roughness: 0.95, side: DoubleSide, emissive: '#fff6e8', emissiveMap: texture, emissiveIntensity: 0 })
      mesh.material = fabric
      fabrics.push(fabric)
      blindPart(name.slice(7)).texture = texture
    } else if (name.startsWith('SPOTNUM_')) {
      mesh.material = new MeshStandardMaterial({ map: paint.paintSpotNumber(itemById.get(name.slice(8))?.spot ?? 0), roughness: 0.7 })
    } else if (/^EMI_pc(ring|ram|pump|rgb)/.test(name)) {
      const own = material.clone() as MeshStandardMaterial
      own.emissive = new Color('#ff00ff')
      own.emissiveIntensity = 2
      mesh.material = own
      mesh.castShadow = false
      rgb.push(own)
    } else if (material.name === 'M_acrylic') mesh.material = acrylic
    else if (material.name === 'M_cooler_glass') {
      mesh.material = coolerGlass
      mesh.castShadow = false
    } else if (name.startsWith('CHR_mesh')) mesh.material = chairMesh
    else if (name === 'BOARD_glass') {
      board = new MeshStandardMaterial({ transparent: true, roughness: 0.5, emissive: '#ffffff', emissiveIntensity: 0.08, depthWrite: false })
      mesh.material = board
    } else if (name === 'BOARD_pin') {
      pinBoard = new MeshStandardMaterial({ roughness: 0.95 })
      mesh.material = pinBoard
    } else if (name in LIVE_SCREENS) {
      const screen = LIVE_SCREENS[name]()
      live.push(screen)
      mesh.material = new MeshBasicMaterial({ map: screen.texture, toneMapped: true })
    } else if (name.startsWith('ART_') && !name.startsWith('ART_frame')) {
      const key = name.slice(4)
      const [w, h] = layout.items.find((i) => i.art === key)?.size ?? [1, 1.3]
      mesh.material = new MeshStandardMaterial({ map: paint.paintArtwork(key, w, h), roughness: 0.82 })
    } else if (name === 'BOARD_white') {
      whiteboard = new MeshStandardMaterial({ roughness: 0.25 })
      mesh.material = whiteboard
    } else if (name === 'NOTEBOOK_left' || name === 'NOTEBOOK_right') {
      const page = new MeshStandardMaterial({ roughness: 0.92, side: DoubleSide })
      pages.push({ material: page, side: name.endsWith('left') ? 'left' : 'right' })
      mesh.material = page
    } else if (name === 'PCB_board') {
      mesh.material = new MeshStandardMaterial({ map: paint.paintPcb(), roughness: 0.6 })
    } else if (name === 'PSU_label') {
      mesh.material = new MeshStandardMaterial({ map: paint.paintPsuLabel(), roughness: 0.5 })
    } else if (material.name === 'M_dyson_mesh') {
      const holes = paint.paintPerforation()
      holes.repeat.set(24, 13)
      mesh.material = new MeshStandardMaterial({ map: holes, metalness: 0.35, roughness: 0.45 })
      metals.add(mesh.material as MeshStandardMaterial)
    } else if (material.name in LEAVES) {
      const leaf = (sharedLeaves[material.name] ??= new MeshStandardMaterial({ map: LEAVES[material.name](), roughness: material.roughness, side: DoubleSide }))
      mesh.material = leaf
    } else if (material.name === 'M_glass_clear') {
      mesh.material = clearGlass
      mesh.castShadow = false
    } else if (material.name === 'M_water') {
      mesh.material = water
      mesh.castShadow = false
    } else if (material.name === 'M_glass_vessel') {
      mesh.material = vesselGlass
      mesh.castShadow = false
    } else if (name.startsWith('NOTE_')) {
      const note = new MeshStandardMaterial({ roughness: 0.95 })
      notes.push({ material: note, text: itemById.get(name.slice(5))?.note ?? '' })
      mesh.material = note
    } else if (name === 'RUG_top') {
      const [w, d] = (itemById.get('rug-lounge')?.size ?? [4.6, 3.6]) as [number, number]
      mesh.material = new MeshStandardMaterial({ map: paint.paintPersianRug(w, d), roughness: 1 })
    } else if (name === 'RUG_rug-games') {
      const [w, d] = (itemById.get('rug-games') as unknown as { size: [number, number] }).size
      mesh.material = new MeshStandardMaterial({ map: paint.paintGameRug(w, d), roughness: 1 })
    } else if (name === 'FLR_main_top') {
      const planks = paint.paintFloor()
      planks.repeat.set(layout.room.width / paint.FLOOR_TILE_M, layout.room.depth / paint.FLOOR_TILE_M)
      mesh.material = new MeshStandardMaterial({ map: planks, roughness: 0.42 })
    } else if (name === 'CTBL_top') {
      mesh.material = new MeshPhysicalMaterial({ map: paint.paintTravertine(), roughness: 0.55, clearcoat: 0.25, clearcoatRoughness: 0.5 })
    } else if (name === 'FLR_kitchen') {
      const tile = paint.paintTile()
      const k = layout.items.find((i) => i.id === 'kitchen') as unknown as { floor: { x0: number; x1: number; z0: number; z1: number } }
      tile.repeat.set((k.floor.x1 - k.floor.x0) / 0.6, (k.floor.z1 - k.floor.z0) / 0.6)
      mesh.material = new MeshStandardMaterial({ map: tile, roughness: 0.35 })
    } else if (name.startsWith('GAMEBOARD_')) {
      mesh.material = new MeshStandardMaterial({ map: paint.paintBoard(name.slice(10)), roughness: 0.55 })
    } else if (name === 'SIGN_DOOR_restroom') {
      mesh.material = new MeshStandardMaterial({ map: paint.paintSign('Restroom'), roughness: 0.6 })
    } else if (name === 'TREAD_belt') {
      belt = paint.paintBelt()
      mesh.material = new MeshStandardMaterial({ map: belt, roughness: 0.9 })
    } else if (name.startsWith('CLOCK_face_')) {
      mesh.material = new MeshStandardMaterial({ map: paint.paintClockFace(name.slice(11)), roughness: 0.6 })
    } else if (name.startsWith('CLOCK_label_')) {
      const city = name.slice(12)
      // Like a small LCD: the label lights itself, text and all (an emissive
      // colour without a map would only wash it grey).
      const label = new MeshStandardMaterial({ roughness: 0.6, emissive: '#ffffff', emissiveIntensity: 0.55 })
      const c = clocks.get(city)
      if (c) {
        c.label = label
        label.map = paint.paintClockLabel(city, zoneTimeText(c.zone))
        label.emissiveMap = label.map
      }
      mesh.material = label
    } else if (name.startsWith('EMI_')) {
      const g = glowFor(name)
      const own = material.clone()
      own.emissive = g.colour.clone()
      mesh.material = own
      const ai = name.startsWith('EMI_ai_ring_chess') ? 'chess' : name.startsWith('EMI_ai_checkers') ? 'checkers' : name.startsWith('EMI_ai_go') ? 'go' : null
      glows.push({ material: own, day: g.day, night: g.night, ring: name.startsWith('EMI_ring'), ai })
    }
  })

  // Stock the cooler. The cans are made here, not in Blender, so their labels can be painted.
  const coolerItem = itemById.get('wine-cooler')
  const coolerRoot = cooler as Object3D | null
  if (coolerItem && coolerRoot) {
    const stock = stockCooler(coolerItem)
    coolerRoot.add(stock.group)
    for (const m of stock.materials) metals.add(m)
  }
  // Every blind starts open.
  for (const g of blindGroups) blinds[g.id] ??= 0

  /** Paint everything that uses the marker font (again once the font loads). */
  const paintText = (photos: (HTMLImageElement | null)[] = []) => {
    const swap = (material: MeshStandardMaterial | null, map: Texture) => {
      if (!material) return
      material.map?.dispose()
      material.map = map
      if (material === board) material.emissiveMap = map
      material.needsUpdate = true
    }
    swap(board, paint.paintGlassBoard())
    swap(pinBoard, paint.paintPinBoard(photos))
    swap(whiteboard, paint.paintWhiteboard())
    pages.forEach((p) => swap(p.material, paint.paintNotebookPage(p.side)))
    notes.forEach((n) => swap(n.material, paint.paintNote(n.text)))
  }
  paintText()

  const refreshClockLabels = () => {
    for (const c of clocks.values()) {
      c.offsetMs = zoneOffsetMs(c.zone)
      if (!c.label) continue
      c.label.map?.dispose()
      c.label.map = paint.paintClockLabel(c.city, zoneTimeText(c.zone))
      c.label.emissiveMap = c.label.map
      c.label.needsUpdate = true
    }
  }

  return {
    glows,
    switches,
    live,
    woofers,
    clocks: [...clocks.values()],
    paintText,
    refreshClockLabels,
    rotors,
    rgb,
    platters,
    blindParts,
    fabrics,
    metals: [...metals],
    get deskTop() {
      return deskTop as Object3D | null
    },
    get labTop() {
      return labTop as Object3D | null
    },
    get spine() {
      return spine as Object3D | null
    },
    get labSpine() {
      return labSpine as Object3D | null
    },
    get lightBar() {
      return lightBar as SpotLight | null
    },
    get pcLight() {
      return pcLight as PointLight | null
    },
    get zeusLight() {
      return zeusLight as PointLight | null
    },
    get dysonHead() {
      return dysonHead as Object3D | null
    },
    get crank() {
      return crank as Object3D | null
    },
    get flywheel() {
      return flywheel as Object3D | null
    },
    get belt() {
      return belt as Texture | null
    },
    get board() {
      return board as MeshStandardMaterial | null
    },
  }
}

/** Your own photos for the pin board, as listed in content.ts (empty ones are skipped). */
function loadBoardPhotos() {
  return Promise.all(
    owner.photos.map(
      ({ src }) =>
        new Promise<HTMLImageElement | null>((resolve) => {
          if (!src) return resolve(null)
          const img = new Image()
          img.onload = () => resolve(img)
          img.onerror = () => resolve(null)
          img.src = src
        }),
    ),
  )
}

export function Office() {
  const { scene } = useGLTF(MODEL_URL, DRACO_PATH)
  const dressed = useMemo(() => dress(scene), [scene])
  const gl = useThree((s) => s.gl)

  // Metals need something to reflect, or chrome and steel render nearly black.
  // A small studio environment, applied only to metal surfaces.
  useEffect(() => {
    const pmrem = new PMREMGenerator(gl)
    const room = new RoomEnvironment()
    const env = pmrem.fromScene(room, 0.04).texture
    for (const m of dressed.metals) {
      m.envMap = env
      m.needsUpdate = true
    }
    room.dispose()
    pmrem.dispose()
    return () => env.dispose()
  }, [dressed, gl])

  useEffect(() => {
    let cancelled = false
    Promise.all([document.fonts.load('48px "Permanent Marker"'), loadBoardPhotos()]).then(([, photos]) => {
      if (!cancelled) dressed.paintText(photos)
    })
    const id = window.setInterval(dressed.refreshClockLabels, 20000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [dressed])

  useEffect(() => {
    const flip = (night: boolean) =>
      dressed.switches.forEach((s) => gsap.to(s.rotation, { x: night ? -0.32 : 0.32, duration: 0.18, ease: 'power2.out' }))
    flip(useGame.getState().night)
    return useGame.subscribe((s) => s.night, flip)
  }, [dressed])

  useFrame(({ clock }, delta) => {
    const n = tod.value
    const t = clock.elapsedTime
    const thump = musicPulse.playing ? beat(t) : 0
    for (const g of dressed.glows) {
      let v = g.day + (g.night - g.day) * n
      if (g.ring && musicPulse.playing) v += 0.4 + 2.2 * thump
      if (g.ai && boardThinking[g.ai]) v *= 0.6 + 0.6 * (0.5 + 0.5 * Math.sin(t * 8))
      g.material.emissiveIntensity = v
    }
    for (const w of dressed.woofers) w.scale.setScalar(1 + 0.035 * thump)
    // Records turn at 33⅓ while the music plays.
    if (musicPulse.playing) for (const p of dressed.platters) p.rotation.y -= delta * ((33.333 / 60) * Math.PI * 2)
    // The purifier sweeps slowly from side to side.
    const dyson = dressed.dysonHead
    if (dyson) dyson.rotation.y = Math.sin(t * 0.21) * 0.6
    if (dressed.board) dressed.board.emissiveIntensity = 0.08 + 0.32 * n

    // Each desk rides on its own legs.
    const deskTop = dressed.deskTop
    if (deskTop) deskTop.position.y = DESK_SIT + deskState.lift
    const labTop = dressed.labTop
    if (labTop) labTop.position.y = DESK_SIT + deskState.labLift
    const spine = dressed.spine
    if (spine) spine.scale.y = (DESK_SIT - 0.15 + deskState.lift) / (DESK_SIT - 0.15)
    const labSpine = dressed.labSpine
    if (labSpine) labSpine.scale.y = (DESK_SIT - 0.15 + deskState.labLift) / (DESK_SIT - 0.15)
    const zeusLight = dressed.zeusLight
    if (zeusLight) zeusLight.intensity = 0.5 + 1.1 * n
    const bar = dressed.lightBar
    if (bar) bar.intensity = 1.2 + 2.3 * n
    for (const m of dressed.metals) m.envMapIntensity = 1 - 0.75 * n
    for (const f of dressed.fabrics) f.emissiveIntensity = 0.28 * (1 - n)

    // Blinds: the held group moves at motor speed and stops where you let go.
    if (blindHold.dir !== 0) {
      for (const id of heldGroups()) blinds[id] = Math.min(1, Math.max(0, blinds[id] + blindHold.dir * BLIND_SPEED * delta))
    }
    for (const [id, part] of dressed.blindParts) {
      const drop = (blinds[id] ?? 0) * BLIND_DROP
      if (part.roll) {
        part.roll.visible = drop > 0.003
        part.roll.scale.y = Math.max(drop, 0.001)
      }
      if (part.hem) part.hem.position.y = -drop
      // Keep the weave the same size however far the blind is down.
      if (part.texture) part.texture.repeat.set(8, Math.max(drop, 0.01) / 0.3)
    }

    // The PC: fans spin, and a rainbow runs across their rings and the memory.
    for (const r of dressed.rotors) r.rotation.y += delta * 9
    dressed.rgb.forEach((m, i) => {
      m.emissive.setHSL((t * 0.12 + i * 0.07) % 1, 1, 0.55)
      m.emissiveIntensity = 1.6 + 0.8 * n
    })
    const pcLight = dressed.pcLight
    if (pcLight && dressed.rgb[0]) {
      pcLight.color.copy(dressed.rgb[0].emissive)
      pcLight.intensity = 0.25 + 0.55 * n
    }

    // Clock hands on each city's time; the second hand sweeps.
    const now = Date.now()
    for (const c of dressed.clocks) {
      const local = now + c.offsetMs
      const seconds = (local / 1000) % 60
      const minutes = (local / 60000) % 60
      const hours = (local / 3600000) % 12
      if (c.second) c.second.rotation.z = -(seconds / 60) * Math.PI * 2
      if (c.minute) c.minute.rotation.z = -(minutes / 60) * Math.PI * 2
      if (c.hour) c.hour.rotation.z = -(hours / 12) * Math.PI * 2
    }

    // Exercise machines move with the visitor's effort.
    const crank = dressed.crank
    const flywheel = dressed.flywheel
    if (exercise.machine === 'bike') {
      if (crank) crank.rotation.x = exercise.phase
      if (flywheel) flywheel.rotation.x = exercise.phase * 3
    }
    const belt = dressed.belt
    if (exercise.machine === 'treadmill' && belt) belt.offset.y += ((exercise.speed / 3.6) * delta * belt.repeat.y) / 1.55

    // Each screen keeps its own pace (most at 12 fps, the TV's match at 24).
    for (const s of dressed.live) s.update(t)
  })

  return <primitive object={scene} />
}

useGLTF.preload(MODEL_URL, DRACO_PATH)

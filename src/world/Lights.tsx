import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { Color, type DirectionalLight, type HemisphereLight, Object3D, type PointLight, type RectAreaLight, type SpotLight } from 'three'
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js'
import { layout, type V3 } from '../layout'
import { tod } from '../state/store'
import { MOON_DIR, SUN_DIR } from './Sky'

// Every light in the office, driven by one number: tod (0 = day, 1 = night).
// Day: low afternoon sun through the west glass and bright sky fill.
// Night: the room lights itself in layers: spots on the art, a warm wash on
// the walls, the desk pendant, kitchen globes, the shelf strips, screen glow,
// the floor lamp and the neon's warm spill.

RectAreaLightUniformsLib.init()

const SKY_DAY = new Color('#dceaff')
const SKY_NIGHT = new Color('#2a3563')
const GROUND_DAY = new Color('#d2c6b4')
const GROUND_NIGHT = new Color('#16110e')
const WARM = '#ffc58f'
const SUN_COLOUR = new Color('#fff1dc')
const MOON_COLOUR = new Color('#a9bcff')

const spotFixtures = layout.items.filter((i) => i.type === 'spot-fixture')
const neonItem = layout.items.find((i) => i.id === 'neon')
const lampItem = layout.items.find((i) => i.id === 'floor-lamp')
const pendantItem = layout.items.find((i) => i.id === 'pendant-desk')

function ArtSpot({ position, target, power }: { position: V3; target: V3; power: { value: number } }) {
  const light = useRef<SpotLight>(null)
  const aim = useMemo(() => new Object3D(), [])
  useLayoutEffect(() => {
    aim.position.set(...target)
    if (light.current) light.current.target = aim
  }, [aim, target])
  useFrame(() => {
    if (light.current) light.current.intensity = power.value
  })
  return (
    <>
      <primitive object={aim} />
      <spotLight ref={light} position={position} color={WARM} angle={0.42} penumbra={0.7} decay={2} distance={9} />
    </>
  )
}

function Rect({ position, lookAt, width, height, color, peak, day = 0 }: { position: V3; lookAt: V3; width: number; height: number; color: string; peak: number; day?: number }) {
  const light = useRef<RectAreaLight>(null)
  useLayoutEffect(() => light.current?.lookAt(...lookAt), [lookAt])
  useFrame(() => {
    if (light.current) light.current.intensity = day + (peak - day) * tod.value
  })
  return <rectAreaLight ref={light} position={position} width={width} height={height} color={color} />
}

export function Lights() {
  const sun = useRef<DirectionalLight>(null)
  const hemi = useRef<HemisphereLight>(null)
  const pendant = useRef<SpotLight>(null)
  const lamp = useRef<PointLight>(null)
  const neon = useRef<PointLight>(null)
  const pendantAim = useMemo(() => new Object3D(), [])
  const spotPower = useMemo(() => ({ value: 0 }), [])
  const [px, py, pz] = pendantItem?.position ?? [0, 2.75, 0]
  const [lx, , lz] = lampItem?.position ?? [0, 0, 0]
  const [nx, ny, nz] = neonItem?.position ?? [0, 2, 0]

  useLayoutEffect(() => {
    pendantAim.position.set(px, 0.7, pz)
    if (pendant.current) pendant.current.target = pendantAim
  }, [pendantAim, px, pz])

  useFrame(() => {
    const n = tod.value
    const d = 1 - n
    // One shadow-casting key light: the sun by day, swinging round to the moon
    // by night, so the mullions throw cool moon shadows across the floor.
    if (sun.current) {
      sun.current.intensity = 3.4 * d + 0.65 * n
      sun.current.position.lerpVectors(SUN_DIR, MOON_DIR, n).normalize().multiplyScalar(30)
      sun.current.color.lerpColors(SUN_COLOUR, MOON_COLOUR, n)
    }
    if (hemi.current) {
      hemi.current.intensity = 0.95 * d + 0.3 * n
      hemi.current.color.lerpColors(SKY_DAY, SKY_NIGHT, n)
      hemi.current.groundColor.lerpColors(GROUND_DAY, GROUND_NIGHT, n)
    }
    spotPower.value = 24 * n
    if (pendant.current) pendant.current.intensity = 3 + 15 * n
    if (lamp.current) lamp.current.intensity = 3.5 * n
    if (neon.current) neon.current.intensity = 1.8 * n
  })

  const hz = layout.room.depth / 2
  const hx = layout.room.width / 2
  // The cove LEDs sit just under the soffit, wherever the ceiling is.
  const cove = layout.room.height - 0.18
  return (
    <>
      <hemisphereLight ref={hemi} />
      <directionalLight
        ref={sun}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-camera-left={-13}
        shadow-camera-right={13}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
        shadow-camera-near={1}
        shadow-camera-far={60}
      />

      {spotFixtures.map((s) => (
        <ArtSpot key={s.id} position={s.position} target={s.target ?? [0, 0, 0]} power={spotPower} />
      ))}
      <spotLight ref={pendant} position={[px, py - 0.05, pz]} color={WARM} angle={1.05} penumbra={1} decay={2} distance={6} />
      <pointLight ref={lamp} position={[lx, 1.5, lz]} color="#ffb070" decay={2} distance={6} />
      <pointLight ref={neon} position={[nx - 0.45, ny - 0.1, nz]} color="#ffb868" decay={2} distance={3.4} />

      {/* Cove LEDs washing the solid walls. */}
      <Rect position={[0, cove, hz - 0.38]} lookAt={[0, 1.4, hz]} width={layout.room.width - 1} height={0.18} color="#ffbe85" peak={5.5} />
      <Rect position={[hx - 0.38, cove, 3.55]} lookAt={[hx, 1.4, 3.55]} width={5} height={0.18} color="#ffbe85" peak={5.5} />
      {/* Kitchen globes over the island. */}
      <Rect position={[7.8, 2.05, -3.8]} lookAt={[7.8, 0, -3.8]} width={0.6} height={3.2} color="#ffc58f" peak={7} day={0.4} />
      {/* The bookshelf strips throwing light into the room. */}
      <Rect position={[-0.2, 1.4, 5.95]} lookAt={[-0.2, 1.2, 3.5]} width={5.6} height={1.6} color="#ffc58f" peak={1.4} />
      {/* Screen glow on the chair and the floor at the desk. */}
      <Rect position={[-3.3, 1.25, -5.55]} lookAt={[-3.3, 1.0, -3.5]} width={2.2} height={0.45} color="#9db4ff" peak={2.2} />
    </>
  )
}

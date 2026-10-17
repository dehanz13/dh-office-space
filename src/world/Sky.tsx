import { useTexture } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { AdditiveBlending, BackSide, BufferAttribute, BufferGeometry, type Mesh, ShaderMaterial, SRGBColorSpace, Vector3 } from 'three'
import { tod } from '../state/store'

// The sky: a gradient dome with a sun by day; by night a full moon with its
// glow in the air around it, coloured stars thinning toward the city's glow at
// the horizon, and a faint band of the Milky Way. The moon uses NASA's
// public-domain lunar colour map.

export const SUN_DIR = new Vector3(-24, 16, 9).normalize()
export const MOON_DIR = new Vector3(-0.62, 0.3, -0.72).normalize()
const MOON_DISTANCE = 1500
const MOON_RADIUS = 56
// The plane the Milky Way lies in, tilted across the southern-western sky.
const GALAXY_NORMAL = new Vector3(0.42, 0.62, 0.66).normalize()

const domeShader = {
  vertexShader: /* glsl */ `
    varying vec3 vDir;
    void main() {
      vDir = normalize(position);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform float uNight;
    uniform vec3 uSun;
    uniform vec3 uMoon;
    uniform vec3 uGalaxy;
    varying vec3 vDir;
    float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
    float noise(vec3 p) {
      vec3 i = floor(p);
      vec3 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
                 mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
    }
    float fbm(vec3 p) {
      float v = 0.0;
      float a = 0.5;
      for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
      return v;
    }
    void main() {
      vec3 d = normalize(vDir);
      float h = max(d.y, 0.0);
      float toHorizon = pow(1.0 - h, 3.0);
      vec3 day = mix(vec3(0.16, 0.38, 0.78), vec3(0.78, 0.86, 0.93), toHorizon);
      float sunGlow = pow(max(dot(d, uSun), 0.0), 18.0);
      day += vec3(1.0, 0.78, 0.5) * sunGlow * 0.6 + vec3(1.0, 0.9, 0.7) * pow(max(dot(d, uSun), 0.0), 900.0) * 6.0;

      vec3 night = mix(vec3(0.006, 0.009, 0.024), vec3(0.045, 0.045, 0.075), toHorizon);
      // Light pollution: the city warms the bottom of the sky.
      night += vec3(0.3, 0.16, 0.1) * pow(1.0 - h, 9.0) * 0.5;
      // Moonlight scattered in the air: a tight aureole and a wide soft glow.
      float c = max(dot(d, uMoon), 0.0);
      night += vec3(0.62, 0.68, 0.82) * (pow(c, 2400.0) * 0.55 + pow(c, 320.0) * 0.11 + pow(c, 26.0) * 0.045);
      // The Milky Way: a mottled band, washed out near the horizon and the moon.
      float band = exp(-pow(dot(d, uGalaxy) / 0.13, 2.0));
      float dust = fbm(d * 7.0) * 0.8 + fbm(d * 23.0) * 0.4;
      float milky = band * smoothstep(0.35, 0.9, dust) * smoothstep(0.12, 0.45, h) * (1.0 - pow(c, 8.0));
      night += vec3(0.11, 0.105, 0.12) * milky * 0.32;

      gl_FragColor = vec4(mix(day, night, uNight), 1.0);
      #include <colorspace_fragment>
    }`,
}

// Star colours by temperature: hot blue-white through sun-like to cool orange.
const STAR_COLOURS: [number, [number, number, number]][] = [
  [0.1, [0.72, 0.82, 1.0]],
  [0.62, [1.0, 1.0, 1.0]],
  [0.82, [1.0, 0.95, 0.84]],
  [0.96, [1.0, 0.82, 0.62]],
  [1.0, [1.0, 0.68, 0.5]],
]

/** Stars: many faint ones, few bright ones, plus a crowd of faint ones along the galaxy's band. */
function useStars(count = 3600, galaxyCount = 1800) {
  return useMemo(() => {
    const total = count + galaxyCount
    const positions = new Float32Array(total * 3)
    const brightness = new Float32Array(total)
    const colours = new Float32Array(total * 3)
    const seeds = new Float32Array(total)
    let s = 1234567
    const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647)
    const dir = new Vector3()
    for (let i = 0; i < total; i++) {
      // A uniform direction on the sphere, kept above the horizon.
      do {
        const y = rand() * 2 - 1
        const u = rand() * 2 * Math.PI
        const r = Math.sqrt(1 - y * y)
        dir.set(Math.cos(u) * r, y, Math.sin(u) * r)
        if (i >= count) {
          // Pull galaxy stars toward the band's plane.
          dir.addScaledVector(GALAXY_NORMAL, -dir.dot(GALAXY_NORMAL) * (0.82 + rand() * 0.16)).normalize()
        }
      } while (dir.y < 0.02)
      positions.set([dir.x * 2300, dir.y * 2300, dir.z * 2300], i * 3)
      // Roughly three times as many stars for each step fainter.
      brightness[i] = i < count ? Math.pow(rand(), 5.5) : Math.pow(rand(), 9) * 0.35
      const pick = rand()
      const colour = STAR_COLOURS.find(([upTo]) => pick <= upTo)?.[1] ?? [1, 1, 1]
      colours.set(colour, i * 3)
      seeds[i] = rand() * 100
    }
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(positions, 3))
    geometry.setAttribute('aBright', new BufferAttribute(brightness, 1))
    geometry.setAttribute('aColour', new BufferAttribute(colours, 3))
    geometry.setAttribute('aSeed', new BufferAttribute(seeds, 1))
    const material = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uNight: { value: 0 },
        uTime: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
        uMoon: { value: MOON_DIR },
      },
      vertexShader: /* glsl */ `
        attribute float aBright;
        attribute vec3 aColour;
        attribute float aSeed;
        uniform float uTime;
        uniform float uPixelRatio;
        uniform vec3 uMoon;
        varying float vAlpha;
        varying vec3 vColour;
        void main() {
          vec3 d = normalize(position);
          float alt = d.y;
          // Faint stars need a darker sky: they fade out higher above the city glow.
          float seen = smoothstep(0.03, 0.1 + 0.4 * (1.0 - aBright), alt);
          // The moon's glare hides stars near it.
          seen *= smoothstep(0.975, 0.93, dot(d, uMoon));
          // Gentle scintillation, stronger through the thicker air near the horizon.
          float amp = 0.06 + 0.22 * (1.0 - alt);
          float twinkle = 1.0 - amp * (0.5 + 0.5 * sin(uTime * (1.3 + fract(aSeed) * 1.7) + aSeed * 11.0));
          vAlpha = (0.32 + 0.68 * sqrt(aBright)) * seen * twinkle;
          vColour = aColour;
          gl_PointSize = (1.1 + aBright * 3.4) * uPixelRatio;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uNight;
        varying float vAlpha;
        varying vec3 vColour;
        void main() {
          float r = length(gl_PointCoord - 0.5) * 2.0;
          float core = exp(-r * r * 7.0);
          gl_FragColor = vec4(vColour * 1.25, core * vAlpha * uNight);
        }`,
    })
    return { geometry, material }
  }, [count, galaxyCount])
}

const moonShader = {
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vView;
    void main() {
      vUv = uv;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vNormal = normalize(normalMatrix * normal);
      vView = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D uMap;
    uniform float uNight;
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vView;
    void main() {
      vec3 albedo = texture2D(uMap, vUv).rgb;
      // A full moon is lit almost evenly to its edge (the opposition effect),
      // so only a whisper of limb darkening; the maria carry the detail.
      float mu = max(dot(normalize(vNormal), normalize(vView)), 0.0);
      float limb = 0.8 + 0.2 * pow(mu, 0.45);
      vec3 col = pow(albedo, vec3(1.18)) * 2.05 * limb * vec3(1.0, 0.975, 0.93);
      gl_FragColor = vec4(col, uNight);
      #include <colorspace_fragment>
    }`,
}

export function Sky() {
  const dome = useMemo(
    () =>
      new ShaderMaterial({
        ...domeShader,
        side: BackSide,
        depthWrite: false,
        uniforms: { uNight: { value: 0 }, uSun: { value: SUN_DIR }, uMoon: { value: MOON_DIR }, uGalaxy: { value: GALAXY_NORMAL } },
      }),
    [],
  )
  const stars = useStars()
  const moonMap = useTexture('/textures/moon.jpg')
  moonMap.colorSpace = SRGBColorSpace
  const moonMaterial = useMemo(() => new ShaderMaterial({ ...moonShader, transparent: true, uniforms: { uMap: { value: moonMap }, uNight: { value: 0 } } }), [moonMap])
  const moon = useRef<Mesh>(null)

  useLayoutEffect(() => {
    // Face the near side (centre of the map, which three puts on +x) toward the office.
    if (!moon.current) return
    moon.current.position.copy(MOON_DIR).multiplyScalar(MOON_DISTANCE)
    moon.current.lookAt(0, 0, 0)
    moon.current.rotateY(-Math.PI / 2)
  }, [])

  useFrame(({ clock }) => {
    const n = tod.value
    dome.uniforms.uNight.value = n
    stars.material.uniforms.uNight.value = n
    stars.material.uniforms.uTime.value = clock.elapsedTime
    moonMaterial.uniforms.uNight.value = n
    if (moon.current) moon.current.visible = n > 0.02
  })

  return (
    <>
      <mesh material={dome} renderOrder={-10} frustumCulled={false}>
        <sphereGeometry args={[2500, 64, 32]} />
      </mesh>
      <points geometry={stars.geometry} material={stars.material} frustumCulled={false} renderOrder={-9} />
      <mesh ref={moon} material={moonMaterial} renderOrder={-7}>
        <sphereGeometry args={[MOON_RADIUS, 96, 48]} />
      </mesh>
    </>
  )
}

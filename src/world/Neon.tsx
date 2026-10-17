import { Text } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { Color, MeshBasicMaterial, type Mesh } from 'three'
import { owner } from '../content'
import { itemById } from '../layout'
import { tod } from '../state/store'

// "Build / With / Danniel." above the music console, one word per line, in a
// script drawn like bent glass tube (Neonderthaw). Clear glass by day; by night
// it glows warm white with an amber halo, like a 2700 K neon tube.

export const NEON_FONT = '/fonts/Neonderthaw.ttf'
export const NEON_GLOW = '#ffb25e'
const OFF = new Color('#d8d3ca')
const ON = new Color('#fff1da').multiplyScalar(2.6)

type TroikaText = Mesh & { outlineOpacity: number }

export function Neon() {
  const item = itemById.get('neon')
  const material = useMemo(() => new MeshBasicMaterial({ color: OFF.clone(), toneMapped: true }), [])
  const lines = useRef<(TroikaText | null)[]>([])

  useFrame(() => {
    const n = tod.value
    material.color.copy(OFF).lerp(ON, n)
    for (const line of lines.current) if (line) line.outlineOpacity = 0.55 * n
  })

  if (!item) return null
  const [x, y, z] = item.position
  const rotY = ((item.rotY ?? 0) * Math.PI) / 180
  const words = ['Build', 'With', `${owner.name}.`]
  return (
    <group position={[x, y, z]} rotation={[0, rotY, 0]}>
      {words.map((word, i) => (
        <Text
          key={word}
          ref={(m: TroikaText | null) => {
            lines.current[i] = m
          }}
          font={NEON_FONT}
          fontSize={0.38}
          letterSpacing={0.01}
          position={[0, 0.3 - i * 0.31, 0.045]}
          anchorX="center"
          anchorY="middle"
          material={material}
          outlineWidth={0.01}
          outlineBlur={0.06}
          outlineColor={NEON_GLOW}
          outlineOpacity={0}
        >
          {word}
        </Text>
      ))}
    </group>
  )
}

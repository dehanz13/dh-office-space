import { useFrame } from '@react-three/fiber'
import { Bloom, EffectComposer, ToneMapping, Vignette } from '@react-three/postprocessing'
import { ToneMappingMode, type BloomEffect } from 'postprocessing'
import { useRef } from 'react'
import { tod } from '../state/store'

// Bloom makes anything brighter than white glow (lamps, neon, lit windows, the
// moon). It rises at night, when those are what you want to notice.

export function Effects() {
  const bloom = useRef<BloomEffect>(null)
  useFrame(() => {
    if (bloom.current) bloom.current.intensity = 0.25 + 0.55 * tod.value
  })
  return (
    <EffectComposer multisampling={4}>
      <Bloom ref={bloom} mipmapBlur luminanceThreshold={1.0} luminanceSmoothing={0.25} intensity={0.4} />
      <Vignette offset={0.32} darkness={0.45} />
      <ToneMapping mode={ToneMappingMode.AGX} />
    </EffectComposer>
  )
}

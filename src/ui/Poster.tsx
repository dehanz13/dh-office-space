import { useState } from 'react'
import { elevatorPosters } from '../content'

// The framed poster on the elevator's left wall: one line about building
// software, picked at random for each ride. The look (colours and a small
// drawing) cycles by position, so new quotes in content.ts get styled too.

type Motif = 'steps' | 'rings' | 'prompt' | 'wave' | 'braces' | 'stack' | 'branch' | 'orbit'

const LOOKS: { palette: string; motif: Motif }[] = [
  { palette: 'signal', motif: 'steps' },
  { palette: 'navy', motif: 'rings' },
  { palette: 'terminal', motif: 'prompt' },
  { palette: 'cream', motif: 'wave' },
  { palette: 'mustard', motif: 'braces' },
  { palette: 'violet', motif: 'stack' },
  { palette: 'cream', motif: 'branch' },
  { palette: 'navy', motif: 'orbit' },
]

function Drawing({ motif }: { motif: Motif }) {
  const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (motif) {
    case 'steps':
      return (
        <>
          {[0, 1, 2].map((i) => (
            <rect key={i} x={14 + i * 26} y={44 - i * 14} width={22} height={12 + i * 14} rx={2} className={i === 2 ? 'accent-fill' : 'ink-fill'} />
          ))}
          <path d="M18 24 L40 14 L62 8 L84 4" {...stroke} className="accent-stroke" strokeDasharray="3 4" />
        </>
      )
    case 'rings':
      return (
        <>
          {[26, 19, 12].map((r) => (
            <circle key={r} cx={50} cy={30} r={r} {...stroke} />
          ))}
          <circle cx={50} cy={30} r={4.5} className="accent-fill" />
        </>
      )
    case 'prompt':
      return (
        <>
          <rect x={8} y={8} width={84} height={46} rx={4} {...stroke} strokeWidth={1.6} />
          <path d="M18 24 L26 30 L18 36" {...stroke} className="accent-stroke" />
          <rect x={32} y={33} width={14} height={4} rx={1} className="accent-fill poster-cursor" />
        </>
      )
    case 'wave':
      return (
        <>
          {[0, 1, 2].map((i) => (
            <path key={i} d={`M6 ${20 + i * 10} Q 20 ${8 + i * 10} 34 ${20 + i * 10} T 62 ${20 + i * 10} T 90 ${20 + i * 10}`} {...stroke} className={i === 1 ? 'accent-stroke' : undefined} />
          ))}
        </>
      )
    case 'braces':
      return (
        <>
          <path d="M34 8 Q24 8 24 18 L24 24 Q24 30 16 30 Q24 30 24 36 L24 42 Q24 52 34 52" {...stroke} strokeWidth={3} />
          <path d="M66 8 Q76 8 76 18 L76 24 Q76 30 84 30 Q76 30 76 36 L76 42 Q76 52 66 52" {...stroke} strokeWidth={3} />
          <circle cx={42} cy={30} r={3.2} className="accent-fill" />
          <circle cx={58} cy={30} r={3.2} className="ink-fill" />
        </>
      )
    case 'stack':
      return (
        <>
          {[0, 1, 2, 3].map((i) => (
            <rect key={i} x={20 + i * 6} y={10 + i * 9} width={52} height={14} rx={3} {...stroke} strokeWidth={1.8} className={i === 3 ? 'accent-stroke' : undefined} />
          ))}
        </>
      )
    case 'branch':
      return (
        <>
          <path d="M8 40 L92 40" {...stroke} />
          <path d="M28 40 Q36 18 50 18 L62 18 Q74 18 80 40" {...stroke} className="accent-stroke" />
          {[16, 28, 80, 90].map((x) => (
            <circle key={x} cx={x} cy={40} r={4} className="ink-fill" />
          ))}
          {[44, 58].map((x) => (
            <circle key={x} cx={x} cy={18} r={4} className="accent-fill" />
          ))}
        </>
      )
    case 'orbit':
      return (
        <>
          <ellipse cx={50} cy={30} rx={38} ry={13} {...stroke} transform="rotate(-14 50 30)" />
          <circle cx={50} cy={30} r={9} className="ink-fill" />
          <circle cx={84} cy={22} r={4} className="accent-fill" />
        </>
      )
  }
}

export function Poster() {
  const [index] = useState(() => Math.floor(Math.random() * elevatorPosters.length))
  const poster = elevatorPosters[index]
  if (!poster) return null
  const look = LOOKS[index % LOOKS.length]
  const long = poster.quote.length > 64
  return (
    <figure className={`lift-poster palette-${look.palette}`}>
      <span className="poster-kicker">
        <span>Engineering notes</span>
        <span>No. {String(index + 1).padStart(2, '0')}</span>
      </span>
      <svg className="poster-art" viewBox="0 0 100 60" aria-hidden="true">
        <Drawing motif={look.motif} />
      </svg>
      <blockquote className={long ? 'long' : undefined}>{poster.quote}</blockquote>
      <figcaption>
        {poster.by}
        {poster.source && <small>{poster.source}</small>}
      </figcaption>
    </figure>
  )
}

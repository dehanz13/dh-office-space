// The elevator's sounds, made with Web Audio rather than recorded: a hall-lantern
// ding, a soft click for the buttons, and the car's low hum while it rises.
// Browsers keep audio silent until the visitor clicks or presses something, so
// the first button press "unlocks" it; a ding that couldn't play is kept and
// played on that first press instead.

let ctx: AudioContext | null = null
let hum: { stop: () => void } | null = null
let pendingDing = false

function audio() {
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    ctx = new Ctor()
  }
  return ctx
}

export function audioReady() {
  return audio()?.state === 'running'
}

/** Call from a click or key press: lets the browser start sound. */
export function unlockAudio() {
  const a = audio()
  if (!a) return
  const play = () => {
    if (pendingDing) {
      pendingDing = false
      ding()
    }
  }
  if (a.state === 'suspended') a.resume().then(play, () => undefined)
  else play()
}

/** The arrival chime: a struck bell, a bright fundamental and a few inharmonic partials. */
export function ding() {
  const a = audio()
  if (!a || a.state !== 'running') {
    pendingDing = true
    a?.resume().then(() => {
      if (pendingDing) {
        pendingDing = false
        ding()
      }
    }, () => undefined)
    return
  }
  const now = a.currentTime
  const out = a.createGain()
  out.gain.value = 0.22
  out.connect(a.destination)
  for (const [ratio, level, decay] of [[1, 1, 2.2], [2.01, 0.42, 1.4], [2.76, 0.26, 1.0], [5.4, 0.12, 0.5]] as const) {
    const osc = a.createOscillator()
    const env = a.createGain()
    osc.type = 'sine'
    osc.frequency.value = 1318.5 * ratio
    env.gain.setValueAtTime(0.0001, now)
    env.gain.exponentialRampToValueAtTime(level, now + 0.006)
    env.gain.exponentialRampToValueAtTime(0.0001, now + decay)
    osc.connect(env).connect(out)
    osc.start(now)
    osc.stop(now + decay + 0.05)
  }
}

/** A short, soft button click. */
export function click() {
  const a = audio()
  if (!a || a.state !== 'running') return
  const now = a.currentTime
  const osc = a.createOscillator()
  const env = a.createGain()
  osc.type = 'triangle'
  osc.frequency.setValueAtTime(2200, now)
  osc.frequency.exponentialRampToValueAtTime(900, now + 0.05)
  env.gain.setValueAtTime(0.08, now)
  env.gain.exponentialRampToValueAtTime(0.0001, now + 0.07)
  osc.connect(env).connect(a.destination)
  osc.start(now)
  osc.stop(now + 0.08)
}

/** The car's low rumble while it climbs; quiet, and only once sound is allowed. */
export function startHum() {
  const a = audio()
  if (!a || a.state !== 'running' || hum) return
  const length = a.sampleRate * 2
  const buffer = a.createBuffer(1, length, a.sampleRate)
  const data = buffer.getChannelData(0)
  let last = 0
  for (let i = 0; i < length; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02
    data[i] = last * 3.5
  }
  const source = a.createBufferSource()
  source.buffer = buffer
  source.loop = true
  const filter = a.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 140
  const gain = a.createGain()
  gain.gain.setValueAtTime(0.0001, a.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.35, a.currentTime + 0.8)
  source.connect(filter).connect(gain).connect(a.destination)
  source.start()
  hum = {
    stop: () => {
      const t = a.currentTime
      gain.gain.cancelScheduledValues(t)
      gain.gain.setValueAtTime(gain.gain.value, t)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.9)
      source.stop(t + 1)
    },
  }
}

export function stopHum() {
  hum?.stop()
  hum = null
}

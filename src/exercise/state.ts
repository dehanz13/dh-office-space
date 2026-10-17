// Shared state for the spin bike and treadmill. Visitors tap ← and → (or A and
// D) in turn; each tap is a pedal stroke or a footstep. The rhythm sets the
// cadence, the cadence sets the speed, and speed eases off when you stop.

export type Machine = 'bike' | 'treadmill'

export const exercise = {
  machine: null as Machine | null,
  cadence: 0, // pedal rpm, or steps per minute
  speed: 0, // km/h
  distance: 0, // km
  seconds: 0, // time spent moving
  calories: 0,
  phase: 0, // radians of crank turn, or stride
  lastSide: '' as '' | 'left' | 'right',
  strokes: [] as number[], // timestamps (ms) of recent correct alternating taps
}

export function startExercise(machine: Machine) {
  Object.assign(exercise, { machine, cadence: 0, speed: 0, distance: 0, seconds: 0, calories: 0, lastSide: '', strokes: [] })
}

export function stopExercise() {
  exercise.machine = null
  exercise.cadence = 0
  exercise.speed = 0
}

/** One tap. Only alternating sides count, the way pedals and feet alternate. */
export function tap(side: 'left' | 'right', now = performance.now()) {
  if (!exercise.machine || side === exercise.lastSide) return
  exercise.lastSide = side
  exercise.strokes.push(now)
  while (exercise.strokes.length > 8) exercise.strokes.shift()
}

/** Advance the simulation by dt seconds. */
export function stepExercise(dt: number, now = performance.now()) {
  if (!exercise.machine) return
  const recent = exercise.strokes.filter((t) => now - t < 1500)
  let cadence = 0
  if (recent.length >= 2) {
    const span = (recent[recent.length - 1] - recent[0]) / 1000
    const perMinute = ((recent.length - 1) / Math.max(span, 0.2)) * 60
    // Two strokes make one pedal revolution; for running each tap is a step.
    cadence = exercise.machine === 'bike' ? perMinute / 2 : perMinute
    // Frantic tapping reads as a sprint, not an impossible number.
    cadence = Math.min(cadence, exercise.machine === 'bike' ? 130 : 200)
  }
  exercise.cadence += (cadence - exercise.cadence) * Math.min(1, dt * 3)
  const target = exercise.machine === 'bike' ? Math.min(45, exercise.cadence * 0.36) : Math.min(20, exercise.cadence * 0.072)
  exercise.speed += (target - exercise.speed) * Math.min(1, dt * (target > exercise.speed ? 2 : 1.2))
  if (exercise.speed < 0.05) exercise.speed = 0
  exercise.distance += (exercise.speed / 3600) * dt
  if (exercise.speed > 0.5) exercise.seconds += dt
  exercise.calories += exercise.speed * 0.0045 * dt
  const turnsPerSecond = exercise.machine === 'bike' ? exercise.cadence / 60 : exercise.cadence / 120
  exercise.phase += turnsPerSecond * Math.PI * 2 * dt
}

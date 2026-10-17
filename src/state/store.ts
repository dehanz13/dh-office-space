import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'

// React state for things the UI shows, plus two plain objects that GSAP
// tweens and the render loop reads every frame without re-rendering React.

export type Phase = 'enter' | 'walk' | 'fly' | 'inspect'

/** 0 = full day, 1 = full night. GSAP tweens this; lights, sky and city read it. */
export const tod = { value: 0 }
/** How far each desk top has risen above sitting height, in metres. */
export const deskState = { lift: 0, labLift: 0 }

/** How far each blind group is lowered, 0 (rolled up) to 1 (down to the sill). */
export const blinds: Record<string, number> = {}
/** The blind group a visitor is holding a button for, and which way: -1 up, 1 down. */
export const blindHold = { id: '', dir: 0 }

/** Night in Dallas between 7 pm and 7 am, so first visits match the real sky. */
function isDallasNight(date = new Date()) {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', hourCycle: 'h23' }).format(date),
  )
  return hour < 7 || hour >= 19
}

const startNight = isDallasNight()
tod.value = startNight ? 1 : 0

interface GameState {
  phase: Phase
  promptId: string | null
  inspectId: string | null
  viewIndex: number
  night: boolean
  deskStanding: boolean
  labStanding: boolean
  locked: boolean
  /** Just back from looking at something: the mouse turns the view even before the pointer is locked again. */
  freeLook: boolean
  setPhase: (phase: Phase) => void
  setPrompt: (id: string | null) => void
  setInspect: (id: string | null, viewIndex?: number) => void
  setView: (viewIndex: number) => void
  setNight: (night: boolean) => void
  setDeskStanding: (standing: boolean) => void
  setLabStanding: (standing: boolean) => void
  setLocked: (locked: boolean) => void
  setFreeLook: (freeLook: boolean) => void
}

export const useGame = create<GameState>()(
  subscribeWithSelector((set) => ({
    phase: 'enter',
    promptId: null,
    inspectId: null,
    viewIndex: 0,
    night: startNight,
    deskStanding: false,
    labStanding: false,
    locked: false,
    freeLook: false,
    setPhase: (phase) => set({ phase }),
    setPrompt: (promptId) => set({ promptId }),
    setInspect: (inspectId, viewIndex = 0) => set({ inspectId, viewIndex }),
    setView: (viewIndex) => set({ viewIndex }),
    setNight: (night) => set({ night }),
    setDeskStanding: (deskStanding) => set({ deskStanding }),
    setLabStanding: (labStanding) => set({ labStanding }),
    setLocked: (locked) => set({ locked }),
    setFreeLook: (freeLook) => set({ freeLook }),
  })),
)

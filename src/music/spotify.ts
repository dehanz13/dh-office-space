import { create } from 'zustand'

// Spotify's Embed iFrame API, loaded only when a visitor opens the music
// corner. The playlist plays in Spotify's own player, in order; this file just
// listens to play/pause so the office can react (speakers, the player screen).
// Spotify's developer policy forbids mixing or overlapping its tracks, so the
// office never alters the audio.

interface PlaybackUpdate {
  data: { isPaused: boolean; isBuffering: boolean; duration: number; position: number }
}

export interface EmbedController {
  addListener(event: 'ready', cb: () => void): void
  addListener(event: 'playback_update', cb: (e: PlaybackUpdate) => void): void
  togglePlay(): void
  destroy(): void
}

interface IFrameAPI {
  createController(
    element: HTMLElement,
    options: { uri: string; width?: string | number; height?: string | number },
    callback: (controller: EmbedController) => void,
  ): void
}

declare global {
  interface Window {
    onSpotifyIframeApiReady?: (api: IFrameAPI) => void
  }
}

let apiPromise: Promise<IFrameAPI> | null = null

export function loadSpotifyApi() {
  if (apiPromise) return apiPromise
  apiPromise = new Promise<IFrameAPI>((resolve, reject) => {
    window.onSpotifyIframeApiReady = (api) => resolve(api)
    const script = document.createElement('script')
    script.src = 'https://open.spotify.com/embed/iframe-api/v1'
    script.async = true
    script.onerror = () => {
      apiPromise = null
      reject(new Error('Spotify player could not load'))
    }
    document.head.appendChild(script)
  })
  return apiPromise
}

interface MusicState {
  /** The visitor opened the music corner at least once, so the player exists. */
  opened: boolean
  ready: boolean
  playing: boolean
  failed: boolean
  open: () => void
  close: () => void
  setReady: (ready: boolean) => void
  setPlaying: (playing: boolean) => void
  setFailed: (failed: boolean) => void
}

export const useMusic = create<MusicState>((set) => ({
  opened: false,
  ready: false,
  playing: false,
  failed: false,
  open: () => set({ opened: true }),
  close: () => set({ opened: false, ready: false, playing: false }),
  setReady: (ready) => set({ ready }),
  setPlaying: (playing) => set({ playing }),
  setFailed: (failed) => set({ failed }),
}))

/** Read by the render loop every frame without subscribing React. */
export const musicPulse = { playing: false }
useMusic.subscribe((s) => {
  musicPulse.playing = s.playing
})

/** The live embed controller, so a key can play or pause from anywhere. */
export const musicControl: { controller: EmbedController | null } = { controller: null }

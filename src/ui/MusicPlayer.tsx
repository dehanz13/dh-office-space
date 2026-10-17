import { useEffect, useRef } from 'react'
import { music } from '../content'
import { loadSpotifyApi, musicControl, useMusic } from '../music/spotify'
import { useGame } from '../state/store'

// Spotify's player. Before it's opened, a small "Music" pill waits in the
// bottom-right corner; Spotify is only contacted once a visitor asks for it
// (the pill, the M key, or the music corner). Open, it is large while you look
// at the music corner and docked in the corner while you walk, so you can
// change tracks anywhere. Spotify's embed stays visible whenever it can play.

export function MusicPlayer() {
  const opened = useMusic((s) => s.opened)
  const failed = useMusic((s) => s.failed)
  const playing = useMusic((s) => s.playing)
  const inspectId = useGame((s) => s.inspectId)
  const phase = useGame((s) => s.phase)
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!opened || !host.current) return
    let cancelled = false
    // Spotify replaces the element it is given, so hand it one React doesn't own.
    const slot = document.createElement('div')
    host.current.appendChild(slot)
    loadSpotifyApi()
      .then((api) => {
        if (cancelled) return
        api.createController(slot, { uri: music.spotifyPlaylistUri, width: '100%', height: '100%' }, (c) => {
          musicControl.controller = c
          c.addListener('ready', () => useMusic.getState().setReady(true))
          c.addListener('playback_update', (e) => useMusic.getState().setPlaying(!e.data.isPaused && !e.data.isBuffering))
        })
      })
      .catch(() => useMusic.getState().setFailed(true))
    const hostEl = host.current
    return () => {
      cancelled = true
      musicControl.controller?.destroy()
      musicControl.controller = null
      hostEl.replaceChildren()
    }
  }, [opened])

  // M opens the player, then plays and pauses it from anywhere in the office.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyM' || e.repeat || useGame.getState().phase === 'enter') return
      if (!useMusic.getState().opened) useMusic.getState().open()
      else musicControl.controller?.togglePlay()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (phase === 'enter') return null
  if (!opened) {
    return (
      <button type="button" className="music-pill" onClick={() => useMusic.getState().open()}>
        <span className="music-pill-note" aria-hidden="true">
          ♪
        </span>
        Music · {music.playlistName} <kbd>M</kbd>
      </button>
    )
  }
  const expanded = phase === 'inspect' && inspectId === 'music'
  return (
    <aside className={expanded ? 'music music-expanded' : 'music music-docked'} aria-label="Music player">
      <header className="music-head">
        <span>{playing ? 'Now playing' : music.playlistName}</span>
        <span className="music-keys">
          <kbd>M</kbd> play/pause
        </span>
        <button type="button" onClick={() => useMusic.getState().close()} aria-label="Close the music player">
          ×
        </button>
      </header>
      {failed ? (
        <p className="music-note">Spotify couldn&rsquo;t load. Check the connection and open the music corner again.</p>
      ) : (
        <div className="music-embed" ref={host} />
      )}
      {expanded && <p className="music-note">Plays through Spotify. Unless you&rsquo;re signed in to Spotify in this browser, tracks play as 30-second previews.</p>}
    </aside>
  )
}

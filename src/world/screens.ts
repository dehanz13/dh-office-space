import { CanvasTexture } from 'three'
import { owner } from '../content'
import { exercise } from '../exercise/state'
import { Marker, rng, toTexture } from './paint'

// Every screen in the office moves: each is a canvas redrawn a dozen times a
// second, so the motion stays sharp at any size (unlike a GIF's 256 colours).
// The desk and lab screens loop through real work: edit, test, fix, commit,
// CI, review, merge, and the agent factory (Herdr panes, a Pi session).

export interface LiveScreen {
  texture: CanvasTexture
  update: (seconds: number) => void
}

const MONO = '"SF Mono", "JetBrains Mono", Menlo, Consolas, monospace'
const SANS = '"Avenir Next", "Segoe UI", system-ui, sans-serif'
const MARKER = '"Permanent Marker", "Comic Sans MS", cursive'

/** A canvas screen redrawn `fps` times a second (called every frame, it skips the rest). */
function live(width: number, height: number, draw: (ctx: CanvasRenderingContext2D, t: number, w: number, h: number) => void, fps = 12): LiveScreen {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas unavailable')
  const texture = toTexture(canvas)
  let last = -Infinity
  const update = (t: number) => {
    if (t - last < 1 / fps) return
    last = t
    draw(ctx, t, width, height)
    texture.needsUpdate = true
  }
  update(0)
  return { texture, update }
}

// ── Shared ──────────────────────────────────────────────────────────────────

/** The first n characters of a line: typing. */
const typed = (text: string, chars: number) => text.slice(0, Math.max(0, Math.floor(chars)))
/** 0 before a moment, 1 after it, a ramp across `span` seconds. */
const ramp = (t: number, at: number, span: number) => Math.min(1, Math.max(0, (t - at) / span))
const SPIN = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
const spinner = (t: number) => SPIN[Math.floor(t * 10) % SPIN.length]

const TN = { bg: '#1a1b26', side: '#16161e', panel: '#1f2335', line: '#292e42', text: '#c0caf5', dim: '#565f89', faint: '#3b4261', blue: '#7aa2f7', cyan: '#7dcfff', green: '#9ece6a', red: '#f7768e', yellow: '#e0af68', purple: '#bb9af7', orange: '#ff9e64' }

// ── 34" monitor: an editor through a whole loop of work ─────────────────────
// Type a change, run the tests (one fails), fix the line, tests pass, commit, push.

const CODE_BEFORE = [
  "import gsap from 'gsap'",
  "import { blindGroups } from '../layout'",
  "import { blindHold, blinds } from '../state/store'",
  '',
  '/** Blinds move at a motor\'s pace: about four and a half seconds. */',
  'const BLIND_SPEED = 0.22',
  '',
]
const CODE_NEW = [
  "/** Which groups a held button moves: one, or every group for 'all'. */",
  'function targets(id: string) {',
  "  return id === 'all' ? blindGroups.map((g) => g.id) : [id]",
  '}',
  '',
  'export function stepBlinds(delta: number) {',
  '  const step = blindHold.dir * BLIND_SPEED * delta',
  '  for (const g of targets(blindHold.id))',
  '    blinds[g] = Math.min(0.98, Math.max(0, blinds[g] + step))',
  '}',
]
const CODE_AFTER = [
  '',
  'export function holdBlind(id: string, dir: -1 | 1) {',
  '  blindHold.id = id',
  '  blindHold.dir = dir',
  '}',
  '',
  'export function releaseBlind() {',
  '  blindHold.dir = 0',
  '}',
]
const FIX_LINE = CODE_BEFORE.length + 8
const FIXED = '    blinds[g] = Math.min(1, Math.max(0, blinds[g] + step))'

const KEYWORDS = /^(import|from|export|function|const|let|for|of|if|return|new|type)$/

function codeLine(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
  if (text.trim().startsWith('//') || text.trim().startsWith('/**')) {
    ctx.fillStyle = TN.dim
    ctx.fillText(text, x, y)
    return
  }
  let cx = x
  for (const token of text.split(/('[^']*'|\b\d+(?:\.\d+)?\b|[A-Za-z_]+)/g)) {
    if (!token) continue
    if (token.startsWith("'")) ctx.fillStyle = TN.green
    else if (/^\d/.test(token)) ctx.fillStyle = TN.orange
    else if (KEYWORDS.test(token)) ctx.fillStyle = TN.purple
    else if (/^[A-Z]/.test(token)) ctx.fillStyle = TN.cyan
    else if (/^[a-z_]\w*$/i.test(token)) ctx.fillStyle = TN.text
    else ctx.fillStyle = '#89ddff'
    ctx.fillText(token, cx, y)
    cx += ctx.measureText(token).width
  }
}

const EDITOR_LOOP = 48

export const mainScreen = () =>
  live(1600, 900, (ctx, seconds, W, H) => {
    const t = seconds % EDITOR_LOOP
    ctx.fillStyle = TN.bg
    ctx.fillRect(0, 0, W, H)
    // Activity bar, explorer.
    ctx.fillStyle = TN.side
    ctx.fillRect(0, 0, 56, H)
    ctx.fillRect(56, 0, 250, H)
    for (let i = 0; i < 5; i++) {
      ctx.strokeStyle = i === 0 ? TN.text : TN.dim
      ctx.lineWidth = 3
      ctx.strokeRect(16, 22 + i * 62, 24, 26)
    }
    const changes = t > 15 && t < 38 ? 3 : t >= 38 ? 0 : 2
    if (changes) {
      ctx.fillStyle = TN.blue
      ctx.beginPath()
      ctx.arc(42, 160, 11, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = TN.bg
      ctx.font = `700 15px ${MONO}`
      ctx.textAlign = 'center'
      ctx.fillText(String(changes), 42, 165)
      ctx.textAlign = 'left'
    }
    ctx.font = `17px ${MONO}`
    ctx.fillStyle = TN.dim
    ctx.fillText('EXPLORER', 76, 34)
    const tree: [string, string, string][] = [
      ['▾ src', TN.text, ''], ['  ▾ interact', TN.text, ''], ['     actions.ts', TN.yellow, 'M'], ['     blinds.test.ts', TN.green, t > 8 ? 'U' : ''],
      ['     Interaction.tsx', TN.text, ''], ['  ▾ ui', TN.text, ''], ['     Hud.tsx', TN.yellow, 'M'], ['  ▸ world', TN.text, ''], ['▸ layout', TN.text, ''], ['▸ scripts', TN.text, ''], ['  package.json', TN.text, ''],
    ]
    tree.forEach(([name, colour, flag], i) => {
      const y = 76 + i * 32
      if (i === 2) {
        ctx.fillStyle = TN.line
        ctx.fillRect(56, y - 22, 250, 32)
      }
      ctx.fillStyle = colour
      ctx.fillText(name, 70, y)
      if (flag) ctx.fillText(flag, 280, y)
    })
    // Tabs and breadcrumb.
    ctx.fillStyle = TN.side
    ctx.fillRect(306, 0, W - 306, 46)
    const dirty = (t > 3 && t < 15) || (t > 24 && t < 28)
    const tabs = [`actions.ts ${dirty ? '●' : '×'}`, 'Hud.tsx', 'blinds.test.ts']
    let tx = 306
    tabs.forEach((tab, i) => {
      ctx.font = `18px ${MONO}`
      const w = ctx.measureText(tab).width + 44
      ctx.fillStyle = i === 0 ? TN.bg : TN.side
      ctx.fillRect(tx, 0, w, 46)
      if (i === 0) {
        ctx.fillStyle = TN.blue
        ctx.fillRect(tx, 0, w, 3)
      }
      ctx.fillStyle = i === 0 ? TN.text : TN.dim
      ctx.fillText(tab, tx + 20, 30)
      tx += w
    })
    ctx.font = `16px ${MONO}`
    ctx.fillStyle = TN.dim
    ctx.fillText('src › interact › actions.ts › stepBlinds', 330, 72)
    // The code: new lines type in; later one line is corrected.
    const newChars = ramp(t, 3, 11.5) * CODE_NEW.join('\n').length
    let left = newChars
    const shownNew: string[] = []
    for (const line of CODE_NEW) {
      if (left <= 0) break
      shownNew.push(typed(line, left))
      left -= line.length + 1
    }
    const fixing = t > 24
    const lines = [...CODE_BEFORE, ...shownNew, ...CODE_AFTER]
    if (fixing && lines[FIX_LINE] !== undefined) {
      const k = ramp(t, 24.5, 2.5)
      const original = CODE_NEW[8]
      const cut = original.indexOf('0.98')
      lines[FIX_LINE] = k < 0.4 ? original : k < 0.6 ? original.slice(0, cut) + original.slice(cut + 4) : FIXED
    }
    const cursorLine = t < 15 ? CODE_BEFORE.length + Math.max(0, shownNew.length - 1) : fixing && t < 28 ? FIX_LINE : -1
    const termTop = H - 300
    ctx.save()
    ctx.beginPath()
    ctx.rect(306, 86, W - 306 - 120, termTop - 86)
    ctx.clip()
    ctx.font = `21px ${MONO}`
    lines.forEach((line, i) => {
      const y = 116 + i * 31
      const isNew = i >= CODE_BEFORE.length && i < CODE_BEFORE.length + shownNew.length
      if (i === cursorLine) {
        ctx.fillStyle = TN.line
        ctx.fillRect(306, y - 23, W - 306, 31)
      }
      if (isNew) {
        ctx.fillStyle = i === FIX_LINE && fixing ? TN.blue : '#41a35a'
        ctx.fillRect(360, y - 23, 4, 31)
      }
      ctx.fillStyle = TN.faint
      ctx.textAlign = 'right'
      ctx.fillText(String(i + 118), 352, y)
      ctx.textAlign = 'left'
      codeLine(ctx, line, 384, y)
      if (i === FIX_LINE && t > 21 && t < 25.5 && line.includes('0.98')) {
        // The failing test's squiggle under the bad clamp.
        const x0 = 384 + ctx.measureText(line.slice(0, line.indexOf('0.98'))).width
        ctx.strokeStyle = TN.red
        ctx.lineWidth = 2
        ctx.beginPath()
        for (let x = 0; x < ctx.measureText('0.98').width; x += 6) ctx.lineTo(x0 + x, y + 6 + (x % 12 ? 3 : 0))
        ctx.stroke()
      }
      if (i === cursorLine && Math.floor(seconds * 2) % 2 === 0) {
        ctx.fillStyle = TN.text
        ctx.fillRect(384 + ctx.measureText(line).width + 2, y - 21, 3, 27)
      }
    })
    ctx.restore()
    // Minimap.
    ctx.fillStyle = TN.side
    ctx.fillRect(W - 110, 86, 110, termTop - 86)
    lines.forEach((line, i) => {
      ctx.fillStyle = i >= CODE_BEFORE.length && i < CODE_BEFORE.length + shownNew.length ? '#41a35a' : TN.faint
      ctx.fillRect(W - 100 + (line.length - line.trimStart().length) * 1.5, 96 + i * 6, Math.min(80, line.trim().length * 1.4), 3)
    })
    // Terminal panel.
    ctx.fillStyle = TN.side
    ctx.fillRect(306, termTop, W - 306, 300 - 30)
    ctx.fillStyle = TN.line
    ctx.fillRect(306, termTop, W - 306, 2)
    ctx.font = `16px ${MONO}`
    ;['PROBLEMS', 'OUTPUT', 'TERMINAL'].forEach((label, i) => {
      ctx.fillStyle = i === 2 ? TN.text : TN.dim
      ctx.fillText(label, 330 + i * 130, termTop + 30)
    })
    ctx.fillStyle = TN.blue
    ctx.fillRect(330 + 260, termTop + 38, 96, 2)
    const out: [string, string][] = []
    const run = (at: number, pass: boolean) => {
      if (t < at) return
      out.push([TN.green, '$ npx vitest run blinds'])
      if (t > at + 1) out.push([TN.dim, ' RUN  v3.2.4  ~/office'])
      if (t > at + 2) out.push([TN.green, ' ✓ blinds.test.ts > holds one group while pressed'])
      if (t > at + 2.6) out.push([TN.green, ' ✓ blinds.test.ts > stops where you let go'])
      if (t > at + 3.2) out.push(pass ? [TN.green, " ✓ blinds.test.ts > 'all' moves every group to the sill"] : [TN.red, " × blinds.test.ts > 'all' moves every group to the sill"])
      if (!pass && t > at + 3.8) out.push([TN.red, '     → expected 0.98 to be 1 // Object.is equality'])
      if (t > at + 4.6) out.push(pass ? [TN.green, ' Tests  4 passed (4)   Duration 612ms'] : [TN.red, ' Tests  1 failed | 3 passed (4)'])
    }
    if (t < 16) out.push([TN.dim, '~/office (feat/blinds-panel) $'])
    run(16, false)
    if (t > 28.5) out.length = 0
    run(28.5, true)
    if (t > 35) {
      out.length = 0
      out.push([TN.green, '$ git commit -am "feat: master blinds panel by the door"'])
      if (t > 36.5) out.push([TN.text, '[feat/blinds-panel 4c1e9a2] feat: master blinds panel by the door'])
      if (t > 37) out.push([TN.dim, ' 3 files changed, 64 insertions(+), 9 deletions(-)'])
      if (t > 39) out.push([TN.green, '$ git push'])
      if (t > 40.5) out.push([TN.dim, 'To github.com:' + owner.github + '/office.git'])
      if (t > 41) out.push([TN.text, '   9b3f0d1..4c1e9a2  feat/blinds-panel -> feat/blinds-panel'])
    }
    ctx.font = `19px ${MONO}`
    out.slice(-7).forEach(([colour, text], i) => {
      ctx.fillStyle = colour
      ctx.fillText(text, 330, termTop + 76 + i * 28)
    })
    // Status bar.
    ctx.fillStyle = TN.blue
    ctx.fillRect(0, H - 30, 150, 30)
    ctx.fillStyle = TN.side
    ctx.fillRect(150, H - 30, W - 150, 30)
    ctx.font = `16px ${MONO}`
    ctx.fillStyle = TN.bg
    ctx.fillText('  ⎇ ' + 'office', 8, H - 9)
    ctx.fillStyle = TN.text
    const failing = t > 20 && t < 32
    ctx.fillText(`feat/blinds-panel${changes ? '*' : ''}   ${t > 41 ? '0↓ 0↑' : '0↓ 1↑'}   ⊗ ${failing ? 1 : 0}  ⚠ 0`, 170, H - 9)
    ctx.textAlign = 'right'
    ctx.fillText(`Ln ${cursorLine > 0 ? cursorLine + 118 : 131}, Col 18   Spaces: 2   UTF-8   TypeScript`, W - 20, H - 9)
    ctx.textAlign = 'left'
  })

// ── Vertical monitor: tmux with the dev server above and CI below ───────────

const CI_JOBS: [string, number, number][] = [
  ['typecheck', 2, 21], ['lint', 3, 14], ['unit (1/4)', 4, 48], ['unit (2/4)', 5, 52], ['unit (3/4)', 5, 45], ['unit (4/4)', 6, 50], ['build', 12, 38], ['e2e · chromium', 17, 96], ['e2e · webkit', 18, 104],
]

export const verticalScreen = () =>
  live(900, 1580, (ctx, seconds, W, H) => {
    const t = seconds % 40
    ctx.fillStyle = '#0b0d12'
    ctx.fillRect(0, 0, W, H)
    const split = 860
    ctx.font = `25px ${MONO}`
    // Top pane: the dev server and hot updates as files are saved.
    const hmr = ['src/interact/actions.ts', 'src/ui/Hud.tsx', 'src/world/screens.ts', 'src/interact/actions.ts', 'src/styles.css', 'src/ui/Hud.tsx']
    const top: [string, string][] = [
      [TN.green, '$ npm run dev'],
      [TN.text, ''],
      [TN.green, '  VITE v8.0.3  ready in 412 ms'],
      [TN.text, ''],
      [TN.text, '  ➜  Local:   http://localhost:5288/'],
      [TN.dim, '  ➜  Network: use --host to expose'],
      [TN.text, ''],
    ]
    const updates = Math.floor(seconds / 4.5)
    for (let k = Math.max(0, updates - 12); k <= updates; k++) {
      const h = 10 + Math.floor(k / 60)
      const m = (17 + k) % 60
      top.push([TN.dim, `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String((k * 13) % 60).padStart(2, '0')} [vite] hmr update /${hmr[k % hmr.length]}${k % 4 === 3 ? ' (x2)' : ''}`])
    }
    top.slice(0, 7).concat(top.slice(7).slice(-15)).forEach(([colour, text], i) => {
      ctx.fillStyle = text.includes('[vite]') ? TN.cyan : colour
      ctx.fillText(text, 26, 50 + i * 37)
    })
    ctx.fillStyle = '#2b9348'
    ctx.fillRect(0, split, W, 3)
    // Bottom pane: the pull request's CI run, job by job.
    ctx.fillStyle = TN.green
    ctx.fillText('$ gh run watch', 26, split + 52)
    ctx.fillStyle = TN.text
    ctx.fillText('feat: master blinds panel · #4312', 26, split + 96)
    ctx.fillStyle = TN.dim
    ctx.fillText('Triggered via pull_request · feat/blinds-panel', 26, split + 134)
    let allDone = true
    CI_JOBS.forEach(([name, start, dur], i) => {
      const y = split + 190 + i * 40
      const elapsed = t - start
      const done = elapsed > dur / 4
      const running = elapsed > 0 && !done
      if (!done) allDone = false
      ctx.fillStyle = done ? TN.green : running ? TN.yellow : TN.dim
      ctx.fillText(done ? '✓' : running ? spinner(seconds) : '○', 26, y)
      ctx.fillStyle = done || running ? TN.text : TN.dim
      ctx.fillText(name, 66, y)
      ctx.textAlign = 'right'
      ctx.fillStyle = TN.dim
      ctx.fillText(done ? `${dur}s` : running ? `${Math.floor(elapsed * 4)}s` : '', W - 30, y)
      ctx.textAlign = 'left'
    })
    if (allDone) {
      ctx.fillStyle = TN.green
      ctx.fillText('✓ Run completed successfully (1m 52s)', 26, split + 190 + CI_JOBS.length * 40 + 20)
    }
    // tmux status line.
    ctx.fillStyle = '#2b9348'
    ctx.fillRect(0, H - 40, W, 40)
    ctx.fillStyle = '#0b0d12'
    ctx.font = `600 22px ${MONO}`
    ctx.fillText('[office] 0:dev*  1:ci', 16, H - 12)
    ctx.textAlign = 'right'
    ctx.fillText(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()), W - 16, H - 12)
    ctx.textAlign = 'left'
  })

// ── Laptop: the pull request, checks going green, then merged ───────────────

const CHECKS: [string, number][] = [['typecheck', 6], ['lint', 8], ['unit tests (4 shards)', 13], ['build', 17], ['e2e (chromium, webkit)', 23]]

export const laptopScreen = () =>
  live(1280, 816, (ctx, seconds, W, H) => {
    const t = seconds % 36
    const merged = t > 30
    ctx.fillStyle = '#0d1117'
    ctx.fillRect(0, 0, W, H)
    // Browser chrome.
    ctx.fillStyle = '#1c2128'
    ctx.fillRect(0, 0, W, 86)
    ;['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => {
      ctx.fillStyle = c
      ctx.beginPath()
      ctx.arc(26 + i * 24, 24, 8, 0, Math.PI * 2)
      ctx.fill()
    })
    ctx.fillStyle = '#2d333b'
    ctx.beginPath()
    ctx.roundRect(110, 10, 360, 30, 8)
    ctx.fill()
    ctx.fillStyle = '#adbac7'
    ctx.font = `16px ${SANS}`
    ctx.fillText('feat: master blinds panel #142', 126, 31)
    ctx.fillStyle = '#22272e'
    ctx.beginPath()
    ctx.roundRect(20, 48, W - 40, 30, 15)
    ctx.fill()
    ctx.fillStyle = '#768390'
    ctx.fillText(`github.com/${owner.github}/office/pull/142`, 44, 69)
    // Title and state.
    ctx.fillStyle = '#e6edf3'
    ctx.font = `600 34px ${SANS}`
    ctx.fillText('feat: master blinds panel by the door', 40, 138)
    ctx.fillStyle = '#6e7681'
    ctx.fillText('#142', 650, 138)
    ctx.fillStyle = merged ? '#8957e5' : '#238636'
    ctx.beginPath()
    ctx.roundRect(40, 158, merged ? 112 : 92, 36, 18)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.font = `600 18px ${SANS}`
    ctx.fillText(merged ? '⮂ Merged' : '⊙ Open', 56, 182)
    ctx.fillStyle = '#9198a1'
    ctx.font = `17px ${SANS}`
    ctx.fillText(merged ? `${owner.github} merged 3 commits into develop` : `${owner.github} wants to merge 3 commits into develop from feat/blinds-panel`, merged ? 168 : 148, 182)
    ctx.fillStyle = '#9198a1'
    ;['Conversation 4', 'Commits 3', 'Checks 5', 'Files changed 6'].forEach((tab, i) => {
      ctx.fillText(tab, 40 + i * 190, 236)
    })
    ctx.fillStyle = '#f78166'
    ctx.fillRect(40, 248, 130, 3)
    ctx.fillStyle = '#3fb950'
    ctx.fillText('+412', 990, 236)
    ctx.fillStyle = '#f85149'
    ctx.fillText('−58', 1046, 236)
    ctx.fillStyle = '#30363d'
    ctx.fillRect(40, 252, W - 80, 1)
    // A review from the review agent.
    ctx.fillStyle = '#2f81f7'
    ctx.beginPath()
    ctx.arc(62, 300, 20, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#e6edf3'
    ctx.font = `600 17px ${SANS}`
    ctx.fillText('review-agent', 96, 296)
    ctx.fillStyle = '#3fb950'
    ctx.fillText(t > 26 ? 'approved these changes' : 'reviewed', 220, 296)
    ctx.fillStyle = '#9198a1'
    ctx.font = `16px ${SANS}`
    ctx.fillText("Clamp fix confirmed; 'all' moves every group. One nit: name the 0.22 constant. Fixed in 3a1d.", 96, 322)
    // The checks box.
    ctx.strokeStyle = '#30363d'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.roundRect(40, 356, W - 80, 340, 10)
    ctx.stroke()
    const passed = CHECKS.filter(([, at]) => t > at).length
    ctx.font = `600 19px ${SANS}`
    ctx.fillStyle = passed === CHECKS.length ? '#3fb950' : '#d29922'
    ctx.fillText(passed === CHECKS.length ? '✓ All checks have passed' : `${spinner(seconds)} Some checks haven't completed yet`, 64, 394)
    ctx.fillStyle = '#9198a1'
    ctx.font = `16px ${SANS}`
    ctx.fillText(`${passed} successful, ${CHECKS.length - passed} in progress`, 64, 420)
    CHECKS.forEach(([name, at], i) => {
      const y = 462 + i * 40
      const ok = t > at
      ctx.fillStyle = ok ? '#3fb950' : '#d29922'
      ctx.font = `18px ${SANS}`
      ctx.fillText(ok ? '✓' : spinner(seconds + i), 70, y)
      ctx.fillStyle = '#e6edf3'
      ctx.fillText(`CI / ${name}`, 100, y)
      ctx.fillStyle = '#9198a1'
      ctx.fillText(ok ? `Successful in ${12 + i * 17}s` : 'In progress…', 520, y)
    })
    // Merge button.
    const ready = passed === CHECKS.length && t > 26
    ctx.fillStyle = merged ? '#8957e5' : ready ? '#238636' : '#21262d'
    ctx.beginPath()
    ctx.roundRect(64, 706, merged ? 520 : 240, 50, 8)
    ctx.fill()
    ctx.fillStyle = ready || merged ? '#ffffff' : '#6e7681'
    ctx.font = `600 19px ${SANS}`
    ctx.fillText(merged ? 'Pull request successfully merged and closed' : 'Merge pull request', 88, 738)
  })

// ── Agent lab, left: Herdr running the software factory ─────────────────────
// Catppuccin Mocha, Herdr's default theme. Sidebar of workspaces and agents,
// tiled panes with an agent in each, the focused pane outlined in blue.

const MOCHA = { base: '#1e1e2e', mantle: '#181825', crust: '#11111b', surface: '#313244', text: '#cdd6f4', sub: '#a6adc8', overlay: '#6c7086', blue: '#89b4fa', yellow: '#f9e2af', red: '#f38ba8', teal: '#94e2d5', green: '#a6e3a1', mauve: '#cba6f7', peach: '#fab387' }
const FACTORY_LOOP = 40
/** Each stage of the factory: when it starts, when it ends, which pane shows it. */
const STAGES: { name: string; from: number; to: number; pane: number; lines: [string, string][] }[] = [
  { name: 'orchestrator', from: 0, to: 4, pane: 0, lines: [[MOCHA.text, 'task #142: master blinds panel by the door'], [MOCHA.overlay, 'read issue · 3 acceptance criteria'], [MOCHA.peach, 'spawn scout → plan → build → test → review'], [MOCHA.overlay, 'worktree feat/blinds-panel ready']] },
  { name: 'scout', from: 4, to: 9, pane: 1, lines: [[MOCHA.teal, 'read src/interact/actions.ts'], [MOCHA.teal, 'read src/ui/Hud.tsx'], [MOCHA.teal, 'read layout/office.json'], [MOCHA.text, 'found holdBlind, BlindControls, 8 groups']] },
  { name: 'planner', from: 9, to: 14, pane: 1, lines: [[MOCHA.text, 'plan.md'], [MOCHA.sub, "1. targets('all') → every group"], [MOCHA.sub, '2. panel by the door + screen'], [MOCHA.sub, '3. tests first: 4 cases'], [MOCHA.green, 'plan approved by orchestrator']] },
  { name: 'builder', from: 14, to: 26, pane: 2, lines: [[MOCHA.teal, 'write src/interact/blinds.test.ts'], [MOCHA.text, '$ npx vitest run blinds'], [MOCHA.red, "× 'all' moves every group"], [MOCHA.peach, 'edit src/interact/actions.ts (+31 −6)'], [MOCHA.peach, 'edit src/ui/Hud.tsx (+38 −4)'], [MOCHA.text, '$ npx vitest run blinds'], [MOCHA.green, '✓ 4 passed  612ms']] },
  { name: 'tester', from: 26, to: 31, pane: 3, lines: [[MOCHA.text, '$ npm run typecheck'], [MOCHA.green, '✓ no errors'], [MOCHA.text, '$ npx playwright test blinds'], [MOCHA.green, '✓ 3 passed (chromium, webkit)']] },
  { name: 'reviewer', from: 31, to: 36, pane: 3, lines: [[MOCHA.text, 'diff 3 files +412 −58'], [MOCHA.yellow, 'nit: name the 0.22 constant'], [MOCHA.peach, '→ builder: revise'], [MOCHA.green, 'approve']] },
  { name: 'scribe', from: 36, to: 39, pane: 0, lines: [[MOCHA.text, 'edit CHANGELOG.md'], [MOCHA.text, 'open PR #142'], [MOCHA.green, 'done · ready to merge']] },
]
const PANES = ['orchestrator · pi', 'scout → plan · pi', 'build · pi', 'test → review · claude']

export const agentGraphScreen = () =>
  live(1280, 720, (ctx, seconds, W, H) => {
    const t = seconds % FACTORY_LOOP
    ctx.fillStyle = MOCHA.base
    ctx.fillRect(0, 0, W, H)
    const side = 250
    ctx.fillStyle = MOCHA.mantle
    ctx.fillRect(0, 0, side, H)
    ctx.font = `20px ${MONO}`
    const working = STAGES.filter((s) => t >= s.from && t < s.to)
    const workspaces: [string, string, string][] = [['1 office', working.length ? '●' : '○', 'feat/blinds-panel'], ['2 hearso', '○', 'develop'], ['3 fleet', '○', 'main']]
    workspaces.forEach(([name, dot, branch], i) => {
      const y = 40 + i * 60
      if (i === 0) {
        ctx.fillStyle = MOCHA.surface
        ctx.fillRect(0, y - 26, side, 58)
      }
      ctx.fillStyle = MOCHA.text
      ctx.fillText(name, 18, y)
      ctx.fillStyle = dot === '●' ? MOCHA.yellow : MOCHA.green
      ctx.fillText(dot, side - 34, y)
      ctx.fillStyle = MOCHA.mauve
      ctx.fillText('  ' + branch, 18, y + 26)
    })
    ctx.fillStyle = MOCHA.overlay
    ctx.fillText('  new', 18, 238)
    ctx.fillRect(14, 262, side - 28, 1)
    ctx.fillText('agents', 18, 296)
    STAGES.forEach((s, i) => {
      const y = 336 + i * 40
      const state = t >= s.to ? 'done' : t >= s.from ? 'working' : 'idle'
      const icon = state === 'done' ? '✓' : state === 'working' ? '◐' : '○'
      const colour = state === 'done' ? MOCHA.teal : state === 'working' ? MOCHA.yellow : MOCHA.green
      ctx.fillStyle = colour
      ctx.fillText(icon, 18, y)
      ctx.fillStyle = MOCHA.text
      ctx.fillText(s.name, 46, y)
      ctx.fillStyle = colour
      ctx.textAlign = 'right'
      ctx.fillText(state, side - 14, y)
      ctx.textAlign = 'left'
    })
    // Tab row and status.
    ctx.fillStyle = MOCHA.crust
    ctx.fillRect(side, 0, W - side, 40)
    ctx.fillStyle = MOCHA.blue
    ctx.fillRect(side + 10, 6, 130, 28)
    ctx.fillStyle = MOCHA.crust
    ctx.fillText(' 1 factory ', side + 14, 27)
    ctx.fillStyle = MOCHA.overlay
    ctx.fillText(' 2 logs ', side + 154, 27)
    ctx.textAlign = 'right'
    ctx.fillText(`${STAGES.length} agents · ${working.length} working · ctrl+b`, W - 16, 27)
    ctx.textAlign = 'left'
    // Four tiled panes.
    const px = side + 8
    const pw = (W - side - 24) / 2
    const ph = (H - 64) / 2
    const focus = working[0]?.pane ?? 0
    PANES.forEach((title, p) => {
      const x = px + (p % 2) * (pw + 8)
      const y = 48 + Math.floor(p / 2) * (ph + 8)
      ctx.strokeStyle = p === focus ? MOCHA.blue : MOCHA.surface
      ctx.lineWidth = 2
      ctx.strokeRect(x, y, pw, ph)
      ctx.fillStyle = MOCHA.base
      ctx.font = `18px ${MONO}`
      const label = ` ${title} `
      ctx.fillRect(x + 14, y - 10, ctx.measureText(label).width, 20)
      ctx.fillStyle = p === focus ? MOCHA.blue : MOCHA.overlay
      ctx.fillText(label, x + 14, y + 6)
      const lines: [string, string][] = []
      for (const s of STAGES.filter((st) => st.pane === p && t >= st.from)) {
        const shown = t >= s.to ? s.lines.length : Math.floor(((t - s.from) / (s.to - s.from)) * (s.lines.length + 0.99))
        lines.push([MOCHA.mauve, `── ${s.name}`])
        lines.push(...s.lines.slice(0, shown))
      }
      ctx.font = `17px ${MONO}`
      lines.slice(-7).forEach(([colour, text], i) => {
        ctx.fillStyle = colour
        ctx.fillText(text, x + 16, y + 40 + i * 30)
      })
      const live = working.find((s) => s.pane === p)
      if (live) {
        ctx.fillStyle = MOCHA.mauve
        ctx.fillText(`${spinner(seconds)} ${live.name} working…`, x + 16, y + ph - 16)
      }
    })
    // Toasts when a gate passes.
    const toast = t > 14 && t < 17 ? '● plan approved' : t > 36 && t < 39.5 ? '● ready to merge' : ''
    if (toast) {
      ctx.font = `18px ${MONO}`
      const w = ctx.measureText(toast).width + 30
      ctx.fillStyle = MOCHA.crust
      ctx.fillRect(W - w - 24, H - 62, w, 40)
      ctx.strokeStyle = MOCHA.green
      ctx.strokeRect(W - w - 24, H - 62, w, 40)
      ctx.fillStyle = MOCHA.green
      ctx.fillText(toast, W - w - 9, H - 36)
    }
  })

// ── Agent lab, right: the builder's Pi session up close ─────────────────────

const PI = { bg: '#1b1c1f', user: '#343541', pending: '#282832', ok: '#283228', err: '#3c2828', text: '#d4d4d4', dim: '#7c7f86', teal: '#8abeb7', yellow: '#f0c674', red: '#cc6666', green: '#b5bd68', violet: '#b294bb' }
type PiBlock = { at: number; bg: string; lines: [string, string][]; italic?: boolean }
const PI_LOOP = 34
const PI_BLOCKS: PiBlock[] = [
  { at: 0, bg: PI.user, lines: [[PI.text, 'Build step 3 of plan.md: the master blinds panel by the door. Tests first.']] },
  { at: 1.5, bg: '', italic: true, lines: [[PI.dim, 'Reading the plan, then the blinds actions…']] },
  { at: 3, bg: PI.ok, lines: [[PI.teal, 'read plan.md'], [PI.yellow, ':1-48'], [PI.dim, ' (ctrl+o to expand)']] },
  { at: 5, bg: PI.ok, lines: [[PI.teal, 'read src/interact/actions.ts'], [PI.yellow, ':118-157']] },
  { at: 7.5, bg: PI.ok, lines: [[PI.text, 'write '], [PI.teal, 'src/interact/blinds.test.ts'], [PI.dim, ' (46 lines)']] },
  { at: 10, bg: PI.err, lines: [[PI.text, '$ npx vitest run blinds (timeout 60s)'], [PI.red, "\n× 'all' moves every group to the sill"], [PI.dim, '\n→ expected 0.98 to be 1'], [PI.dim, '\nTook 1.2s']] },
  { at: 14, bg: PI.ok, lines: [[PI.text, 'edit '], [PI.teal, 'src/interact/actions.ts'], [PI.red, '\n-131     blinds[g] = Math.min(0.98, Math.max(0, blinds[g] + step))'], [PI.green, '\n+131     blinds[g] = Math.min(1, Math.max(0, blinds[g] + step))']] },
  { at: 18, bg: PI.ok, lines: [[PI.text, '$ npx vitest run blinds'], [PI.green, '\n✓ 4 passed (4)'], [PI.dim, '\nTook 0.9s']] },
  { at: 21, bg: PI.ok, lines: [[PI.text, 'edit '], [PI.teal, 'src/ui/Hud.tsx'], [PI.green, '\n+ <BlindControls group="all" /> with a row per group']] },
  { at: 25, bg: '', lines: [[PI.text, "Done. 'all' moves all eight groups; 4 tests pass and the"], [PI.text, '\npanel shows every blind. Handing to the tester.']] },
]

export const agentLogScreen = () =>
  live(1280, 720, (ctx, seconds, W, H) => {
    const t = seconds % PI_LOOP
    ctx.fillStyle = PI.bg
    ctx.fillRect(0, 0, W, H)
    ctx.font = `600 22px ${MONO}`
    ctx.fillStyle = PI.text
    ctx.fillText('pi v0.85.1', 24, 34)
    ctx.font = `17px ${MONO}`
    ctx.fillStyle = PI.dim
    ctx.fillText('escape interrupt · ctrl+c/ctrl+d clear/exit · / commands · ! bash · ctrl+o more', 160, 34)
    ctx.fillStyle = PI.yellow
    ctx.fillText('[Context]', 24, 68)
    ctx.fillStyle = PI.dim
    ctx.fillText('AGENTS.md · docs/agent-brief.md · plan.md', 140, 68)
    // The conversation, newest at the bottom, scrolling up as it grows.
    const rows: { bg: string; italic: boolean; parts: [string, string][] }[] = []
    for (const b of PI_BLOCKS.filter((block) => t >= block.at)) {
      const lines: [string, string][][] = [[]]
      for (const [colour, text] of b.lines) {
        const pieces = text.split('\n')
        pieces.forEach((piece, i) => {
          if (i > 0) lines.push([])
          if (piece) lines[lines.length - 1].push([colour, piece])
        })
      }
      lines.forEach((parts, i) => rows.push({ bg: b.bg, italic: !!b.italic, parts: i === 0 && b.bg === PI.user ? parts : parts }))
      rows.push({ bg: '', italic: false, parts: [] })
    }
    const top = 92
    const bottom = H - 128
    const lineH = 30
    const visible = Math.floor((bottom - top) / lineH)
    rows.slice(-visible).forEach((row, i) => {
      const y = top + i * lineH
      if (row.bg) {
        ctx.fillStyle = row.bg
        ctx.fillRect(16, y, W - 32, lineH)
      }
      let x = 32
      ctx.font = `${row.italic ? 'italic ' : ''}19px ${MONO}`
      for (const [colour, text] of row.parts) {
        ctx.fillStyle = colour
        ctx.fillText(text, x, y + 21)
        x += ctx.measureText(text).width
      }
    })
    // The input editor: its border shows the thinking level; a spinner while working.
    const busy = t < 25
    ctx.strokeStyle = busy ? PI.violet : '#4a4d55'
    ctx.lineWidth = 2
    ctx.strokeRect(16, H - 116, W - 32, 56)
    if (busy) {
      ctx.fillStyle = PI.bg
      ctx.font = `18px ${MONO}`
      const label = ` ${spinner(seconds)} ${t < 10 ? 'Woolgathering...' : t < 18 ? 'Tinkering...' : 'Polishing...'} `
      ctx.fillRect(34, H - 128, ctx.measureText(label).width, 24)
      ctx.fillStyle = PI.violet
      ctx.fillText(label, 34, H - 110)
    } else if (Math.floor(seconds * 2) % 2 === 0) {
      ctx.fillStyle = PI.text
      ctx.fillRect(34, H - 100, 10, 24)
    }
    // Footer: folder and branch, tokens and cost, the model.
    ctx.font = `17px ${MONO}`
    ctx.fillStyle = PI.dim
    const k = Math.min(1, t / 25)
    ctx.fillText(`~/office (feat/blinds-panel)   ↑${(8 + k * 6).toFixed(0)}k ↓${(0.6 + k * 1.5).toFixed(1)}k R${(12 + k * 19).toFixed(0)}k CH42% $${(0.12 + k * 0.26).toFixed(2)}   ${(5 + k * 7.4).toFixed(1)}%/200k (auto)`, 20, H - 22)
    ctx.textAlign = 'right'
    ctx.fillStyle = PI.text
    ctx.fillText('(anthropic) claude-opus-5-5 • high', W - 20, H - 22)
    ctx.textAlign = 'left'
  })

// ── iPad: the factory, sketched by pencil ───────────────────────────────────

const SKETCH: { kind: 'box' | 'arrow'; x: number; y: number; w?: number; x2?: number; y2?: number; label?: string; colour?: string; dashed?: boolean }[] = [
  { kind: 'box', x: 70, y: 150, w: 200, label: 'issue' },
  { kind: 'arrow', x: 280, y: 200, x2: 360, y2: 200 },
  { kind: 'box', x: 370, y: 150, w: 200, label: 'scout' },
  { kind: 'arrow', x: 580, y: 200, x2: 660, y2: 200 },
  { kind: 'box', x: 670, y: 150, w: 200, label: 'plan' },
  { kind: 'arrow', x: 880, y: 200, x2: 960, y2: 200 },
  { kind: 'box', x: 970, y: 150, w: 200, label: 'build' },
  { kind: 'arrow', x: 1070, y: 260, x2: 1070, y2: 420 },
  { kind: 'box', x: 970, y: 430, w: 200, label: 'test' },
  { kind: 'arrow', x: 960, y: 480, x2: 880, y2: 480 },
  { kind: 'box', x: 670, y: 430, w: 200, label: 'review' },
  { kind: 'arrow', x: 760, y: 420, x2: 1000, y2: 270, colour: '#c0392b', dashed: true, label: 'revise' },
  { kind: 'arrow', x: 660, y: 480, x2: 580, y2: 480 },
  { kind: 'box', x: 370, y: 430, w: 200, label: 'ship', colour: '#1e7b4f' },
]

export const ipadScreen = () =>
  live(1240, 950, (ctx, seconds, W, H) => {
    const t = seconds % 26
    ctx.fillStyle = '#fbfbfa'
    ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = 'rgba(40,50,70,0.12)'
    for (let y = 40; y < H; y += 40) for (let x = 40; x < W; x += 40) ctx.fillRect(x, y, 3, 3)
    ctx.fillStyle = '#f0f0ee'
    ctx.beginPath()
    ctx.roundRect(W / 2 - 230, 24, 460, 54, 27)
    ctx.fill()
    ;['#1c1c1e', '#2f6fde', '#c0392b', '#1e7b4f', '#8e8e93'].forEach((c, i) => {
      ctx.fillStyle = c
      ctx.beginPath()
      ctx.arc(W / 2 - 170 + i * 85, 51, 13, 0, Math.PI * 2)
      ctx.fill()
    })
    ctx.fillStyle = '#1c1c1e'
    ctx.font = `44px ${MARKER}`
    ctx.fillText('the factory', 70, 110)
    const marker = new Marker(ctx, rng(4))
    const per = 1.15
    // Where the pencil is now (set inside the loop below).
    const tip: { at: [number, number] | null } = { at: null }
    SKETCH.forEach((s, i) => {
      const k = ramp(t, 1 + i * per, per)
      if (k <= 0) return
      const colour = s.colour ?? '#1c1c1e'
      marker.colour(colour)
      if (s.kind === 'box') {
        const w = s.w ?? 200
        const h = 100
        const pts: [number, number][] = [
          ...marker.seg(s.x, s.y, s.x + w, s.y),
          ...marker.seg(s.x + w, s.y, s.x + w, s.y + h),
          ...marker.seg(s.x + w, s.y + h, s.x, s.y + h),
          ...marker.seg(s.x, s.y + h, s.x, s.y + 2),
        ]
        const n = Math.max(2, Math.floor(pts.length * k))
        marker.line(pts.slice(0, n), 5)
        tip.at = pts[n - 1]
        if (k > 0.85 && s.label) marker.text(s.label, s.x + w / 2, s.y + h / 2 + 2, 40, 'center')
      } else {
        const x2 = s.x + ((s.x2 ?? s.x) - s.x) * k
        const y2 = s.y + ((s.y2 ?? s.y) - s.y) * k
        if (k < 1) {
          if (s.dashed) ctx.setLineDash([14, 12])
          marker.line(marker.seg(s.x, s.y, x2, y2), 5)
          ctx.setLineDash([])
        } else marker.arrow(s.x, s.y, s.x2 ?? s.x, s.y2 ?? s.y, s.dashed)
        tip.at = [x2, y2]
        if (k >= 1 && s.label) marker.text(s.label, (s.x + (s.x2 ?? 0)) / 2 + 40, (s.y + (s.y2 ?? 0)) / 2, 34)
      }
    })
    if (tip.at && t < 1 + SKETCH.length * per) {
      const [px, py] = tip.at
      ctx.fillStyle = 'rgba(30,30,30,0.18)'
      ctx.beginPath()
      ctx.arc(px + 6, py + 8, 14, 0, Math.PI * 2)
      ctx.fill()
    }
  })

// ── TV: a football match on the console, from the broadcast camera ──────────
// PLACEHOLDER: stands in for your own games (see PLACEHOLDERS.md, games).
// A small simulation, not a recording: two 4-4-2 sides shift with the ball,
// pass, dribble at goal and shoot; the camera pans like a broadcast, with the
// scoreboard, radar, controlled-player marker and shot-power bar of a console game.

const PL = 105 // pitch length, metres
const PW = 68 // pitch width
const KITS = [
  { name: 'DAL', shirt: '#f3f5fa', shorts: '#1d3a8a', socks: '#f3f5fa', keeper: '#2fbf71', chip: '#2b55c9' },
  { name: 'LDN', shirt: '#c8102e', shorts: '#f6f6f6', socks: '#c8102e', keeper: '#f2c230', chip: '#c8102e' },
]
const SKIN = ['#f1c8a5', '#d9a47c', '#a86f4c', '#7a4a2e', '#e8b48f']
const HAIR = ['#1c1410', '#3b2516', '#6b4a2b', '#0e0e10', '#a77b4f']
// 4-4-2 for the side attacking +x: keeper, back four, midfield four, two up front.
const FORMATION: [number, number][] = [[5, 34], [20, 10], [18, 26], [18, 42], [20, 58], [38, 8], [35, 26], [35, 42], [38, 60], [50, 27], [50, 41]]
const SHIRT_NUMBERS = [1, 2, 4, 5, 3, 7, 8, 6, 11, 9, 10]
const BOARDS = ['BUILD WITH DANNIEL', 'FLOOR 23', 'AGENT LAB', 'TESTS FIRST', 'SHIP IT', 'DALLAS']

interface Footballer {
  team: 0 | 1
  num: number
  homeX: number
  homeY: number
  x: number
  y: number
  vx: number
  vy: number
  stride: number
  keeper: boolean
  skin: string
  hair: string
}

type Play =
  | { kind: 'held'; by: Footballer; until: number }
  | { kind: 'windup'; by: Footballer; start: number; until: number }
  | { kind: 'flight'; fx: number; fy: number; tx: number; ty: number; start: number; end: number; peak: number; to: Footballer | null; shot: null | { goal: boolean; team: 0 | 1 } }
  | { kind: 'goal'; until: number; scorer: Footballer }

export const tvScreen = () => {
  const rand = rng(23)
  const W = 1280
  const H = 712
  const dirOf = (team: 0 | 1) => (team === 0 ? 1 : -1)
  const goalOf = (team: 0 | 1) => (team === 0 ? PL : 0) // the goal a side attacks

  const players: Footballer[] = []
  for (const team of [0, 1] as const) {
    FORMATION.forEach(([hx, hy], i) => {
      const homeX = team === 0 ? hx : PL - hx
      const homeY = team === 0 ? hy : PW - hy
      players.push({ team, num: SHIRT_NUMBERS[i], homeX, homeY, x: homeX, y: homeY, vx: 0, vy: 0, stride: rand() * 6, keeper: i === 0, skin: SKIN[Math.floor(rand() * SKIN.length)], hair: HAIR[Math.floor(rand() * HAIR.length)] })
    })
  }
  const score = [1, 0]
  const ball = { x: 52.5, y: 34, h: 0 }
  let possession: 0 | 1 = 0
  let play: Play = { kind: 'held', by: players[9], until: 1.4 }
  let camX = 52.5
  let last = 0

  // The crowd, painted once and panned behind the far touchline.
  const crowd = document.createElement('canvas')
  crowd.width = 2048
  crowd.height = 300
  const cc = crowd.getContext('2d')
  if (cc) {
    const g = cc.createLinearGradient(0, 0, 0, 300)
    g.addColorStop(0, '#07080b')
    g.addColorStop(0.25, '#1a1d24')
    g.addColorStop(1, '#2a2e36')
    cc.fillStyle = g
    cc.fillRect(0, 0, 2048, 300)
    const tones = ['#c8102e', '#f3f5fa', '#1d3a8a', '#e9e2d0', '#2b2f3a', '#d94c3d', '#8a96b5', '#f2c230']
    for (let row = 0; row < 26; row++) {
      const y = 70 + row * 8.6
      cc.fillStyle = 'rgba(0,0,0,0.25)'
      cc.fillRect(0, y + 5, 2048, 1.5)
      for (let x = rand() * 6; x < 2048; x += 5 + rand() * 3) {
        const light = 0.45 + 0.55 * (row / 26)
        cc.globalAlpha = light
        cc.fillStyle = tones[Math.floor(rand() * tones.length)]
        cc.fillRect(x, y - rand() * 2, 3.4, 4.6)
        cc.fillStyle = SKIN[Math.floor(rand() * SKIN.length)]
        cc.fillRect(x + 0.4, y - 3.6 - rand() * 2, 2.6, 2.6)
      }
    }
    cc.globalAlpha = 1
    // The roof's shadow and its floodlights.
    cc.fillStyle = 'rgba(0,0,0,0.55)'
    cc.fillRect(0, 0, 2048, 58)
    for (let x = 60; x < 2048; x += 256) {
      cc.fillStyle = 'rgba(255,248,225,0.9)'
      cc.fillRect(x, 22, 46, 7)
    }
  }

  // Broadcast projection: the near touchline at the bottom, the far one a third
  // of the way down, a camera about 17 m up at the halfway line.
  const F = 2 * W
  const Z0 = 56
  const NEAR = 0.95 * H
  const FAR = 0.36 * H
  const K = (NEAR - FAR) / (1 / Z0 - 1 / (Z0 + PW))
  const HOR = NEAR - K / Z0
  const project = (x: number, y: number, h = 0): [number, number, number] => {
    const z = Z0 + y
    const s = F / z
    return [W / 2 + (x - camX) * s, HOR + K / z - h * s, s]
  }

  const kick = (now: number, tx: number, ty: number, speed: number, peak: number, to: Footballer | null, shot: null | { goal: boolean; team: 0 | 1 }) => {
    const d = Math.hypot(tx - ball.x, ty - ball.y)
    play = { kind: 'flight', fx: ball.x, fy: ball.y, tx, ty, start: now, end: now + Math.max(0.3, d / speed), peak, to, shot }
  }

  const pass = (now: number, from: Footballer, long: boolean) => {
    const dir = dirOf(from.team)
    const options = players
      .filter((p) => p.team === from.team && p !== from && !p.keeper)
      .map((p) => ({ p, d: Math.hypot(p.x - from.x, p.y - from.y), ahead: dir * (p.x - from.x) }))
      .filter((o) => (long ? o.ahead > 15 : o.d > 7 && o.d < 36 && o.ahead > -10))
    if (options.length === 0) return kick(now, from.x + dir * 30, 34, 18, 6, null, null)
    let total = 0
    for (const o of options) total += Math.max(1, o.ahead + 14)
    let pick = rand() * total
    let target = options[0].p
    for (const o of options) {
      pick -= Math.max(1, o.ahead + 14)
      if (pick <= 0) {
        target = o.p
        break
      }
    }
    const d = Math.hypot(target.x - from.x, target.y - from.y)
    const speed = d > 28 || long ? 21 : 16
    const lead = d / speed
    let tx = target.x + target.vx * lead
    let ty = target.y + target.vy * lead
    let to: Footballer = target
    // Sometimes a defender reads it and steps across.
    if (rand() < 0.17) {
      const mx = (from.x + tx) / 2
      const my = (from.y + ty) / 2
      let best: Footballer | null = null
      let bestD = Infinity
      for (const p of players) {
        if (p.team === from.team || p.keeper) continue
        const pd = Math.hypot(p.x - mx, p.y - my)
        if (pd < bestD) {
          bestD = pd
          best = p
        }
      }
      if (best && bestD < 14) {
        to = best
        tx = best.x + (from.x - best.x) * 0.15
        ty = best.y + (from.y - best.y) * 0.15
      }
    }
    kick(now, Math.min(PL - 1, Math.max(1, tx)), Math.min(PW - 1, Math.max(1, ty)), speed, d > 28 || long ? 3 + rand() * 3 : 0, to, null)
  }

  const kickoff = (now: number, team: 0 | 1) => {
    for (const p of players) {
      p.x = p.homeX + (p.team === team ? 0 : -dirOf(p.team) * 3)
      p.y = p.homeY
      p.vx = 0
      p.vy = 0
    }
    const taker = players.find((p) => p.team === team && p.num === 9) ?? players[0]
    taker.x = 52.5 - dirOf(team) * 0.6
    taker.y = 34
    ball.x = 52.5
    ball.y = 34
    ball.h = 0
    possession = team
    play = { kind: 'held', by: taker, until: now + 1.2 }
    camX = 52.5
  }

  const step = (now: number, dt: number) => {
    // Decide what the ball does next.
    if (play.kind === 'held' && now >= play.until) {
      const p = play.by
      const dir = dirOf(p.team)
      const toGoal = dir * (goalOf(p.team) - p.x)
      if (p.keeper) pass(now, p, true)
      else if (toGoal < 25 && Math.abs(p.y - 34) < 17 && rand() < 0.75) play = { kind: 'windup', by: p, start: now, until: now + 0.5 }
      else pass(now, p, false)
    } else if (play.kind === 'windup' && now >= play.until) {
      const p = play.by
      const goal = rand() < 0.36
      const aimY = 34 + (rand() - 0.5) * 6.2
      kick(now, goalOf(p.team), aimY, 27, 0.6 + rand() * 1.3, null, { goal, team: p.team })
    } else if (play.kind === 'flight' && now >= play.end) {
      if (play.shot) {
        const shooter = play.shot.team
        if (play.shot.goal) {
          score[shooter] += 1
          ball.x = goalOf(shooter) + dirOf(shooter) * 1.4
          ball.h = 0.4
          let scorer = players[0]
          let bestD = Infinity
          for (const p of players) {
            const d = Math.hypot(p.x - play.fx, p.y - play.fy)
            if (p.team === shooter && d < bestD) {
              bestD = d
              scorer = p
            }
          }
          play = { kind: 'goal', until: now + 3.6, scorer }
        } else {
          const keeper = players.find((p) => p.keeper && p.team !== shooter) ?? players[0]
          keeper.x = play.tx - dirOf(shooter) * 0.6
          keeper.y = play.ty
          possession = keeper.team
          play = { kind: 'held', by: keeper, until: now + 1.5 }
        }
      } else if (play.to) {
        possession = play.to.team
        play = { kind: 'held', by: play.to, until: now + 0.6 + rand() * 1.4 }
      } else {
        // A loose ball: the nearest player gets there first.
        let near = players[0]
        let bestD = Infinity
        for (const p of players) {
          const d = Math.hypot(p.x - ball.x, p.y - ball.y)
          if (d < bestD) {
            bestD = d
            near = p
          }
        }
        possession = near.team
        play = { kind: 'held', by: near, until: now + 0.8 }
      }
    } else if (play.kind === 'goal' && now >= play.until) {
      // The side that conceded kicks off.
      kickoff(now, play.scorer.team === 0 ? 1 : 0)
    }

    // Where the ball is.
    if (play.kind === 'held' || play.kind === 'windup') {
      const p = play.by
      const sp = Math.hypot(p.vx, p.vy)
      const fx = sp > 0.3 ? p.vx / sp : dirOf(p.team)
      const fy = sp > 0.3 ? p.vy / sp : 0
      ball.x = p.x + fx * 0.6
      ball.y = p.y + fy * 0.6
      ball.h = p.keeper && play.kind === 'held' ? 1.1 : 0
    } else if (play.kind === 'flight') {
      const u = Math.min(1, (now - play.start) / (play.end - play.start))
      ball.x = play.fx + (play.tx - play.fx) * u
      ball.y = play.fy + (play.ty - play.fy) * u
      ball.h = play.peak * 4 * u * (1 - u) + (play.shot ? 0.3 * u : 0)
    }

    // Everyone moves: shape with the ball, the carrier drives at goal, the
    // receiver meets the pass, one defender presses, keepers guard the line.
    const carrier = play.kind === 'held' || play.kind === 'windup' ? play.by : null
    let presser: Footballer | null = null
    if (carrier || play.kind === 'flight') {
      let bestD = Infinity
      for (const p of players) {
        if (p.team === possession || p.keeper) continue
        const d = Math.hypot(p.x - ball.x, p.y - ball.y)
        if (d < bestD) {
          bestD = d
          presser = p
        }
      }
    }
    for (const p of players) {
      const dir = dirOf(p.team)
      let tx: number
      let ty: number
      let speed = 5
      if (play.kind === 'goal') {
        const celebrating = p.team === play.scorer.team
        tx = celebrating ? play.scorer.x - dir * (2 + (p.num % 4)) : p.homeX
        ty = celebrating ? play.scorer.y + ((p.num % 5) - 2) * 1.6 : p.homeY
        speed = celebrating ? 7 : 3
      } else if (p.keeper) {
        const own = goalOf(p.team === 0 ? 1 : 0)
        tx = own + dir * Math.min(6, Math.abs(ball.x - own) * 0.06 + 1)
        ty = 34 + (ball.y - 34) * 0.22
        if (play.kind === 'flight' && play.shot && play.shot.team !== p.team) {
          ty = play.ty
          speed = 9
        }
        if (carrier === p) {
          tx = p.x
          ty = p.y
        }
      } else if (carrier === p) {
        tx = p.x + dir * 6
        ty = p.y + (34 - p.y) * 0.3
        speed = play.kind === 'windup' ? 1.5 : 6.4
      } else if (play.kind === 'flight' && play.to === p) {
        tx = play.tx
        ty = play.ty
        speed = 7.5
      } else if (p === presser) {
        tx = ball.x - dir * 0.8
        ty = ball.y
        speed = 6.8
      } else {
        tx = p.homeX + (ball.x - 52.5) * 0.55 + dir * (possession === p.team ? 7 : -2)
        ty = p.homeY + (ball.y - 34) * 0.35
      }
      tx = Math.min(PL + 1, Math.max(-1, tx))
      ty = Math.min(PW - 1, Math.max(1, ty))
      const dx = tx - p.x
      const dy = ty - p.y
      const d = Math.hypot(dx, dy)
      const want = Math.min(speed, d * 1.4)
      const wx = d > 0.01 ? (dx / d) * want : 0
      const wy = d > 0.01 ? (dy / d) * want : 0
      const k = Math.min(1, dt * 3.5)
      p.vx += (wx - p.vx) * k
      p.vy += (wy - p.vy) * k
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.stride += Math.hypot(p.vx, p.vy) * dt * 1.9
    }
    // The camera leads toward the goal on a shot, and pans far enough to show the nets.
    const aim = play.kind === 'flight' && play.shot ? play.tx : ball.x
    camX += (aim - camX) * Math.min(1, dt * (play.kind === 'flight' && play.shot ? 2.6 : 1.6))
    camX = Math.min(91, Math.max(14, camX))
  }

  const drawPitch = (ctx: CanvasRenderingContext2D) => {
    // Run-off grass, then mowing stripes across the pitch.
    const quad = (x0: number, y0: number, x1: number, y1: number) => {
      const a = project(x0, y0)
      const b = project(x1, y0)
      const c = project(x1, y1)
      const d = project(x0, y1)
      ctx.beginPath()
      ctx.moveTo(a[0], a[1])
      ctx.lineTo(b[0], b[1])
      ctx.lineTo(c[0], c[1])
      ctx.lineTo(d[0], d[1])
      ctx.closePath()
      ctx.fill()
    }
    ctx.fillStyle = '#2a7434'
    quad(-30, -12, PL + 30, PW + 3)
    for (let i = 0; i < 20; i++) {
      ctx.fillStyle = i % 2 ? '#358a40' : '#3f9a49'
      quad(i * 5.25, -2, (i + 1) * 5.25, PW + 2)
    }
    // Lines.
    ctx.strokeStyle = 'rgba(255,255,255,0.88)'
    ctx.lineWidth = 2.2
    const path = (pts: [number, number][], close = false) => {
      ctx.beginPath()
      pts.forEach(([x, y], i) => {
        const [sx, sy] = project(x, y)
        if (i) ctx.lineTo(sx, sy)
        else ctx.moveTo(sx, sy)
      })
      if (close) ctx.closePath()
      ctx.stroke()
    }
    const arc = (cx: number, cy: number, r: number, a0: number, a1: number) => {
      const pts: [number, number][] = []
      for (let k = 0; k <= 36; k++) {
        const a = a0 + ((a1 - a0) * k) / 36
        pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r])
      }
      path(pts)
    }
    path([[0, 0], [PL, 0], [PL, PW], [0, PW]], true)
    path([[52.5, 0], [52.5, PW]])
    arc(52.5, 34, 9.15, 0, Math.PI * 2)
    for (const [gx, s] of [[0, 1], [PL, -1]] as const) {
      path([[gx, 13.84], [gx + s * 16.5, 13.84], [gx + s * 16.5, 54.16], [gx, 54.16]])
      path([[gx, 24.84], [gx + s * 5.5, 24.84], [gx + s * 5.5, 43.16], [gx, 43.16]])
      const half = Math.acos(5.5 / 9.15)
      arc(gx + s * 11, 34, 9.15, s > 0 ? -half : Math.PI - half, s > 0 ? half : Math.PI + half)
      for (const cy of [0, PW]) arc(gx, cy, 1, 0, Math.PI * 2)
    }
    for (const x of [11, 52.5, PL - 11]) {
      const [sx, sy, s] = project(x, 34)
      ctx.fillStyle = 'rgba(255,255,255,0.9)'
      ctx.beginPath()
      ctx.ellipse(sx, sy, 0.2 * s, 0.08 * s, 0, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  const drawGoal = (ctx: CanvasRenderingContext2D, gx: number, out: number) => {
    const line = (a: [number, number, number], b: [number, number, number], width: number, colour: string) => {
      const p = project(...a)
      const q = project(...b)
      ctx.strokeStyle = colour
      ctx.lineWidth = width
      ctx.beginPath()
      ctx.moveTo(p[0], p[1])
      ctx.lineTo(q[0], q[1])
      ctx.stroke()
    }
    const net = 'rgba(235,240,245,0.35)'
    const bx = gx + out * 2
    for (let y = 30.34; y <= 37.67; y += 0.92) line([bx, y, 0], [bx, y, 1.7], 1, net)
    for (let h = 0.3; h <= 1.7; h += 0.35) line([bx, 30.34, h], [bx, 37.66, h], 1, net)
    for (const y of [30.34, 37.66]) {
      line([gx, y, 2.44], [bx, y, 1.7], 1.2, net)
      line([bx, y, 0], [bx, y, 1.7], 1.2, net)
      for (let k = 1; k < 3; k++) line([gx + out * k * 0.66, y, 0], [gx + out * k * 0.66, y, 2.44 - k * 0.25], 1, net)
    }
    line([gx, 30.34, 2.44], [bx, 30.34, 1.7], 1.4, net)
    const s = project(gx, 34)[2]
    line([gx, 30.34, 0], [gx, 30.34, 2.44], 0.12 * s, '#f8f8f8')
    line([gx, 37.66, 0], [gx, 37.66, 2.44], 0.12 * s, '#f8f8f8')
    line([gx, 30.34, 2.44], [gx, 37.66, 2.44], 0.12 * s, '#f8f8f8')
  }

  const drawPlayer = (ctx: CanvasRenderingContext2D, p: Footballer) => {
    const [sx, sy, s] = project(p.x, p.y)
    if (sx < -60 || sx > W + 60) return
    const kit = KITS[p.team]
    const shirt = p.keeper ? kit.keeper : kit.shirt
    const swing = Math.sin(p.stride) * Math.min(1, Math.hypot(p.vx, p.vy) / 3) * 0.32
    const bob = Math.abs(Math.cos(p.stride)) * 0.03 * Math.min(1, Math.hypot(p.vx, p.vy) / 3)
    const Y = (h: number) => sy - (h + bob) * s
    ctx.fillStyle = 'rgba(0,0,0,0.28)'
    ctx.beginPath()
    ctx.ellipse(sx + 0.25 * s, sy, 0.42 * s, 0.11 * s, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.lineCap = 'round'
    // Legs: socks over the shin, boots at the ends.
    for (const side of [-1, 1]) {
      const fx = sx + (side * 0.08 + swing * side) * s
      ctx.strokeStyle = kit.socks
      ctx.lineWidth = 0.15 * s
      ctx.beginPath()
      ctx.moveTo(sx + side * 0.09 * s, Y(0.82))
      ctx.lineTo(fx, sy - 0.08 * s)
      ctx.stroke()
      ctx.strokeStyle = p.skin
      ctx.lineWidth = 0.13 * s
      ctx.beginPath()
      ctx.moveTo(sx + side * 0.09 * s, Y(0.82))
      ctx.lineTo(sx + (side * 0.085 + swing * side * 0.45) * s, Y(0.5))
      ctx.stroke()
      ctx.fillStyle = '#111'
      ctx.fillRect(fx - 0.08 * s, sy - 0.07 * s, 0.17 * s, 0.07 * s)
    }
    // Shorts, shirt, arms, head.
    ctx.fillStyle = kit.shorts
    ctx.fillRect(sx - 0.2 * s, Y(1.0), 0.4 * s, 0.24 * s)
    ctx.fillStyle = shirt
    ctx.beginPath()
    ctx.roundRect(sx - 0.23 * s, Y(1.52), 0.46 * s, 0.56 * s, 0.07 * s)
    ctx.fill()
    if (s > 32) {
      ctx.fillStyle = p.team === 0 && !p.keeper ? kit.shorts : '#ffffff'
      ctx.font = `700 ${0.26 * s}px ${SANS}`
      ctx.textAlign = 'center'
      ctx.fillText(String(p.num), sx, Y(1.16))
    }
    for (const side of [-1, 1]) {
      ctx.strokeStyle = p.skin
      ctx.lineWidth = 0.1 * s
      ctx.beginPath()
      ctx.moveTo(sx + side * 0.22 * s, Y(1.46))
      ctx.lineTo(sx + (side * 0.27 - swing * side * 0.6) * s, Y(1.05))
      ctx.stroke()
    }
    ctx.fillStyle = p.skin
    ctx.beginPath()
    ctx.arc(sx, Y(1.67), 0.12 * s, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = p.hair
    ctx.beginPath()
    ctx.arc(sx, Y(1.69), 0.12 * s, Math.PI, Math.PI * 2)
    ctx.fill()
  }

  const drawHud = (ctx: CanvasRenderingContext2D, t: number, controlled: Footballer) => {
    // Scoreboard: clock, then the teams and the score.
    const total = 63 * 60 + 12 + t * 6
    const clock = total < 90 * 60 ? total : 46 * 60 + ((total - 90 * 60) % (44 * 60))
    const mm = String(Math.floor(clock / 60)).padStart(2, '0')
    const ss = String(Math.floor(clock % 60)).padStart(2, '0')
    ctx.fillStyle = 'rgba(8,10,16,0.86)'
    ctx.beginPath()
    ctx.roundRect(34, 28, 356, 48, 8)
    ctx.fill()
    ctx.fillStyle = '#f4f4f6'
    ctx.beginPath()
    ctx.roundRect(34, 28, 96, 48, [8, 0, 0, 8])
    ctx.fill()
    ctx.fillStyle = '#0b0d12'
    ctx.font = `700 26px ${MONO}`
    ctx.textAlign = 'center'
    ctx.fillText(`${mm}:${ss}`, 82, 61)
    ctx.font = `800 24px ${SANS}`
    ctx.fillStyle = KITS[0].chip
    ctx.fillRect(142, 38, 8, 28)
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'left'
    ctx.fillText(KITS[0].name, 158, 61)
    ctx.textAlign = 'center'
    ctx.fillText(`${score[0]} – ${score[1]}`, 262, 61)
    ctx.textAlign = 'right'
    ctx.fillText(KITS[1].name, 366, 61)
    ctx.fillStyle = KITS[1].chip
    ctx.fillRect(374, 38, 8, 28)

    // Radar.
    const rw = 210
    const rh = 136
    const rx = W / 2 - rw / 2
    const ry = H - rh - 22
    ctx.fillStyle = 'rgba(6,14,10,0.62)'
    ctx.beginPath()
    ctx.roundRect(rx - 6, ry - 6, rw + 12, rh + 12, 8)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'
    ctx.lineWidth = 1.2
    ctx.strokeRect(rx, ry, rw, rh)
    ctx.beginPath()
    ctx.moveTo(rx + rw / 2, ry)
    ctx.lineTo(rx + rw / 2, ry + rh)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(rx + rw / 2, ry + rh / 2, 18, 0, Math.PI * 2)
    ctx.stroke()
    ctx.strokeRect(rx, ry + rh / 2 - 40, 33, 80)
    ctx.strokeRect(rx + rw - 33, ry + rh / 2 - 40, 33, 80)
    const rad = (x: number, y: number): [number, number] => [rx + (x / PL) * rw, ry + rh - (y / PW) * rh]
    for (const p of players) {
      const [px, py] = rad(p.x, p.y)
      ctx.fillStyle = p.keeper ? KITS[p.team].keeper : p.team === 0 ? '#f3f5fa' : '#e8344b'
      ctx.beginPath()
      ctx.arc(px, py, 3.6, 0, Math.PI * 2)
      ctx.fill()
      if (p === controlled) {
        ctx.strokeStyle = '#38bdf8'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(px, py, 6.2, 0, Math.PI * 2)
        ctx.stroke()
      }
    }
    const [bxr, byr] = rad(ball.x, ball.y)
    ctx.fillStyle = '#ffe14d'
    ctx.beginPath()
    ctx.arc(bxr, byr, 3, 0, Math.PI * 2)
    ctx.fill()
  }

  return live(W, H, (ctx, t) => {
    const dt = Math.min(0.1, Math.max(0, t - last))
    last = t
    step(t, dt)

    // Stands, LED boards, the pitch, goals.
    const boardY = PW + 3
    const [, boardBase, bs] = project(0, boardY)
    const boardTop = boardBase - 0.95 * bs
    const shake = play.kind === 'goal' ? Math.abs(Math.sin(t * 11)) * 3 : 0
    const scale = (boardTop + 4) / crowd.height
    const tileW = crowd.width * scale
    let off = (-(camX * 18) % tileW) - tileW
    for (; off < W; off += tileW) ctx.drawImage(crowd, off, -shake, tileW, boardTop + 4)
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.4 + rand() * 0.6})`
      ctx.fillRect(rand() * W, 30 + rand() * (boardTop - 40), 2, 2)
    }
    const segment = 14
    const shift = Math.floor(t / 6)
    for (let k = -3; k < 12; k++) {
      const x0 = k * segment
      const [a] = project(x0, boardY)
      const [b] = project(x0 + segment, boardY)
      if (b < 0 || a > W) continue
      const lit = (k + shift) % 2 === 0
      ctx.fillStyle = lit ? '#0c1a3a' : '#111317'
      ctx.fillRect(a, boardTop, b - a, boardBase - boardTop)
      ctx.fillStyle = lit ? '#ffd34d' : '#e9edf5'
      ctx.font = `800 ${0.62 * bs}px ${SANS}`
      ctx.textAlign = 'center'
      ctx.fillText(BOARDS[(((k + shift) % BOARDS.length) + BOARDS.length) % BOARDS.length], (a + b) / 2, boardBase - 0.24 * bs)
      ctx.fillStyle = 'rgba(0,0,0,0.5)'
      ctx.fillRect(b - 1, boardTop, 2, boardBase - boardTop)
    }
    drawPitch(ctx)
    drawGoal(ctx, 0, -1)
    drawGoal(ctx, PL, 1)

    // The player the console controls: the carrier when it's ours, else our
    // player nearest the ball.
    let controlled = players[0]
    if ((play.kind === 'held' || play.kind === 'windup') && play.by.team === 0) controlled = play.by
    else {
      let bestD = Infinity
      for (const p of players) {
        if (p.team !== 0 || p.keeper) continue
        const d = Math.hypot(p.x - ball.x, p.y - ball.y)
        if (d < bestD) {
          bestD = d
          controlled = p
        }
      }
    }
    {
      const [cx, cy, s] = project(controlled.x, controlled.y)
      ctx.strokeStyle = '#38bdf8'
      ctx.lineWidth = 0.07 * s
      ctx.beginPath()
      ctx.ellipse(cx, cy, 0.62 * s, 0.2 * s, 0, 0, Math.PI * 2)
      ctx.stroke()
    }

    // Players and the ball, far to near.
    const ballSy = project(ball.x, ball.y)[1]
    const sorted = [...players].sort((a, b) => b.y - a.y)
    let ballDrawn = false
    const drawBall = () => {
      const [gx, gy, s] = project(ball.x, ball.y)
      const r = Math.max(3, 0.13 * s)
      ctx.fillStyle = 'rgba(0,0,0,0.32)'
      ctx.beginPath()
      ctx.ellipse(gx, gy, r * 1.1, r * 0.4, 0, 0, Math.PI * 2)
      ctx.fill()
      const by = gy - ball.h * s - r
      ctx.fillStyle = '#fbfbf8'
      ctx.beginPath()
      ctx.arc(gx, by, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = 'rgba(30,30,40,0.55)'
      ctx.beginPath()
      ctx.arc(gx - r * 0.25, by - r * 0.15, r * 0.35, 0, Math.PI * 2)
      ctx.fill()
      ballDrawn = true
    }
    for (const p of sorted) {
      if (!ballDrawn && project(p.x, p.y)[1] > ballSy) drawBall()
      drawPlayer(ctx, p)
    }
    if (!ballDrawn) drawBall()

    // The marker over the controlled player, and the power bar while shooting.
    {
      const [cx, cy, s] = project(controlled.x, controlled.y)
      const top = cy - 2.05 * s
      ctx.fillStyle = '#38bdf8'
      ctx.beginPath()
      ctx.moveTo(cx - 0.2 * s, top - 0.32 * s)
      ctx.lineTo(cx + 0.2 * s, top - 0.32 * s)
      ctx.lineTo(cx, top)
      ctx.closePath()
      ctx.fill()
      ctx.font = `700 ${Math.max(14, 0.36 * s)}px ${SANS}`
      ctx.textAlign = 'center'
      ctx.fillStyle = '#ffffff'
      ctx.fillText(`${KITS[0].name} ${controlled.num}`, cx, top - 0.42 * s)
      if (play.kind === 'windup' && play.by === controlled) {
        const f = Math.min(1, (t - play.start) / (play.until - play.start))
        const bw = 1.7 * s
        ctx.fillStyle = 'rgba(0,0,0,0.6)'
        ctx.fillRect(cx - bw / 2, cy + 0.3 * s, bw, 0.22 * s)
        const grad = ctx.createLinearGradient(cx - bw / 2, 0, cx + bw / 2, 0)
        grad.addColorStop(0, '#ffe14d')
        grad.addColorStop(1, '#ff5a36')
        ctx.fillStyle = grad
        ctx.fillRect(cx - bw / 2 + 2, cy + 0.3 * s + 2, (bw - 4) * f, 0.22 * s - 4)
      }
    }

    drawHud(ctx, t, controlled)

    if (play.kind === 'goal') {
      const a = Math.min(1, (3.6 - (play.until - t)) * 3)
      ctx.save()
      ctx.globalAlpha = a
      ctx.fillStyle = 'rgba(8,10,16,0.55)'
      ctx.fillRect(0, H * 0.36, W, 150)
      ctx.translate(W / 2, H * 0.36 + 98)
      ctx.transform(1, 0, -0.18, 1, 0, 0)
      ctx.font = `900 112px ${SANS}`
      ctx.textAlign = 'center'
      const g = ctx.createLinearGradient(0, -90, 0, 0)
      g.addColorStop(0, '#fff6c8')
      g.addColorStop(1, '#ffb32e')
      ctx.fillStyle = g
      ctx.fillText('GOAL!', 0, 0)
      ctx.restore()
      ctx.globalAlpha = a
      ctx.font = `700 26px ${SANS}`
      ctx.textAlign = 'center'
      ctx.fillStyle = '#ffffff'
      const minute = Math.floor((63 * 60 + 12 + t * 6) / 60) % 90
      ctx.fillText(`${KITS[play.scorer.team].name}  #${play.scorer.num}   ${minute}'`, W / 2, H * 0.36 + 136)
      ctx.globalAlpha = 1
    }

    // The glass: a soft vignette.
    const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, W * 0.62)
    v.addColorStop(0, 'rgba(0,0,0,0)')
    v.addColorStop(1, 'rgba(0,0,0,0.35)')
    ctx.fillStyle = v
    ctx.fillRect(0, 0, W, H)
    ctx.textAlign = 'left'
  }, 24)
}

// ── Spin bike and treadmill: they react to your effort ──────────────────────

function stat(ctx: CanvasRenderingContext2D, label: string, value: string, x: number, y: number) {
  ctx.fillStyle = 'rgba(255,255,255,0.65)'
  ctx.font = `26px ${SANS}`
  ctx.fillText(label, x, y)
  ctx.fillStyle = '#ffffff'
  ctx.font = `700 64px ${SANS}`
  ctx.fillText(value, x, y + 66)
}

export const bikeScreen = () =>
  live(1280, 768, (ctx, _t, W, H) => {
    const sky = ctx.createLinearGradient(0, 0, 0, H * 0.55)
    sky.addColorStop(0, '#2c3e70')
    sky.addColorStop(1, '#f2a65a')
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, W, H * 0.55)
    ctx.fillStyle = '#2f5d3a'
    ctx.fillRect(0, H * 0.55, W, H * 0.45)
    // Road toward the horizon; lane dashes rush toward you with your speed.
    ctx.fillStyle = '#3a3d44'
    ctx.beginPath()
    ctx.moveTo(W / 2 - 30, H * 0.55)
    ctx.lineTo(W / 2 + 30, H * 0.55)
    ctx.lineTo(W * 0.86, H)
    ctx.lineTo(W * 0.14, H)
    ctx.fill()
    const travel = exercise.distance * 4000
    ctx.fillStyle = '#f5d76e'
    for (let i = 0; i < 12; i++) {
      const z = ((i / 12 + travel / 40) % 1)
      const p = z * z
      const y = H * 0.55 + p * H * 0.45
      const w = 4 + p * 26
      ctx.fillRect(W / 2 - w / 2, y, w, 6 + p * 40)
    }
    ctx.fillStyle = 'rgba(8,10,16,0.55)'
    ctx.fillRect(0, 0, W, 150)
    stat(ctx, 'cadence', `${Math.round(exercise.cadence)} rpm`, 40, 50)
    stat(ctx, 'speed', `${exercise.speed.toFixed(1)} km/h`, 380, 50)
    stat(ctx, 'distance', `${exercise.distance.toFixed(2)} km`, 760, 50)
    if (exercise.speed < 0.5) {
      ctx.fillStyle = '#ffffff'
      ctx.font = `600 44px ${SANS}`
      ctx.textAlign = 'center'
      ctx.fillText('Tap ← → to pedal', W / 2, H * 0.8)
      ctx.textAlign = 'left'
    }
  })

export const treadmillScreen = () =>
  live(1280, 786, (ctx, _t, W, H) => {
    ctx.fillStyle = '#0d1420'
    ctx.fillRect(0, 0, W, H)
    // A 400 m track; your dot laps it as you run.
    const cx = W / 2
    const cy = H * 0.62
    ctx.strokeStyle = '#c4502c'
    ctx.lineWidth = 34
    ctx.beginPath()
    ctx.ellipse(cx, cy, 420, 200, 0, 0, Math.PI * 2)
    ctx.stroke()
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.ellipse(cx, cy, 420, 200, 0, 0, Math.PI * 2)
    ctx.stroke()
    const a = ((exercise.distance * 1000) / 400) * Math.PI * 2 - Math.PI / 2
    ctx.fillStyle = '#7ee0a1'
    ctx.beginPath()
    ctx.arc(cx + Math.cos(a) * 420, cy + Math.sin(a) * 200, 18, 0, Math.PI * 2)
    ctx.fill()
    const pace = exercise.speed > 0.5 ? 60 / exercise.speed : 0
    stat(ctx, 'speed', `${exercise.speed.toFixed(1)} km/h`, 40, 50)
    stat(ctx, 'pace', pace ? `${Math.floor(pace)}:${String(Math.round((pace % 1) * 60)).padStart(2, '0')} /km` : '–', 420, 50)
    stat(ctx, 'distance', `${(exercise.distance * 1000).toFixed(0)} m`, 840, 50)
    if (exercise.speed < 0.5) {
      ctx.fillStyle = '#ffffff'
      ctx.font = `600 44px ${SANS}`
      ctx.textAlign = 'center'
      ctx.fillText('Tap ← → to run', cx, cy + 10)
      ctx.textAlign = 'left'
    }
  })

// ── Chessboard status strip ─────────────────────────────────────────────────

export const aiStatusScreen = (text: () => string) =>
  live(880, 160, (ctx, t, W, H) => {
    ctx.fillStyle = '#04070b'
    ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = '#29d3ff'
    ctx.beginPath()
    ctx.arc(60, H / 2, 16 + Math.sin(t * 4) * 3, 0, Math.PI * 2)
    ctx.fill()
    ctx.font = `700 54px ${SANS}`
    ctx.fillStyle = '#e8fbff'
    ctx.fillText('AI', 100, H / 2 + 19)
    ctx.font = `46px ${MONO}`
    ctx.fillStyle = '#9fe9ff'
    ctx.fillText(text(), 190, H / 2 + 16)
  })

// ── Desk keypads: the desk's height in centimetres ──────────────────────────

export const keypadScreen = (heightM: () => number) =>
  live(240, 100, (ctx, t, W, H) => {
    ctx.fillStyle = '#05080b'
    ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = '#7ff0ff'
    ctx.font = `700 64px ${MONO}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(Math.round(heightM() * 100)), W / 2, H / 2 + 4)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    if (Math.floor(t * 2) % 2 === 0) ctx.fillRect(W - 22, H - 22, 10, 10)
  })

// ── Espresso machine: brew temperature, pressure, and a shot timer ──────────

export const coffeeScreen = () =>
  live(520, 200, (ctx, t, W, H) => {
    ctx.fillStyle = '#04070a'
    ctx.fillRect(0, 0, W, H)
    const shot = t % 40
    const pulling = shot < 28
    ctx.font = `600 52px ${MONO}`
    ctx.fillStyle = '#f5f1e6'
    ctx.fillText('93.5°', 26, 82)
    ctx.fillStyle = pulling ? '#ffb35c' : '#7d8590'
    ctx.fillText(`${pulling ? (6 + Math.min(3, shot * 0.6)).toFixed(1) : '0.0'} bar`, 26, 160)
    ctx.textAlign = 'right'
    ctx.fillStyle = '#7ff0ff'
    ctx.font = `700 ${pulling ? 92 : 58}px ${MONO}`
    ctx.fillText(pulling ? `${Math.floor(shot)}s` : 'ready', W - 26, pulling ? 128 : 118)
    ctx.textAlign = 'left'
  })

// ── PC: the pump head's round screen and the board's two-digit display ─────

/** CPU temperature: idles in the forties, climbs when a build or a game runs. */
export function cpuTemp(seconds: number) {
  const load = 0.5 + 0.5 * Math.sin(seconds * 0.11) * Math.sin(seconds * 0.037 + 1)
  return 41 + load * 27 + Math.sin(seconds * 1.7) * 1.2
}

export const pumpScreen = () =>
  live(256, 256, (ctx, seconds, W, H) => {
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, W, H)
    const gpu = seconds % 16 > 12
    const temp = gpu ? cpuTemp(seconds + 40) + 9 : cpuTemp(seconds)
    const k = Math.min(1, Math.max(0, (temp - 30) / 60))
    const cx = W / 2
    const cy = H / 2
    ctx.lineCap = 'round'
    ctx.lineWidth = 14
    ctx.strokeStyle = '#1b1f26'
    ctx.beginPath()
    ctx.arc(cx, cy, 104, Math.PI * 0.75, Math.PI * 2.25)
    ctx.stroke()
    const hue = 190 - k * 170
    ctx.strokeStyle = `hsl(${hue}, 95%, 58%)`
    ctx.beginPath()
    ctx.arc(cx, cy, 104, Math.PI * 0.75, Math.PI * (0.75 + 1.5 * k))
    ctx.stroke()
    // Ticks spinning slowly, like the pump turning.
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2 + seconds * 0.6
      ctx.fillStyle = `rgba(255,255,255,${i % 6 === 0 ? 0.5 : 0.15})`
      ctx.fillRect(cx + Math.cos(a) * 84 - 1.5, cy + Math.sin(a) * 84 - 1.5, 3, 3)
    }
    ctx.textAlign = 'center'
    ctx.fillStyle = '#9aa4b2'
    ctx.font = `600 22px ${SANS}`
    ctx.fillText(gpu ? 'GPU' : 'CPU', cx, cy - 40)
    ctx.fillStyle = '#ffffff'
    ctx.font = `700 76px ${SANS}`
    ctx.fillText(`${Math.round(temp)}°`, cx + 8, cy + 28)
    ctx.fillStyle = `hsl(${hue}, 90%, 65%)`
    ctx.font = `500 20px ${SANS}`
    ctx.fillText(`liquid ${(29.5 + k * 6).toFixed(1)}°C`, cx, cy + 64)
    ctx.textAlign = 'left'
  })

/** Seven-segment digits. */
function sevenSegment(ctx: CanvasRenderingContext2D, digit: number, x: number, y: number, w: number, h: number, on: string, off: string) {
  const map = [0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x6f][digit] ?? 0
  const t = w * 0.18
  const segs: [number, number, number, number][] = [
    [x + t, y, w - 2 * t, t], [x + w - t, y + t, t, h / 2 - t], [x + w - t, y + h / 2, t, h / 2 - t],
    [x + t, y + h - t, w - 2 * t, t], [x, y + h / 2, t, h / 2 - t], [x, y + t, t, h / 2 - t], [x + t, y + h / 2 - t / 2, w - 2 * t, t],
  ]
  segs.forEach(([sx, sy, sw, sh], i) => {
    ctx.fillStyle = map & (1 << i) ? on : off
    ctx.fillRect(sx, sy, sw, sh)
  })
}

export const postScreen = () =>
  live(128, 72, (ctx, seconds, W, H) => {
    ctx.fillStyle = '#080202'
    ctx.fillRect(0, 0, W, H)
    const temp = Math.round(cpuTemp(seconds))
    ctx.shadowColor = '#ff2a1a'
    ctx.shadowBlur = 8
    sevenSegment(ctx, Math.floor(temp / 10) % 10, 14, 8, 44, H - 16, '#ff3b2a', '#2a0a08')
    sevenSegment(ctx, temp % 10, 68, 8, 44, H - 16, '#ff3b2a', '#2a0a08')
    ctx.shadowBlur = 0
  })

// ── Dyson: air quality on its round display ─────────────────────────────────

export const dysonScreen = () =>
  live(256, 256, (ctx, seconds, W, H) => {
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, W, H)
    const pm = Math.max(1, Math.round(4 + 3 * Math.sin(seconds * 0.07) + Math.sin(seconds * 0.9)))
    const cx = W / 2
    ctx.strokeStyle = '#3ddc84'
    ctx.lineWidth = 8
    ctx.beginPath()
    ctx.arc(cx, H / 2, 112, 0, Math.PI * 2)
    ctx.stroke()
    ctx.textAlign = 'center'
    ctx.fillStyle = '#9aa4b2'
    ctx.font = `600 22px ${SANS}`
    ctx.fillText('PM2.5', cx, 72)
    ctx.fillStyle = '#3ddc84'
    ctx.font = `700 84px ${SANS}`
    ctx.fillText(String(pm), cx, 152)
    ctx.fillStyle = '#ffffff'
    ctx.font = `600 20px ${SANS}`
    ctx.fillText('AUTO · good', cx, 190)
    // Fan speed bars, and the fan icon turning.
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = i < 4 ? '#ffffff' : '#2a2f36'
      ctx.fillRect(cx - 60 + i * 12, 206, 8, 14)
    }
    ctx.save()
    ctx.translate(cx, 38)
    ctx.rotate(seconds * 4)
    ctx.fillStyle = '#ffffff'
    for (let i = 0; i < 3; i++) {
      ctx.rotate((Math.PI * 2) / 3)
      ctx.beginPath()
      ctx.ellipse(0, -8, 4, 8, 0, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
    ctx.textAlign = 'left'
  })

// ── The blinds' master panel by the door ────────────────────────────────────

export const blindPanelScreen = (state: () => { groups: { id: string; down: number }[]; moving: string }) =>
  live(480, 320, (ctx, seconds, W, H) => {
    ctx.fillStyle = '#0b0f14'
    ctx.fillRect(0, 0, W, H)
    const { groups, moving } = state()
    ctx.fillStyle = '#e8edf3'
    ctx.font = `700 26px ${SANS}`
    ctx.fillText('BLINDS', 22, 40)
    ctx.fillStyle = moving ? '#ffb35c' : '#7d8794'
    ctx.font = `500 20px ${SANS}`
    ctx.textAlign = 'right'
    ctx.fillText(moving ? `${spinner(seconds)} moving ${moving === 'all' ? 'all' : moving.toUpperCase()}` : 'hold ▲ ▼ for all', W - 22, 40)
    ctx.textAlign = 'left'
    groups.forEach((g, i) => {
      const col = i < 5 ? 0 : 1
      const row = i < 5 ? i : i - 5
      const x = 22 + col * 236
      const y = 74 + row * 48
      ctx.fillStyle = '#a9b4c2'
      ctx.font = `600 20px ${MONO}`
      ctx.fillText(g.id.toUpperCase(), x, y + 18)
      ctx.fillStyle = '#1d2530'
      ctx.fillRect(x + 50, y + 4, 130, 18)
      ctx.fillStyle = moving === g.id || moving === 'all' ? '#ffb35c' : '#7fd1ff'
      ctx.fillRect(x + 50, y + 4, 130 * g.down, 18)
      ctx.fillStyle = '#e8edf3'
      ctx.font = `500 16px ${MONO}`
      ctx.fillText(`${Math.round(g.down * 100)}%`, x + 188, y + 19)
    })
  })

// ── Mixer: two level meters that bounce with the music ──────────────────────

export const musicScreen = (isPlaying: () => boolean, level: (t: number) => number) =>
  live(128, 512, (ctx, t, W, H) => {
    ctx.fillStyle = '#040506'
    ctx.fillRect(0, 0, W, H)
    const playing = isPlaying()
    const segs = 18
    for (let ch = 0; ch < 2; ch++) {
      const v = playing ? Math.min(1, level(t + ch * 0.07) * (0.82 + 0.18 * Math.abs(Math.sin(t * (5.3 + ch) + ch)))) : 0
      const lit = Math.round(v * segs)
      for (let i = 0; i < segs; i++) {
        const y = H - 24 - i * 26
        const colour = i > 15 ? '#ff3b30' : i > 11 ? '#ffcc00' : '#34c759'
        ctx.fillStyle = i < lit ? colour : '#14181c'
        ctx.fillRect(18 + ch * 52, y - 18, 40, 20)
      }
    }
  })

# Placeholders: what still needs your real work

Everything in the office that stands in for your own work, and what to send to
replace it. Directions assume you stand inside the room: the glass is north and
west, the entrance door is on the south wall, the kitchen is north-east.

In the code, each placeholder is tagged `PLACEHOLDER`. To list them all:

```sh
grep -rn PLACEHOLDER src layout
```

The text about you (pin board, captions, handle) lives in `src/content.ts`; edit it
there and nothing else needs to change. Anything that changes the 3D model also
needs `npm run model` (Blender 5.2) before you commit.

## Pin board ("About me", south wall, between the entrance door and The Buddha)

Source: `owner` in `src/content.ts`.

| Card | Shows now | What I need from you |
| --- | --- | --- |
| Name | DANNIEL | Nothing (done). |
| Role | "Builder of software and agent systems" | Confirm, or give the line you want. |
| Location | Dallas, Texas | Nothing (done). |
| Experience | 3 rows of "Your current role · Company · 20XX" | Up to 3 roles, newest first: title, company, years. |
| Skills | TypeScript, React, Next.js, three.js, GSAP, Blender, AI agents, System design | Confirm or edit (about 8 fit). |
| Education | "Degree or programme / School · year" | Degree or programme, school, year. |
| Now building | "This office, one object at a time. / Ask me about the agent lab →" | One or two short lines. |
| Photos (3) | Blank cards that say "your photo" | 3 photos (square crops look best) and a caption for each. Drop them in `public/photos/board/` and set `src` in `owner.photos`. |

## The elevator

| What | Shows now | What I need from you |
| --- | --- | --- |
| Poster (left wall of the car) | One of eight well-known lines about building software (Beck, Dijkstra, Torvalds, Knuth, Karlton, Abelson & Sussman, Brooks, Kay), picked at random each ride | Your own posters: a quote, a launch, a talk… Each is a quote, a name and an optional source in `elevatorPosters` in `src/content.ts`. |

## Wall objects

| ID (layout) | Where | Shows now | What I need from you |
| --- | --- | --- | --- |
| `soon-wall-e` | East wall, left of the neon sign | Tape outline, sticky note "Art incoming…", a "Coming soon #1" plate | What goes here: a framed project, an award, a poster, a diploma… plus a photo or file of it. |
| `glass-board` | The glass behind the main desk (6 panels) | Sample marker diagrams: consistency/Raft, sharding, multi-region, "this office", an agent loop, an event pipeline | Optional: your own system diagrams. A photo of a sketch or a bullet list per panel is enough; I redraw it in marker. |
| `neon` | East wall, above the music corner | "Build With Danniel." in warm white | Confirm the wording and colour. |
| `world-clocks` | East wall, near the kitchen | Dallas, London, Jakarta | Confirm the three cities. |
| `art-jobs`, `art-e2`, `art-s2`, `art-e1` | South wall | Steve Jobs (Gotfryd, 1984), Redon's *The Buddha*, af Klint's *Adulthood*, Cole's *The Voyage of Life: Youth* | Nothing needed. They're your picks, all public domain (see `public/art/CREDITS.md`). Confirm the Jobs photo: a free "thinking" portrait doesn't exist, so this is the 1984 one with hands steepled. |

## Floor objects

| ID (layout) | Where | Shows now | What I need from you |
| --- | --- | --- | --- |
| `soon-floor-c` | North side, east of the pillar, on the way to the kitchen | Taped square, an easel sign "Coming soon #2", a sticky note | What goes here: a hardware build, a robot, a trophy, a product demo… a photo or a description. |
| `soon-floor-w` | West side, between the treadmill and the sofa | Taped square, an easel sign "Coming soon #3", a sticky note | Same as #2. |
| `game-console` + `controller-1/2` | Game corner, under the TV | A console and two controllers; the corner says "A playable game is on the way" | See Games below. |

The sticky-note jokes on the three spots are the `note` fields in `layout/office.json`.
The inspect text is `hotspotText` in `src/content.ts`.

## Games

| What | Status |
| --- | --- |
| Chess, Checkers, Go vs AI (the three tables mid-room) | Done and playable. Nothing needed. |
| Your own games (the TV corner, hotspot `game`) | **Waiting for you.** |

For each of your games, send:

1. **Where it lives:** a deployed URL, or the build (folder or repo).
2. **How it should open:** play it on the office TV (an overlay when you sit at the console), or open it in a new tab.
3. **Title, one line about it, and the controls.**
4. **A cover image or a short clip** for the TV's attract screen.

If a game is hosted on another domain and plays on the TV, its origin also has
to be added to `frame-src` in `vercel.json` (the security headers block
anything not listed).

## Screen objects

| Screen | Shows now | What I need from you |
| --- | --- | --- |
| TV (`SCR_tv`) | A football match from the broadcast camera, DAL v LDN, with the scoreboard, radar, shots and goals of a console game (`tvScreen` in `src/world/screens.ts`) | Your games (above). The LED boards round the pitch read `BOARDS` in the same file if you want your own lines there. |
| 34" monitor, vertical monitor, laptop (main desk) | A sample loop: edit → failing test → fix → push, the dev server and CI, then PR #142 merging, all on `github.com/danniel/office` | Your GitHub handle (`owner.github` in `src/content.ts`). Optional: a real repo, branch or PR to show. |
| Lab monitors (Herdr left, Pi right) | The agent factory you asked for: scout, plan, build, test, review | Optional: your real agent names or project. |
| iPad and notebook (lab desk) | A "factory" sketch and handwritten notes on the agent loop | Optional: your own notes. |
| Pump, POST code, Dyson, blinds panel, coffee machine, bike, treadmill, music meter | Live readouts | Nothing (decor that responds to the room). |

## Site and sharing (before a public launch)

These aren't in the room, but the deploy needs them.

| What | Now | What I need from you |
| --- | --- | --- |
| Domain | None yet (Vercel gives a `*.vercel.app` URL) | The domain or subdomain, e.g. `office.yourdomain.com`. |
| Link from your portfolio | Not wired | Will the portfolio **link** to the office, or **embed** it in an iframe? Embedding from another domain needs that domain added to `frame-ancestors` in `vercel.json`. |
| Social preview | Title and description only | A 1200×630 image for link previews (or I render one from the office). |
| Favicon | None | An icon or monogram, or I make one. |

# Danniel's Office

A walkable 3D office: you ride the elevator to the 23rd floor, step out, and
walk around the desk, the agent lab, the library, the music corner and the
game tables. Built with React Three Fiber, a Blender-scripted model and GSAP.

## Run it

```sh
npm ci
npm run dev        # http://localhost:5173
npm run build      # type-check, then a production build in dist/
npm run preview    # serve that build
npx tsx scripts/test-games.ts   # rules and AI checks for chess, checkers and go
```

## How it fits together

- `layout/office.json` is the single source of truth: positions, sizes, hotspots.
- `npm run model` rebuilds `public/models/office.glb` from that file with
  Blender 5.2 (`scripts/blender/build_office.py`). The `.blend` file it leaves in
  `build/` is a working file and is never committed or deployed.
- `src/content.ts` holds everything about you that the office shows.
- **`PLACEHOLDERS.md` lists everything that still stands in for your real work.**

## Deploy (Vercel)

`vercel.json` sets the build (`npm run build` → `dist/`) and the security headers.

- **Git:** import the repository in Vercel; every push deploys a preview, `main` deploys production.
- **CLI:** `vercel` for a preview, `vercel --prod` for production. `.vercelignore` keeps the Blender files and local builds from being uploaded.

No environment variables or secrets are needed; the site is fully static.

### Security headers

The Content-Security-Policy only lets the page load its own files, plus Spotify's
embed player. `blob:` scripts are allowed because the neon sign's text renderer
(troika, through drei's `Text`) and the Draco decoder build their workers from
blobs the page itself creates. Two settings need to change if the site does:

- **`'unsafe-eval'`** is there only because Spotify's embed script runs `eval()`.
  If the music corner ever drops Spotify, remove it (and the two Spotify origins).
- **`frame-ancestors 'self'`** stops other sites from framing the office. If your
  portfolio embeds it in an iframe from another domain, add that domain there
  (and drop `X-Frame-Options`).

Art credits are in `public/art/CREDITS.md`; the neon font's licence is in `public/fonts/`.

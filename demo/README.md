# SynthJS Demo

Interactive web playground. Edit source, press Play.

## Run locally

```bash
# 1. Build the package (so dist/index.js exists)
pnpm build

# 2. Serve the project root from any static server. Examples:
python3 -m http.server 8080
# or
npx serve .
# or
caddy file-server --listen :8080
```

Open http://localhost:8080/demo/ in a browser.

## Examples

The dropdown loads pre-baked sources for:

- **C Major Scale** — scale-degree pitches with `\key`
- **Chord Progression** — `@stdlib/chords` import + parameterized chord motifs
- **Two Voices** — independent bass and melody, melody under reverb
- **Custom Instrument** — `@stdlib/instruments` warm pad + four-voicing pads
- **Slide Chain** — `linearRampToValueAtTime` glides
- **Dynamics & Articulation** — `ramp(\\p, \\ff) { ... }` plus articulation marks

## How it works

`demo/main.js` imports `compileSync` and `Composition` directly from `../dist/index.js`. No bundler. The demo runs in any modern browser via plain ESM.

Audio playback uses the browser's native `AudioContext`. Browsers require a user gesture (button click) before playing audio — pressing Play satisfies that.

## Hosting

The `demo/` directory plus the built `dist/` directory together form a self-contained static site. Drop both into GitHub Pages, Netlify, Cloudflare Pages, or any static host.

# SynthJS Demo

Interactive web playground with full LSP-style features in the editor:

- 🔴 **Diagnostics** — errors and warnings highlighted inline as you type
- 🔍 **Hover tooltips** — pitch frequencies, motif signatures + docs, effect parameters
- ⌨️ **Autocomplete** — context-aware (after `\`, `@`, `with `, `\instrument `, etc.)
- 📄 **Doc comments** appear in hover and completion tooltips

Built on CodeMirror 6 with extensions backed by SynthJS language services (`getDiagnostics`, `getHover`, `getCompletions`).

## Run locally

```bash
# 1. Build the package (so dist/index.js exists)
pnpm build

# 2. Serve the project root from any static server
python3 -m http.server 8080
# or
npx serve .
```

Open http://localhost:8080/demo/ in a browser.

CodeMirror is loaded from esm.sh — no install step needed.

## Examples

The dropdown loads pre-baked sources for:

- **C Major Scale** — scale-degree pitches with `\key`
- **Chord Progression** — `@stdlib/chords` import + parameterized chord motifs
- **Two Voices** — independent bass and melody, melody under reverb
- **Custom Instrument** — `@stdlib/instruments` warm pad + four-voicing pads
- **Slide Chain** — `linearRampToValueAtTime` glides
- **Dynamics & Articulation** — `ramp(\p, \ff) { ... }` plus articulation marks

## How it works

`demo/main.js` imports `compileSync`, `Composition`, and the language services from `../dist/index.js`. `demo/lsp-extensions.js` wraps each service in a CodeMirror 6 extension (`linter`, `hoverTooltip`, `autocompletion`).

Browsers require a user gesture (button click) before playing audio — pressing Play satisfies that.

## Hosting

Drop the `demo/` directory plus the built `dist/` directory into any static host (GitHub Pages, Netlify, Cloudflare Pages, etc.). The CodeMirror imports resolve via the import map in `index.html`, which fetches from esm.sh at runtime.

# Changelog

## [2.0.0-alpha.6] — 2026-04-26

### Added
- **Language services** (`src/services/`) — pure-function API for editor integrations:
  - `getDiagnostics(source)` — LSP-style diagnostics with ranges and did-you-mean suggestions
  - `getHover(source, offset)` — hover content for pitches (frequency), motifs (signature + doc), effects, annotations, bindings, instrument defs
  - `getCompletions(source, offset)` — context-aware completions (after `\`, `@`, `with `, `\instrument `, `\key `, default event-position)
  - `getDefinition(source, offset)` — jump from `MotifRef`/`Call`/`\instrument` to the declaration
  - `rename(source, offset, newName)` — list of `TextEdit`s renaming a binding/motif/instrument and all its references
  - `offsetToPosition`, `positionToOffset`, `spanToRange` helpers
- **`synth-lsp` binary** — minimal LSP server over stdio using JSON-RPC. Implements `initialize`, `textDocument/didOpen|didChange|didClose|hover|completion|definition|rename|prepareRename`, plus auto-published diagnostics. Editors that speak LSP (VS Code, Neovim, Helix) can connect.
- **Demo upgrade** — replaced `<textarea>` with CodeMirror 6 + extensions backed by the language services. In-editor experience:
  - Inline error/warning highlights via lint gutter
  - Hover tooltips with rendered markdown
  - Context-aware autocomplete on Ctrl+Space and as you type
  - Doc comments surfaced in hover and completion info
  - CodeMirror loaded from esm.sh via import map; no install step beyond `pnpm build`

### Changed
- `package.json` `bin` now exports two binaries: `synth` (CLI) and `synth-lsp` (LSP server).
- `tsup.config.ts` builds three entry points: `dist/index.js` (library), `dist/cli.js`, `dist/lsp.js`.

## [2.0.0-alpha.5] — 2026-04-26

### Added
- **Standard library** (`src/stdlib/`) embedded as TypeScript string constants. Five modules:
  - `@stdlib/scales` — `major_scale`, `minor_scale`, `pentatonic_major`, `pentatonic_minor`, `blues`, `dorian_scale`, `mixolydian_scale`
  - `@stdlib/chords` — `triad_major`, `triad_minor`, `triad_dim`, `triad_aug`, `triad_sus2`, `triad_sus4`, `seventh_major`, `seventh_dom`, `seventh_minor`, `seventh_half_dim`, `seventh_dim`
  - `@stdlib/drums` — `kick_drum`, `snare_drum`, `hat_closed`, `hat_open`, `tom_low`, `tom_high` instruments
  - `@stdlib/instruments` — `warm_pad`, `lead_saw`, `brass`, `bass_synth`, `bell`, `string_pad`
  - `@stdlib/fx` — documentation only (block-parameter motifs not yet supported)
- **`synth render` CLI** for offline WAV export. Uses `node-web-audio-api` as optional peer dependency with graceful fallback message.
- **Web demo** (`demo/`) — single-file HTML/JS/CSS playground with six pre-baked examples (scale, chord progression, two-voice, custom instrument, slide chain, dynamics).

### Fixed
- Parser: bare identifiers followed by `+` or `-` and an integer now route to pitch arithmetic (ParamRef + arith) instead of motif-reference. Stdlib motifs like `major_scale(root)` (which use `root+2`, `root+4`, etc.) now parse correctly.

### Changed
- `compileSync` inlines `\use "@stdlib/..."` declarations synchronously. Relative imports (`./shared.synth`) still require async `compile()`.

## [2.0.0-alpha.4] — 2026-04-26

### Added
- **JSON IR export (`exportJson`)** (`src/tools/export-json.ts`): serialises a `CompositionIR` to JSON with optional pretty-printing and source-span inclusion.
- **Canonical source formatter (`format`)** (`src/tools/format.ts`): reformats SynthJS source to a canonical style (consistent indentation, normalised whitespace, version hoisting).
- **MIDI export (`exportMidi`)** (`src/tools/export-midi.ts`): converts a `CompositionIR` to a standard MIDI file (`Uint8Array`) with tempo, program-change, and note-on/note-off events.
- **WAV offline render (`renderToWav`, `audioBufferToWav`)** (`src/tools/render-wav.ts`): offline Web Audio rendering of a composition to a 44.1 kHz PCM WAV buffer.
- **Doc generator (`generateDocs`)** (`src/tools/gen-docs.ts`): extracts `///` doc comments from bindings, voices, and instrument definitions and emits a Markdown reference page.
- **Hot reload (`Composition.update`)** (`src/runtime/composition.ts`): replaces the active `CompositionIR` mid-playback, rescheduling voices from the current transport position.
- **`synth` CLI binary** (`src/cli/main.ts`): command-line interface with subcommands:
  - `fmt [path] [-i]` — format source in-place or to stdout
  - `check [path]` — parse and compile, exit 1 on errors
  - `json [path] [--include-spans] [--compact]` — emit IR as JSON
  - `midi <input> -o <output>` — export to MIDI file
  - `doc [path] [--title T] [-o <output>]` — generate Markdown docs
  - `help` — display usage

## [2.0.0-alpha.3] — 2026-04-26

### Added
- **Improved reverb impulse** (`effects.ts`): 5 ms fade-in, correlated noise via EMA, exponential decay, and decay clamping for a more natural-sounding reverb tail.
- **Sample-rate-aware distortion curve** (`effects.ts`): waveshaper curve length now derived from `AudioContext.sampleRate` instead of a fixed constant.
- **Centralized `DEFAULT_EFFECT_ARGS` table** (`effects.ts`): single source of truth for all effect default parameters; eliminates per-call magic numbers.
- **`buildEffect` returns `{ input, output }`** (`effects.ts`): compound node pair to correctly expose both endpoints for multi-node effects such as chorus.
- **Chorus dry/wet mix** (`effects.ts`): chorus effect now sums dry signal with the modulated wet signal for correct blending behaviour.
- **`Composition.currentEvent`** (`composition.ts`): reflects the currently active `TimelineEvent` by comparing `AudioContext.currentTime` against scheduled event windows.
- **`Composition.pause()` / `Composition.resume()`** (`composition.ts`): suspends and resumes `AudioContext` to pause and resume playback mid-performance.
- **`Composition.play({ loop: true })`** (`composition.ts`): when the `loop` option is set the composition restarts automatically once the final event has ended.
- **`Composition.onEnded(listener)`** (`composition.ts`): event-subscription API that fires once playback reaches the end (after the last scheduled note plus release tail).

## [2.0.0-alpha.2] — 2026-04-26

### Added
- **Web Audio runtime** (`Composition` class, `src/runtime/composition.ts`): top-level runtime that accepts a `CompositionIR` and an `AudioContext`, schedules all voices, and emits `@cue` events via a typed `EventEmitter`.
- **Lookahead scheduler** (`scheduler.ts`): tick-based scheduler using `AudioContext.currentTime` with a configurable lookahead window; prevents gaps and drift in real-time playback.
- **Instrument-aware oscillator factory** (`oscillator.ts`): creates `OscillatorNode` instances with waveform type resolved from the IR instrument name (sine/square/sawtooth/triangle).
- **ADSR envelope application** (`envelope.ts`): applies attack, decay, sustain, and release ramps to a `GainNode` using `setValueAtTime` / `linearRampToValueAtTime`.
- **Slide via `linearRampToValueAtTime`** (`slide.ts`): pitch glide between notes by scheduling a linear ramp on an `OscillatorNode.frequency` parameter.
- **Articulation effect** (`articulation.ts`): adjusts note gate duration (staccato shortens, legato sustains) by scaling the scheduled release time.
- **Effect node factories** (`effects.ts`): factory functions for gain, reverb (convolver + impulse synthesis), delay, biquad filter, waveshaper distortion, chorus (delay + LFO), and dynamics compressor nodes.
- **FX chain assembly** (`fx-chain.ts`): connects a list of effect descriptors into a series graph and wires source → chain → destination.
- **Per-voice scheduling** (`voice-player.ts`): iterates IR timeline events for a single voice, calling oscillator + envelope + slide + articulation + FX chain helpers, and schedules each note at the correct `AudioContext` time offset.
- **`@cue` event emission** (`composition.ts`): fires a `cue` event (with label and timestamp) when the scheduler reaches a `@cue` annotation, allowing external systems to synchronise visuals or MIDI.
- **`@chance` probabilistic gating** (`voice-player.ts`): per-note `@chance` annotation suppresses note scheduling with the specified probability at runtime.
- **`MockAudioContext`** (`audio-context.ts`): deterministic in-process stub of the Web Audio API used across all runtime unit tests; models nodes, params, and scheduling calls without a browser.

## [2.0.0-alpha.1] — 2026-04-26

### Added
- **Semantic resolution pass** (`resolve.ts`): symbol table construction, cycle detection, effect/envelope/annotation/instrument validation with did-you-mean suggestions.
- **Scale-degree lowering** (`lower-pitch.ts`): `^N` scale degrees resolved to absolute `AbsolutePitch` nodes against active `\key` directive; supports all seven modes.
- **Pitch arithmetic** (`lower-pitch.ts`): `c4+7`, `a4-3`, and chained forms resolved to absolute pitches.
- **Parameterized motif inlining** (`lower-pitch.ts`): `arp(root) = ...` definitions expanded at call sites with pitch-term substitution.
- **Sticky-octave / inherited-pitch-letter lowering** (`lower-sticky.ts`): octave and letter inheritance across consecutive notes.
- **Scope flattening** (`lower-effects.ts`): `with`, `envelope`, `tuplet`, and `ramp` wrapper nodes replaced with per-event metadata tags (`fxChain`, `envelope`, `durationScale`, `effectiveDynamic`).
- **Repeat expansion** (`expand-repeats.ts`): `repeat N { ... }` blocks unrolled into flat event sequences.
- **Meter validation** (`validate-meter.ts`): bar-line beat counting with `\time` awareness, producing warning diagnostics.
- **IR emission** (`ir/emit.ts`): lowers fully-resolved AST to `CompositionIR` (timeline events with Hz frequencies, gain, articulation, fx chain, envelope, annotations, and `slideTo`).
- **`compile()` public API** (`src/index.ts`): single-call entry point from source string to `CompositionIR`.
- **Did-you-mean diagnostics** (`did-you-mean.ts`): Levenshtein-based suggestions on unknown effects, envelopes, annotations, instruments, motifs, and modes.
- **Module import resolution** (`resolve.ts` + `module-loader.ts`): `\use "path"`, `\use "path" as alias`, and `\use "path" (a, b)` selective imports; `resolveWithImports()` async API.
- **Semantic pipeline** (`pipeline.ts`): orchestrates all passes in order and exposes `compilePipeline()`.

## [2.0.0-alpha.0] — 2026-04-26

### Added
- TypeScript implementation of the SynthJS v2 DSL frontend (lexer, parser, AST).
- Public `parse(source)` returning a typed `Composition` AST.
- Source spans on every AST node.
- Doc comments (`///`) attached to bindings, voices, and instrument definitions.
- Annotation tokens (`@section`, `@cue`, `@chance`, `@text`, `@vary`, `@swing`, `@midi_channel`, `@midi_program`).
- `\version` directive.
- Numeric durations (`1`, `2`, `4`, `8`, `16`, `32`, `64`, dotted, triplet).
- Five accidental forms (`#`, `##`, `b`, `bb`, `n`).
- Per-note microtuning (`+15c`, `-7c`).
- Multi-voice declarations (`voice name { ... }`).
- Custom instrument definitions (`instrument define name { ... }`).
- Module imports (`\use`).
- Scale-degree pitches (`^N`), pitch arithmetic (`c4+7`), parameterized motifs.
- Block-scoped effects (`with`), envelopes, tuplets, dynamics, articulation.
- LL(2) recursive-descent parser with precise error spans.

### Changed
- Package now ships ESM, CJS, and `.d.ts` bundles.
- Node 20+ required.
- Build moved from browserify to tsup; tests from mocha/chai to Vitest.
- Toolchain: TypeScript, Vitest, Biome, pnpm.

### Removed
- v1 audio runtime (Phase 3 will introduce a v2-aware runtime).
- jQuery demo page (rebuilt in a later phase).
- All v1 source archived under `legacy/`.

### Compatibility notes
v2 is a clean-slate redesign with no backwards compatibility. v1 is preserved at the `v1.2.11-legacy` git tag.

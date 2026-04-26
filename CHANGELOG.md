# Changelog

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

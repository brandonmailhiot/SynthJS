# Changelog

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

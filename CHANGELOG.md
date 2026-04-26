# Changelog

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

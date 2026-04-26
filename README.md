# SynthJS

> Warning: v2 in development. The audio runtime is being rebuilt. v1 is preserved at the `v1.2.11-legacy` git tag.

A web-native audio programming language for music composition.

## Status

- Checkmark Lexer, parser, AST (this phase)
- Hourglass Semantic analysis & IR (Phase 2)
- Hourglass Web Audio runtime (Phase 3)
- Hourglass Effects & instruments (Phase 4)
- Hourglass Tooling: LSP, formatter, MIDI export, hot reload (Phase 5)
- Hourglass CLI / offline render / demo (Phase 6)

## Documentation

- Language design: `2026-04-25-synthjs-v2-language-design.md`
- Phase 1 plan: `2026-04-26-synthjs-v2-redesign-phase-1-plan.md`

## Install (alpha)

```sh
pnpm add synth-javascript@next
```

## Use

```ts
import { parse } from "synth-javascript";

const ast = parse(`
  \\version "2.0"
  \\tempo 120
  4 c4 d4 e4 f4
`);

console.log(ast.body);
```

## Develop

```sh
pnpm install
pnpm test
pnpm build
```

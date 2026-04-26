import type { Composition } from "./ast/nodes.js";
import { lex } from "./lexer/lexer.js";
import { parse as parseTokens } from "./parser/parser.js";

export function parse(source: string): Composition {
  return parseTokens(lex(source));
}

// AST types
export type * from "./ast/nodes.js";
export { walk, type Visitor } from "./ast/visitor.js";

// Pitch
export {
  type Accidental,
  type NoteLetter,
  type PitchSpec,
  computeFrequency,
  parsePitchString,
} from "./pitch.js";

// Duration
export { isValidDurationDivisor, parseDuration } from "./duration.js";

// Modes
export { MODES, type Mode, isMode, modeIntervals } from "./modes.js";

// Errors
export {
  LexError,
  ParseError,
  ResolveError,
  type Severity,
  type SourceSpan,
  type SynthError,
  ValidationError,
  formatError,
} from "./errors.js";

// Compile API
import { type CompileOptions, compile, compileSync } from "./semantic/pipeline.js";
export { compile, compileSync, type CompileOptions };
export type {
  CompositionIR,
  VoiceTimeline,
  TimelineEvent,
  EnvelopeSpec,
  EffectInvocation,
  InstrumentSpec,
  AnnotationData,
  Diagnostic,
} from "./ir/nodes.js";

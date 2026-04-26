import type { Composition as CompositionAST } from "./ast/nodes.js";
import { lex } from "./lexer/lexer.js";
import { parse as parseTokens } from "./parser/parser.js";

export function parse(source: string): CompositionAST {
  return parseTokens(lex(source));
}

// AST types
export type {
  Composition as CompositionAST,
  TopLevel,
  UseDecl,
  Directive,
  TempoDirective,
  TimeDirective,
  KeyDirective,
  InstrumentDirective,
  DetuneDirective,
  VersionDirective,
  Binding,
  VoiceDecl,
  InstrumentDef,
  InstrumentField,
  Expr,
  Block,
  EventList,
  Event,
  NoteEvent,
  ChordEvent,
  SlideEvent,
  RestEvent,
  SustainEvent,
  TieEvent,
  DynamicMarker,
  RampExpr,
  RepeatExpr,
  WithExpr,
  EnvelopeExpr,
  TupletExpr,
  BarMarker,
  MotifRef,
  CallExpr,
  AnnotatedEvent,
  AnnotatedBlock,
  PitchTerm,
  AbsolutePitch,
  ScaleDegree,
  PitchArith,
  ParamRef,
  InheritedPitchLetter,
  DurationToken,
  ArticulationKind,
  ArticulationMark,
  Annotation,
  Call,
  Arg,
  NumberArg,
  StringArg,
  PitchArg,
  IdentArg,
  NamedArg,
} from "./ast/nodes.js";
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

// Stdlib
export { isStdlibPath, getStdlibSource, STDLIB } from "./stdlib/index.js";

// Tools
export { exportJson, type JsonExportOptions } from "./tools/export-json.js";
export { exportMidi } from "./tools/export-midi.js";
export { generateDocs, type GenDocsOptions } from "./tools/gen-docs.js";
export { format } from "./tools/format.js";

// Runtime API
export {
  Composition,
  type CompositionOptions,
  type CompositionState,
} from "./runtime/composition.js";
export type { AudioContextLike, AudioNodeLike, AudioParamLike } from "./runtime/audio-context.js";
export { MockAudioContext } from "./runtime/mock-audio-context.js"; // useful for users writing tests

// WAV offline render
export {
  audioBufferToWav,
  renderToWav,
  type OfflineAudioContextLike,
  type RenderOptions,
} from "./tools/render-wav.js";

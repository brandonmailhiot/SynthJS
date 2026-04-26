import type { SourceSpan } from "../errors.js";
import type { Mode } from "../modes.js";
import type { Accidental, NoteLetter } from "../pitch.js";

// ----- Top level -----

export type Composition = {
  kind: "Composition";
  version?: string;
  body: TopLevel[];
  span: SourceSpan;
};

export type TopLevel = UseDecl | Directive | Binding | VoiceDecl | InstrumentDef | Event;

// ----- Use -----

export type UseDecl = {
  kind: "UseDecl";
  path: string;
  alias?: string;
  selected?: string[];
  span: SourceSpan;
};

// ----- Directives -----

export type Directive =
  | TempoDirective
  | TimeDirective
  | KeyDirective
  | InstrumentDirective
  | DetuneDirective
  | VersionDirective;

export type TempoDirective = { kind: "Tempo"; value: number; span: SourceSpan };
export type TimeDirective = {
  kind: "Time";
  numerator: number;
  denominator: number;
  span: SourceSpan;
};
export type KeyDirective = { kind: "Key"; tonic: AbsolutePitch; mode: Mode; span: SourceSpan };
export type InstrumentDirective = { kind: "Instrument"; name: string; span: SourceSpan };
export type DetuneDirective = { kind: "Detune"; cents: number; span: SourceSpan };
export type VersionDirective = { kind: "Version"; version: string; span: SourceSpan };

// ----- Bindings / voices / instruments -----

export type Binding = {
  kind: "Binding";
  doc?: string;
  name: string;
  params?: string[];
  body: Expr;
  span: SourceSpan;
};

export type VoiceDecl = {
  kind: "VoiceDecl";
  doc?: string;
  annotations: Annotation[];
  name: string;
  body: Block;
  span: SourceSpan;
};

export type InstrumentDef = {
  kind: "InstrumentDef";
  doc?: string;
  name: string;
  fields: InstrumentField[];
  span: SourceSpan;
};

export type InstrumentField =
  | {
      kind: "Oscillator";
      value: string;
      detune?: number;
      envelope?: Call;
      span: SourceSpan;
    }
  | { kind: "EnvelopeField"; call: Call; span: SourceSpan }
  | { kind: "FilterField"; call: Call; span: SourceSpan }
  | { kind: "DetuneField"; cents: number; span: SourceSpan }
  | { kind: "PitchSweepField"; semitones: number; duration: number; span: SourceSpan };

// ----- Expressions -----

export type Expr = Block | EventList;

export type Block = {
  kind: "Block";
  body: TopLevel[];
  span: SourceSpan;
};

export type EventList = {
  kind: "EventList";
  events: Event[];
  span: SourceSpan;
};

// ----- Events -----

export type Event =
  | NoteEvent
  | ChordEvent
  | SlideEvent
  | RestEvent
  | SustainEvent
  | TieEvent
  | DynamicMarker
  | RampExpr
  | RepeatExpr
  | WithExpr
  | EnvelopeExpr
  | TupletExpr
  | BarMarker
  | MotifRef
  | CallExpr
  | AnnotatedEvent
  | AnnotatedBlock;

export type NoteEvent = {
  kind: "Note";
  duration?: DurationToken;
  pitch: PitchTerm;
  modifiers: ArticulationMark[];
  annotations: Annotation[];
  repeat?: number;
  span: SourceSpan;
  effectiveDynamic?: number; // gain 0..1, set by sticky lowering
  effectiveInstrument?: string; // instrument name, set by sticky lowering
  fxChain?: Call[]; // effects applied to this event, set by lowerEffects
  envelope?: Call; // envelope applied to this event, set by lowerEffects
  durationScale?: number; // multiplicative duration scale (default 1.0), set by lowerEffects
};

export type ChordEvent = {
  kind: "Chord";
  duration?: DurationToken;
  pitches: PitchTerm[];
  modifiers: ArticulationMark[];
  annotations: Annotation[];
  repeat?: number;
  span: SourceSpan;
  effectiveDynamic?: number; // gain 0..1, set by sticky lowering
  effectiveInstrument?: string; // instrument name, set by sticky lowering
  fxChain?: Call[]; // effects applied to this event, set by lowerEffects
  envelope?: Call; // envelope applied to this event, set by lowerEffects
  durationScale?: number; // multiplicative duration scale (default 1.0), set by lowerEffects
};

export type SlideEvent = {
  kind: "Slide";
  source: NoteEvent;
  destination: NoteEvent;
  span: SourceSpan;
  fxChain?: Call[]; // effects applied to source and destination, set by lowerEffects
  envelope?: Call; // envelope applied to source and destination, set by lowerEffects
  durationScale?: number; // multiplicative duration scale, set by lowerEffects
};

export type RestEvent = {
  kind: "Rest";
  duration?: DurationToken;
  modifiers: ArticulationMark[];
  annotations: Annotation[];
  span: SourceSpan;
  effectiveDynamic?: number; // gain 0..1, set by sticky lowering
  effectiveInstrument?: string; // instrument name, set by sticky lowering
  fxChain?: Call[]; // effects applied to this event, set by lowerEffects
  envelope?: Call; // envelope applied to this event, set by lowerEffects
  durationScale?: number; // multiplicative duration scale (default 1.0), set by lowerEffects
};

export type SustainEvent = { kind: "Sustain"; pitch: PitchTerm; span: SourceSpan };
export type TieEvent = { kind: "Tie"; left: NoteEvent; right: NoteEvent; span: SourceSpan };

export type DynamicMarker = { kind: "Dynamic"; value: string; span: SourceSpan };

export type RampExpr = { kind: "Ramp"; from: string; to: string; body: Block; span: SourceSpan };
export type RepeatExpr = { kind: "Repeat"; count: number; body: Block; span: SourceSpan };
export type WithExpr = { kind: "With"; effects: Call[]; body: Block; span: SourceSpan };
export type EnvelopeExpr = { kind: "Envelope"; call: Call; body: Block; span: SourceSpan };
export type TupletExpr = { kind: "Tuplet"; n: number; m?: number; body: Block; span: SourceSpan };
export type BarMarker = { kind: "Bar"; double: boolean; span: SourceSpan };
export type MotifRef = { kind: "MotifRef"; name: string; span: SourceSpan };
export type CallExpr = { kind: "Call"; name: string; args: Arg[]; span: SourceSpan };

export type AnnotatedEvent = {
  kind: "Annotated";
  annotations: Annotation[];
  target: Event;
  span: SourceSpan;
};

export type AnnotatedBlock = {
  kind: "AnnotatedBlock";
  annotations: Annotation[];
  target: Block;
  span: SourceSpan;
};

// ----- Pitch terms -----

export type PitchTerm = AbsolutePitch | ScaleDegree | PitchArith | ParamRef | InheritedPitchLetter;

export type AbsolutePitch = {
  kind: "Pitch";
  letter: NoteLetter;
  accidental: Accidental | null;
  octave: number;
  cents: number;
  span: SourceSpan;
};

export type ScaleDegree = {
  kind: "ScaleDegree";
  degree: number;
  accidental?: Accidental;
  span: SourceSpan;
};

export type PitchArith = {
  kind: "PitchArith";
  base: PitchTerm;
  semitones: number;
  span: SourceSpan;
};

export type ParamRef = {
  kind: "ParamRef";
  name: string;
  span: SourceSpan;
};

export type InheritedPitchLetter = {
  kind: "InheritedPitchLetter";
  letter: NoteLetter;
  accidental?: Accidental;
  span: SourceSpan;
};

// ----- Duration -----

export type DurationToken = {
  divisor: number;
  dots: number;
  triplet: boolean;
  raw: string;
  span: SourceSpan;
};

// ----- Articulation -----

export type ArticulationKind = "." | "_" | ">" | "^";
export type ArticulationMark = {
  kind: "Articulation";
  mark: ArticulationKind;
  span: SourceSpan;
};

// ----- Annotation -----

export type Annotation = {
  kind: "Annotation";
  name: string;
  args: Arg[];
  span: SourceSpan;
};

// ----- Call / args -----

export type Call = {
  kind: "Call";
  name: string;
  args: Arg[];
  span: SourceSpan;
};

export type Arg = NumberArg | StringArg | PitchArg | IdentArg | NamedArg;
export type NumberArg = { kind: "NumberArg"; value: number; span: SourceSpan };
export type StringArg = { kind: "StringArg"; value: string; span: SourceSpan };
export type PitchArg = { kind: "PitchArg"; value: PitchTerm; span: SourceSpan };
export type IdentArg = { kind: "IdentArg"; name: string; span: SourceSpan };
export type NamedArg = { kind: "NamedArg"; name: string; value: Arg; span: SourceSpan };

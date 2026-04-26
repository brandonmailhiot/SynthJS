import type { SourceSpan } from "../errors.js";

export type CompositionIR = {
  tempo: number; // BPM, default 60
  timeSig: { numerator: number; denominator: number }; // default 4/4
  voices: VoiceTimeline[];
  diagnostics: Diagnostic[]; // warnings (e.g., bar mismatches)
};

export type VoiceTimeline = {
  name: string;
  events: TimelineEvent[];
};

export type TimelineEvent = {
  startBeat: number; // offset from voice start, in whole-note fractions
  durationBeats: number; // duration after durationScale
  frequencies: number[]; // Hz; chord = multiple, single = one, rest = []
  gain: number; // 0..1, from effectiveDynamic
  articulation: ArticulationKind[];
  envelope?: EnvelopeSpec; // defaults to standard adsr if omitted
  fxChain: EffectInvocation[]; // empty if no fx
  instrument: InstrumentSpec;
  annotations: AnnotationData[];
  slideTo?: number[]; // target frequencies if this event slides
  span: SourceSpan;
};

export type ArticulationKind = "." | "_" | ">" | "^";

export type EnvelopeSpec = {
  kind: "adsr" | "linear" | "percussive";
  args: number[]; // [attack, decay, sustain, release] for adsr; etc.
};

export type EffectInvocation = {
  name: string;
  args: { positional: (number | string)[]; named?: Record<string, number | string> };
};

export type OscillatorKind = "sine" | "square" | "sawtooth" | "triangle" | "noise" | "sample";

export type OscillatorLayer = {
  kind: OscillatorKind;
  detune?: number; // per-layer detune in cents (additive with InstrumentSpec.detune)
  envelope?: EnvelopeSpec; // per-layer gain envelope (1.0-peak; multiplied with master)
  // Sample-specific (kind === "sample" only):
  samplePath?: string; // URL or path to the audio file
  rootHz?: number; // recorded pitch in Hz; playbackRate = freq/rootHz
};

export type FilterSpec = { type: string; cutoff: number; q: number };

export type PitchSweep = {
  // Semitones offset above the note's nominal pitch at the start of the sweep.
  // Positive = start sharp, sweep down to nominal (kick boom).
  // Negative = start flat, sweep up to nominal (rising effect).
  semitones: number;
  // Duration of the sweep in seconds.
  duration: number;
};

export type InstrumentSpec = {
  name: string; // primitive or custom name
  oscillators: OscillatorLayer[]; // length >= 1; single primitive = length-1 array
  envelope?: EnvelopeSpec; // from custom instrument body
  filters: FilterSpec[]; // length 0+; chained source -> f1 -> f2 -> ... -> output
  detune?: number; // instrument-level cents (applied to every layer)
  pitchSweep?: PitchSweep; // optional pitch envelope; applies to all tonal layers
  gain?: number; // post-compensation amplitude multiplier; default 1.0
};

export type AnnotationData = {
  name: string;
  args: (number | string)[];
};

export type Diagnostic = {
  message: string;
  severity: "error" | "warning";
  span: SourceSpan;
};

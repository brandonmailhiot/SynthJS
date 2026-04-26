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

export type InstrumentSpec = {
  name: string; // primitive or custom name
  oscillator: "sine" | "square" | "sawtooth" | "triangle";
  envelope?: EnvelopeSpec; // from custom instrument body
  filter?: { type: string; cutoff: number; q: number };
  detune?: number; // cents
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

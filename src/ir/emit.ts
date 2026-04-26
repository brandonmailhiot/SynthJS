import type {
  AbsolutePitch,
  Annotation,
  Arg,
  Call,
  ChordEvent,
  Composition,
  DurationToken,
  Event,
  InstrumentDef,
  NoteEvent,
  RestEvent,
  SlideEvent,
  TopLevel,
} from "../ast/nodes.js";
import type { ValidationError } from "../errors.js";
import { computeFrequency } from "../pitch.js";
import type { SymbolTable } from "../semantic/symbol-table.js";
import type {
  AnnotationData,
  ArticulationKind,
  CompositionIR,
  Diagnostic,
  EffectInvocation,
  EnvelopeSpec,
  InstrumentSpec,
  TimelineEvent,
  VoiceTimeline,
} from "./nodes.js";

// ---- Duration helpers ----

function durationToFraction(d: DurationToken): number {
  let v = 1 / d.divisor;
  let inc = v / 2;
  for (let i = 0; i < d.dots; i++) {
    v += inc;
    inc /= 2;
  }
  if (d.triplet) v *= 2 / 3;
  return v;
}

// ---- Arg conversion helpers ----

function argToScalar(arg: Arg): number | string | null {
  switch (arg.kind) {
    case "NumberArg":
      return arg.value;
    case "StringArg":
      return arg.value;
    case "IdentArg":
      return arg.name;
    default:
      return null;
  }
}

function callToEffectInvocation(call: Call): EffectInvocation {
  const positional: (number | string)[] = [];
  const named: Record<string, number | string> = {};
  let hasNamed = false;

  for (const arg of call.args) {
    if (arg.kind === "NamedArg") {
      const v = argToScalar(arg.value);
      if (v !== null) {
        named[arg.name] = v;
        hasNamed = true;
      }
    } else {
      const v = argToScalar(arg);
      if (v !== null) positional.push(v);
    }
  }

  return {
    name: call.name,
    args: hasNamed ? { positional, named } : { positional },
  };
}

function callToEnvelopeSpec(call: Call): EnvelopeSpec {
  const kind = call.name as EnvelopeSpec["kind"];
  const args: number[] = [];
  for (const arg of call.args) {
    if (arg.kind === "NumberArg") args.push(arg.value);
    else if (arg.kind === "NamedArg" && arg.value.kind === "NumberArg") args.push(arg.value.value);
  }
  return { kind, args };
}

function annotationToData(ann: Annotation): AnnotationData {
  const args: (number | string)[] = [];
  for (const arg of ann.args) {
    const v = argToScalar(arg);
    if (v !== null) args.push(v);
  }
  return { name: ann.name, args };
}

// ---- Frequency computation ----

function pitchToFreq(pitch: AbsolutePitch): number {
  return computeFrequency({
    letter: pitch.letter,
    accidental: pitch.accidental,
    octave: pitch.octave,
    cents: pitch.cents,
  });
}

// ---- Instrument resolution ----

const DEFAULT_OSCILLATOR = "sine" as const;

function primitiveInstrument(name: string): InstrumentSpec {
  const osc = (["sine", "square", "sawtooth", "triangle"] as const).includes(
    name as "sine" | "square" | "sawtooth" | "triangle",
  )
    ? (name as InstrumentSpec["oscillator"])
    : DEFAULT_OSCILLATOR;
  return { name, oscillator: osc };
}

function expandInstrumentDef(def: InstrumentDef): InstrumentSpec {
  let oscillator: InstrumentSpec["oscillator"] = DEFAULT_OSCILLATOR;
  let envelope: EnvelopeSpec | undefined;
  let filter: InstrumentSpec["filter"];
  let detune: number | undefined;

  for (const field of def.fields) {
    switch (field.kind) {
      case "Oscillator":
        oscillator = field.value as InstrumentSpec["oscillator"];
        break;
      case "EnvelopeField":
        envelope = callToEnvelopeSpec(field.call);
        break;
      case "FilterField": {
        const args: number[] = [];
        for (const arg of field.call.args) {
          if (arg.kind === "NumberArg") args.push(arg.value);
        }
        filter = {
          type: field.call.name,
          cutoff: args[0] ?? 1000,
          q: args[1] ?? 1,
        };
        break;
      }
      case "DetuneField":
        detune = field.cents;
        break;
    }
  }

  const spec: InstrumentSpec = { name: def.name, oscillator };
  if (envelope !== undefined) spec.envelope = envelope;
  if (filter !== undefined) spec.filter = filter;
  if (detune !== undefined) spec.detune = detune;
  return spec;
}

function resolveInstrument(name: string, symbolTable: SymbolTable): InstrumentSpec {
  const primitives = new Set(["sine", "square", "sawtooth", "triangle"]);
  if (primitives.has(name)) return primitiveInstrument(name);

  const entry = symbolTable.lookup(name);
  if (entry?.kind === "InstrumentDef") {
    return expandInstrumentDef(entry);
  }

  // Fallback: treat as primitive-named instrument
  return primitiveInstrument(name);
}

// ---- Voice event collector ----

type VoiceEvents = {
  name: string;
  events: TimelineEvent[];
};

class VoiceEmitter {
  currentBeat = 0;
  events: TimelineEvent[] = [];

  private symbolTable: SymbolTable;
  private voiceAnnotations: AnnotationData[];

  constructor(symbolTable: SymbolTable, voiceAnnotations: AnnotationData[] = []) {
    this.symbolTable = symbolTable;
    this.voiceAnnotations = voiceAnnotations;
  }

  emitTopLevelList(body: TopLevel[]): void {
    for (const node of body) {
      this.emitTopLevel(node);
    }
  }

  private emitTopLevel(node: TopLevel): void {
    if (isAudibleEvent(node)) {
      this.emitEvent(node as Event);
    }
    // Non-audible top-level nodes (directives, bar markers, voice decls inside voice) are skipped
  }

  private emitEvent(event: Event): void {
    switch (event.kind) {
      case "Note":
        this.emitNote(event);
        break;
      case "Chord":
        this.emitChord(event);
        break;
      case "Rest":
        this.emitRest(event);
        break;
      case "Slide":
        this.emitSlide(event);
        break;
      // Bar markers, Dynamic markers, Directive events: skip
      case "Bar":
      case "Dynamic":
        break;
      // Annotated events: forward to target
      case "Annotated":
        this.emitEvent(event.target);
        break;
      case "AnnotatedBlock":
        for (const node of event.target.body) {
          this.emitTopLevel(node);
        }
        break;
      default:
        break;
    }
  }

  private buildBaseEvent(
    duration: DurationToken | undefined,
    durationScale: number | undefined,
    effectiveDynamic: number | undefined,
    effectiveInstrument: string | undefined,
    fxChain: Call[] | undefined,
    envelope: Call | undefined,
    articulation: ArticulationKind[],
    annotations: AnnotationData[],
    frequencies: number[],
    span: TimelineEvent["span"],
    slideTo?: number[],
  ): TimelineEvent {
    const fraction = duration ? durationToFraction(duration) : 0.25; // default quarter note
    const scale = durationScale ?? 1.0;
    const durationBeats = fraction * scale;

    const gain = effectiveDynamic ?? 0.65;
    const instrName = effectiveInstrument ?? "sine";
    const instrument = resolveInstrument(instrName, this.symbolTable);

    const fxInvocations: EffectInvocation[] = fxChain ? fxChain.map(callToEffectInvocation) : [];

    const envelopeSpec: EnvelopeSpec | undefined = envelope
      ? callToEnvelopeSpec(envelope)
      : undefined;

    const allAnnotations = [...this.voiceAnnotations, ...annotations];

    const ev: TimelineEvent = {
      startBeat: this.currentBeat,
      durationBeats,
      frequencies,
      gain,
      articulation,
      fxChain: fxInvocations,
      instrument,
      annotations: allAnnotations,
      span,
    };
    if (envelopeSpec !== undefined) ev.envelope = envelopeSpec;
    if (slideTo !== undefined) ev.slideTo = slideTo;
    return ev;
  }

  private emitNote(note: NoteEvent): void {
    const freq = note.pitch.kind === "Pitch" ? [pitchToFreq(note.pitch)] : [];

    const articulation: ArticulationKind[] = note.modifiers.map((m) => m.mark);
    const annotations: AnnotationData[] = note.annotations.map(annotationToData);

    const ev = this.buildBaseEvent(
      note.duration,
      note.durationScale,
      note.effectiveDynamic,
      note.effectiveInstrument,
      note.fxChain,
      note.envelope,
      articulation,
      annotations,
      freq,
      note.span,
    );

    this.events.push(ev);
    this.currentBeat += ev.durationBeats;
  }

  private emitChord(chord: ChordEvent): void {
    const frequencies: number[] = chord.pitches
      .filter((p) => p.kind === "Pitch")
      .map((p) => pitchToFreq(p as AbsolutePitch));

    const articulation: ArticulationKind[] = chord.modifiers.map((m) => m.mark);
    const annotations: AnnotationData[] = chord.annotations.map(annotationToData);

    const ev = this.buildBaseEvent(
      chord.duration,
      chord.durationScale,
      chord.effectiveDynamic,
      chord.effectiveInstrument,
      chord.fxChain,
      chord.envelope,
      articulation,
      annotations,
      frequencies,
      chord.span,
    );

    this.events.push(ev);
    this.currentBeat += ev.durationBeats;
  }

  private emitRest(rest: RestEvent): void {
    const articulation: ArticulationKind[] = rest.modifiers.map((m) => m.mark);
    const annotations: AnnotationData[] = rest.annotations.map(annotationToData);

    const ev = this.buildBaseEvent(
      rest.duration,
      rest.durationScale,
      rest.effectiveDynamic,
      rest.effectiveInstrument,
      rest.fxChain,
      rest.envelope,
      articulation,
      annotations,
      [], // rest has no frequencies
      rest.span,
    );

    this.events.push(ev);
    this.currentBeat += ev.durationBeats;
  }

  private emitSlide(slide: SlideEvent): void {
    const src = slide.source;
    const dst = slide.destination;

    // Compute destination frequency for slideTo
    const destFreqs: number[] = dst.pitch.kind === "Pitch" ? [pitchToFreq(dst.pitch)] : [];

    const srcFreqs: number[] = src.pitch.kind === "Pitch" ? [pitchToFreq(src.pitch)] : [];

    const articulation: ArticulationKind[] = src.modifiers.map((m) => m.mark);
    const annotations: AnnotationData[] = src.annotations.map(annotationToData);

    const ev = this.buildBaseEvent(
      src.duration,
      src.durationScale ?? slide.durationScale,
      src.effectiveDynamic,
      src.effectiveInstrument,
      src.fxChain ?? slide.fxChain,
      src.envelope ?? slide.envelope,
      articulation,
      annotations,
      srcFreqs,
      slide.span,
      destFreqs.length > 0 ? destFreqs : undefined,
    );

    this.events.push(ev);
    this.currentBeat += ev.durationBeats;

    // If destination has a non-zero duration, emit it as a separate event
    if (dst.duration) {
      const dstFraction = durationToFraction(dst.duration);
      const dstScale = dst.durationScale ?? slide.durationScale ?? 1.0;
      if (dstFraction * dstScale > 0) {
        const dstArticulation: ArticulationKind[] = dst.modifiers.map((m) => m.mark);
        const dstAnnotations: AnnotationData[] = dst.annotations.map(annotationToData);

        const dstEv = this.buildBaseEvent(
          dst.duration,
          dst.durationScale ?? slide.durationScale,
          dst.effectiveDynamic,
          dst.effectiveInstrument,
          dst.fxChain ?? slide.fxChain,
          dst.envelope ?? slide.envelope,
          dstArticulation,
          dstAnnotations,
          destFreqs,
          dst.span,
        );

        this.events.push(dstEv);
        this.currentBeat += dstEv.durationBeats;
      }
    }
  }
}

// ---- Type guard for audible events ----

function isAudibleEvent(node: TopLevel): boolean {
  return (
    node.kind === "Note" ||
    node.kind === "Chord" ||
    node.kind === "Slide" ||
    node.kind === "Rest" ||
    node.kind === "Bar" ||
    node.kind === "Dynamic" ||
    node.kind === "Annotated" ||
    node.kind === "AnnotatedBlock"
  );
}

// ---- Public API ----

export function emitIR(
  ast: Composition,
  symbolTable: SymbolTable,
  warnings: ValidationError[],
): CompositionIR {
  // 1. Extract tempo and time signature from file-scope directives
  let tempo = 60;
  let timeSig = { numerator: 4, denominator: 4 };

  for (const node of ast.body) {
    if (node.kind === "Tempo") {
      tempo = node.value;
    } else if (node.kind === "Time") {
      timeSig = { numerator: node.numerator, denominator: node.denominator };
    }
  }

  // 2. Separate voice declarations from top-level events
  const voiceDecls = ast.body.filter((n) => n.kind === "VoiceDecl");
  const topLevelEvents = ast.body.filter((n) => isAudibleEvent(n));

  const voiceTimelines: VoiceTimeline[] = [];

  // 3. If there are top-level events outside voices, emit as implicit "main" voice
  if (topLevelEvents.length > 0) {
    const emitter = new VoiceEmitter(symbolTable);
    emitter.emitTopLevelList(topLevelEvents as TopLevel[]);
    voiceTimelines.push({ name: "main", events: emitter.events });
  }

  // 4. Emit each voice declaration
  for (const node of voiceDecls) {
    if (node.kind !== "VoiceDecl") continue;

    const voiceAnnotations: AnnotationData[] = node.annotations.map(annotationToData);
    const emitter = new VoiceEmitter(symbolTable, voiceAnnotations);
    emitter.emitTopLevelList(node.body.body);
    voiceTimelines.push({ name: node.name, events: emitter.events });
  }

  // 5. Convert warnings to diagnostics
  const diagnostics: Diagnostic[] = warnings.map((w) => ({
    message: w.message,
    severity: w.severity,
    span: w.span,
  }));

  return {
    tempo,
    timeSig,
    voices: voiceTimelines,
    diagnostics,
  };
}

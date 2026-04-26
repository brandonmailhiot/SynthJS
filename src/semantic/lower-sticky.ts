import type {
  AbsolutePitch,
  Block,
  ChordEvent,
  Composition,
  DurationToken,
  Event,
  InheritedPitchLetter,
  NoteEvent,
  PitchTerm,
  RestEvent,
  TopLevel,
} from "../ast/nodes.js";
import { ValidationError } from "../errors.js";

// ---- Dynamic mapping ----

const DYNAMIC_GAIN: Record<string, number> = {
  "\\pp": 0.2,
  "\\p": 0.35,
  "\\mp": 0.5,
  "\\mf": 0.65,
  "\\f": 0.8,
  "\\ff": 1.0,
  "\\fff": 1.0,
};

const DEFAULT_DYNAMIC = 0.65; // \mf
const DEFAULT_INSTRUMENT = "sine";

// ---- Sticky state ----

type StickyState = {
  lastDuration: DurationToken | undefined;
  lastOctave: number | undefined;
  lastDynamic: number;
  lastInstrument: string;
};

function cloneState(s: StickyState): StickyState {
  return { ...s };
}

// ---- Public API ----

export type LowerStickyResult = {
  ast: Composition;
  warnings: ValidationError[];
};

export function lowerSticky(ast: Composition): LowerStickyResult {
  const warnings: ValidationError[] = [];
  const initialState: StickyState = {
    lastDuration: undefined,
    lastOctave: undefined,
    lastDynamic: DEFAULT_DYNAMIC,
    lastInstrument: DEFAULT_INSTRUMENT,
  };

  const state = cloneState(initialState);
  lowerTopLevelList(ast.body, state, warnings);

  return { ast, warnings };
}

// ---- Walker ----

function lowerTopLevelList(
  body: TopLevel[],
  state: StickyState,
  warnings: ValidationError[],
): void {
  for (const node of body) {
    lowerTopLevel(node, state, warnings);
  }
}

function lowerTopLevel(node: TopLevel, state: StickyState, warnings: ValidationError[]): void {
  switch (node.kind) {
    case "VoiceDecl": {
      // Each voice inherits parent state but tracks changes independently
      const voiceState = cloneState(state);
      lowerTopLevelList(node.body.body, voiceState, warnings);
      break;
    }
    case "Binding":
      // Bindings contain Expr (Block | EventList) — lower in-place
      if (node.body.kind === "Block") {
        const saved = cloneState(state);
        lowerTopLevelList(node.body.body, state, warnings);
        // restore after block scope
        Object.assign(state, saved);
      } else {
        for (const ev of node.body.events) {
          lowerEvent(ev, state, warnings);
        }
      }
      break;
    case "Instrument":
      state.lastInstrument = node.name;
      break;
    default:
      if (isEvent(node)) {
        lowerEvent(node as Event, state, warnings);
      }
      break;
  }
}

function lowerBlock(block: Block, parentState: StickyState, warnings: ValidationError[]): void {
  // Block introduces a new scope: inherit parent values, restore on exit
  const saved = cloneState(parentState);
  lowerTopLevelList(block.body, parentState, warnings);
  // restore parent state (sticky changes inside block don't leak out)
  Object.assign(parentState, saved);
}

function lowerEvent(event: Event, state: StickyState, warnings: ValidationError[]): void {
  switch (event.kind) {
    case "Note":
      lowerNote(event, state);
      break;
    case "Chord":
      lowerChord(event, state);
      break;
    case "Rest":
      lowerRest(event, state);
      break;
    case "Slide":
      lowerNote(event.source, state);
      // Destination: if no explicit duration, inherit from source (already resolved)
      if (event.destination.duration === undefined) {
        const srcDur = event.source.duration;
        if (srcDur !== undefined) {
          event.destination.duration = srcDur;
        }
      }
      lowerNote(event.destination, state);
      break;
    case "Dynamic": {
      const gain = DYNAMIC_GAIN[event.value];
      if (gain !== undefined) state.lastDynamic = gain;
      break;
    }
    case "Repeat":
      lowerBlock(event.body, state, warnings);
      break;
    case "With":
      lowerBlock(event.body, state, warnings);
      break;
    case "Envelope":
      lowerBlock(event.body, state, warnings);
      break;
    case "Tuplet":
      lowerBlock(event.body, state, warnings);
      break;
    case "Ramp":
      lowerBlock(event.body, state, warnings);
      break;
    case "Annotated":
      lowerEvent(event.target, state, warnings);
      break;
    case "AnnotatedBlock":
      lowerBlock(event.target, state, warnings);
      break;
    // Sustain, Tie, Bar, MotifRef, Call — no sticky changes
    default:
      break;
  }
}

// ---- Per-event lowering ----

function lowerNote(note: NoteEvent, state: StickyState): void {
  // Duration
  if (note.duration === undefined) {
    if (state.lastDuration === undefined) {
      throw new ValidationError("first event in block has no duration", note.span);
    }
    note.duration = state.lastDuration;
  } else {
    state.lastDuration = note.duration;
  }

  // Pitch
  note.pitch = resolvePitch(note.pitch, state, note.span);

  // Sticky tags
  note.effectiveDynamic = state.lastDynamic;
  note.effectiveInstrument = state.lastInstrument;
}

function lowerChord(chord: ChordEvent, state: StickyState): void {
  // Duration
  if (chord.duration === undefined) {
    if (state.lastDuration === undefined) {
      throw new ValidationError("first event in block has no duration", chord.span);
    }
    chord.duration = state.lastDuration;
  } else {
    state.lastDuration = chord.duration;
  }

  // Pitches: first absolute pitch sets sticky octave, rest inherit within chord
  chord.pitches = chord.pitches.map((p) => resolvePitch(p, state, chord.span));

  // Sticky tags
  chord.effectiveDynamic = state.lastDynamic;
  chord.effectiveInstrument = state.lastInstrument;
}

function lowerRest(rest: RestEvent, state: StickyState): void {
  // Duration
  if (rest.duration === undefined) {
    if (state.lastDuration === undefined) {
      throw new ValidationError("first event in block has no duration", rest.span);
    }
    rest.duration = state.lastDuration;
  } else {
    state.lastDuration = rest.duration;
  }

  // Sticky tags
  rest.effectiveDynamic = state.lastDynamic;
  rest.effectiveInstrument = state.lastInstrument;
}

// ---- Pitch resolution ----

function resolvePitch(
  pitch: PitchTerm,
  state: StickyState,
  errorSpan: AbsolutePitch["span"],
): PitchTerm {
  if (pitch.kind === "Pitch") {
    // Absolute pitch: update sticky octave
    state.lastOctave = pitch.octave;
    return pitch;
  }

  if (pitch.kind === "InheritedPitchLetter") {
    return resolveInheritedLetter(pitch, state);
  }

  if (pitch.kind === "PitchArith") {
    // Recurse into base
    pitch.base = resolvePitch(pitch.base, state, errorSpan);
    return pitch;
  }

  // ScaleDegree, ParamRef — pass through unchanged
  return pitch;
}

function resolveInheritedLetter(ipl: InheritedPitchLetter, state: StickyState): AbsolutePitch {
  if (state.lastOctave === undefined) {
    throw new ValidationError(
      `pitch letter '${ipl.letter}' used before any octave anchor`,
      ipl.span,
    );
  }

  return {
    kind: "Pitch",
    letter: ipl.letter,
    accidental: ipl.accidental ?? null,
    octave: state.lastOctave,
    cents: 0,
    span: ipl.span,
  };
}

// ---- Type guard ----

function isEvent(node: TopLevel): boolean {
  return (
    node.kind === "Note" ||
    node.kind === "Chord" ||
    node.kind === "Slide" ||
    node.kind === "Rest" ||
    node.kind === "Sustain" ||
    node.kind === "Tie" ||
    node.kind === "Dynamic" ||
    node.kind === "Ramp" ||
    node.kind === "Repeat" ||
    node.kind === "With" ||
    node.kind === "Envelope" ||
    node.kind === "Tuplet" ||
    node.kind === "Bar" ||
    node.kind === "MotifRef" ||
    node.kind === "Call" ||
    node.kind === "Annotated" ||
    node.kind === "AnnotatedBlock"
  );
}

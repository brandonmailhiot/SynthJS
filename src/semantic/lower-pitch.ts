import type {
  AbsolutePitch,
  Binding,
  Block,
  ChordEvent,
  Composition,
  Event,
  Expr,
  KeyDirective,
  NoteEvent,
  PitchArith,
  PitchTerm,
  ScaleDegree,
  SustainEvent,
  TopLevel,
} from "../ast/nodes.js";
import { ValidationError } from "../errors.js";
import type { Mode } from "../modes.js";
import { modeIntervals } from "../modes.js";
import type { Accidental, NoteLetter } from "../pitch.js";
import type { SymbolTable } from "./symbol-table.js";

// ---- Public API ----

export type LowerPitchResult = {
  ast: Composition;
};

export function lowerPitch(ast: Composition, symbols: SymbolTable): LowerPitchResult {
  const ctx = new LowerPitchContext(symbols);
  const newBody = ctx.lowerTopLevelList(ast.body, []);
  ast.body = newBody;
  return { ast };
}

// ---- MIDI helpers ----

// BASE_SEMITONE offsets (same as pitch.ts, not exported so we replicate)
const BASE_SEMITONE: Record<NoteLetter, number> = {
  c: -9,
  d: -7,
  e: -5,
  f: -4,
  g: -2,
  a: 0,
  b: 2,
};

const ACCIDENTAL_OFFSET: Record<Accidental, number> = {
  "##": 2,
  "#": 1,
  b: -1,
  bb: -2,
  n: 0,
};

function pitchToMidi(pitch: AbsolutePitch): number {
  const accOff = pitch.accidental === null ? 0 : ACCIDENTAL_OFFSET[pitch.accidental];
  return BASE_SEMITONE[pitch.letter] + accOff + (pitch.octave - 4) * 12 + 69;
}

// Chromatic scale from C: index 0 = C in that octave
const MIDI_TO_LETTER: [NoteLetter, Accidental | null][] = [
  ["c", null],
  ["c", "#"],
  ["d", null],
  ["d", "#"],
  ["e", null],
  ["f", null],
  ["f", "#"],
  ["g", null],
  ["g", "#"],
  ["a", null],
  ["a", "#"],
  ["b", null],
];

function midiToPitch(midi: number, span: AbsolutePitch["span"]): AbsolutePitch {
  // octave = floor(midi / 12) - 1  (C4 = 60: floor(60/12)-1 = 4)
  const octave = Math.floor(midi / 12) - 1;
  // semitone within octave, 0 = C
  const semInOct = ((midi % 12) + 12) % 12;
  const [letter, accidental] = MIDI_TO_LETTER[semInOct] ?? ["c", null];
  return { kind: "Pitch", letter, accidental, octave, cents: 0, span };
}

// ---- Scale-degree resolution ----

function resolveScaleDegree(sd: ScaleDegree, key: KeyDirective): AbsolutePitch {
  const tonicMidi = pitchToMidi(key.tonic);
  const intervals = modeIntervals(key.mode as Mode);
  const n = sd.degree;

  let midi: number;
  if (n > 0) {
    const idx = (n - 1) % 7;
    const octaveShift = Math.floor((n - 1) / 7);
    midi = tonicMidi + (intervals[idx] ?? 0) + octaveShift * 12;
  } else if (n < 0) {
    // For negative degrees: map -1 to the degree below tonic, etc.
    // -1 means the 7th degree one octave below
    const posN = -n; // positive value
    const idx = ((7 - ((posN - 1) % 7)) % 7) as number;
    const octaveShift = -Math.ceil(posN / 7);
    const intervalUp = intervals[idx] ?? 0;
    // When idx==0, the note is at the tonic pitch shifted down by octave
    const octAdjust = idx === 0 ? 0 : 0;
    midi = tonicMidi + intervalUp + (octaveShift + octAdjust) * 12;
  } else {
    // degree 0 is unusual — treat as tonic
    midi = tonicMidi;
  }

  // Apply accidental if present on scale degree
  if (sd.accidental !== undefined) {
    midi += ACCIDENTAL_OFFSET[sd.accidental];
  }

  return midiToPitch(midi, sd.span);
}

// ---- Pitch arithmetic resolution ----

function resolvePitchArith(
  pa: PitchArith,
  key: KeyDirective | null,
  params: Map<string, PitchTerm>,
): AbsolutePitch {
  const base = resolvePitchTerm(pa.base, key, params);
  const baseMidi = pitchToMidi(base);
  return midiToPitch(baseMidi + pa.semitones, pa.span);
}

// ---- PitchTerm resolution ----

function resolvePitchTerm(
  term: PitchTerm,
  key: KeyDirective | null,
  params: Map<string, PitchTerm>,
): AbsolutePitch {
  switch (term.kind) {
    case "Pitch":
      return term;
    case "ScaleDegree":
      if (key === null) {
        throw new ValidationError("scale degree used without \\key directive in scope", term.span);
      }
      return resolveScaleDegree(term, key);
    case "PitchArith":
      return resolvePitchArith(term, key, params);
    case "ParamRef": {
      const bound = params.get(term.name);
      if (bound === undefined) {
        throw new ValidationError(`unresolved parameter reference '${term.name}'`, term.span);
      }
      return resolvePitchTerm(bound, key, params);
    }
    case "InheritedPitchLetter":
      // Should have been resolved by lower-sticky already
      throw new ValidationError(
        `unresolved inherited pitch letter '${term.letter}' — run lower-sticky first`,
        term.span,
      );
  }
}

// ---- Deep clone helpers ----

function clonePitchTerm(term: PitchTerm): PitchTerm {
  return JSON.parse(JSON.stringify(term)) as PitchTerm;
}

function cloneExpr(expr: Expr): Expr {
  return JSON.parse(JSON.stringify(expr)) as Expr;
}

// ---- Parameterized motif inlining ----

function substituteParamRefs(term: PitchTerm, params: Map<string, PitchTerm>): PitchTerm {
  switch (term.kind) {
    case "Pitch":
      return term;
    case "ParamRef": {
      const bound = params.get(term.name);
      if (bound !== undefined) return clonePitchTerm(bound);
      return term;
    }
    case "PitchArith":
      return {
        kind: "PitchArith",
        base: substituteParamRefs(term.base, params),
        semitones: term.semitones,
        span: term.span,
      };
    case "ScaleDegree":
      return term;
    case "InheritedPitchLetter":
      return term;
  }
}

// ---- Helpers ----

function activeKey(keyStack: KeyDirective[]): KeyDirective | null {
  return keyStack.length > 0 ? (keyStack[keyStack.length - 1] ?? null) : null;
}

// ---- Main context ----

class LowerPitchContext {
  private symbols: SymbolTable;

  constructor(symbols: SymbolTable) {
    this.symbols = symbols;
  }

  lowerTopLevelList(body: TopLevel[], keyStack: KeyDirective[]): TopLevel[] {
    const result: TopLevel[] = [];
    for (const node of body) {
      const lowered = this.lowerTopLevel(node, keyStack);
      result.push(...lowered);
    }
    return result;
  }

  private lowerTopLevel(node: TopLevel, keyStack: KeyDirective[]): TopLevel[] {
    switch (node.kind) {
      case "Key": {
        // Push to key stack for subsequent items — update stack in place since
        // we process in order and top-level is a linear list
        keyStack.push(node);
        return [node];
      }
      case "VoiceDecl": {
        const childStack = [...keyStack];
        node.body.body = this.lowerTopLevelList(node.body.body, childStack);
        return [node];
      }
      case "Binding": {
        const isParameterized = node.params !== undefined && node.params.length > 0;
        if (!isParameterized) {
          // Non-parameterized: lower the body in place
          node.body = this.lowerExpr(node.body, keyStack, new Map());
          return [node];
        }
        // Parameterized bindings: the body template stays as-is, but the parser
        // may have embedded call sites at the end of the EventList body (when the
        // call appears immediately after the definition). Extract those call events
        // and inline them at the current top-level position.
        const result: TopLevel[] = [node];
        if (node.body.kind === "EventList") {
          const key = activeKey(keyStack);
          for (const ev of node.body.events) {
            if (ev.kind === "Call" && ev.name === node.name) {
              // This is an embedded call site — inline it here
              result.push(...this.inlineCall(ev, key, new Map(), keyStack));
            }
          }
        }
        return result;
      }
      default: {
        if (isEvent(node)) {
          const key = activeKey(keyStack);
          const inlined = this.lowerEvent(node as Event, key, new Map(), keyStack);
          return inlined;
        }
        return [node];
      }
    }
  }

  private lowerExpr(expr: Expr, keyStack: KeyDirective[], params: Map<string, PitchTerm>): Expr {
    if (expr.kind === "Block") {
      return {
        kind: "Block",
        body: this.lowerTopLevelList(expr.body, [...keyStack]),
        span: expr.span,
      };
    }
    // EventList
    const newEvents: Event[] = [];
    const key = activeKey(keyStack);
    for (const ev of expr.events) {
      newEvents.push(...this.lowerEvent(ev, key, params, keyStack));
    }
    return { kind: "EventList", events: newEvents, span: expr.span };
  }

  private lowerBlock(
    block: Block,
    key: KeyDirective | null,
    params: Map<string, PitchTerm>,
    keyStack: KeyDirective[],
  ): Block {
    const newBody: TopLevel[] = [];
    const childKeyStack = [...keyStack];
    for (const node of block.body) {
      if (node.kind === "Key") {
        childKeyStack.push(node);
        newBody.push(node);
      } else if (isEvent(node)) {
        const currentKey = activeKey(childKeyStack);
        newBody.push(...this.lowerEvent(node as Event, currentKey, params, childKeyStack));
      } else {
        newBody.push(node);
      }
    }
    return { kind: "Block", body: newBody, span: block.span };
  }

  private lowerEvent(
    event: Event,
    key: KeyDirective | null,
    params: Map<string, PitchTerm>,
    keyStack: KeyDirective[],
  ): Event[] {
    switch (event.kind) {
      case "Note":
        return [this.lowerNote(event, key, params)];
      case "Chord":
        return [this.lowerChord(event, key, params)];
      case "Sustain":
        return [this.lowerSustain(event, key, params)];
      case "Repeat":
        return [{ ...event, body: this.lowerBlock(event.body, key, params, keyStack) }];
      case "With":
        return [{ ...event, body: this.lowerBlock(event.body, key, params, keyStack) }];
      case "Envelope":
        return [{ ...event, body: this.lowerBlock(event.body, key, params, keyStack) }];
      case "Tuplet":
        return [{ ...event, body: this.lowerBlock(event.body, key, params, keyStack) }];
      case "Ramp":
        return [{ ...event, body: this.lowerBlock(event.body, key, params, keyStack) }];
      case "Annotated":
        return [
          {
            ...event,
            target: this.lowerEvent(event.target, key, params, keyStack)[0] ?? event.target,
          },
        ];
      case "AnnotatedBlock":
        return [{ ...event, target: this.lowerBlock(event.target, key, params, keyStack) }];
      case "Call": {
        // Parameterized motif call — inline the body with substituted params
        return this.inlineCall(event, key, params, keyStack);
      }
      // All other events: no pitch terms to lower
      default:
        return [event];
    }
  }

  private lowerNote(
    note: NoteEvent,
    key: KeyDirective | null,
    params: Map<string, PitchTerm>,
  ): NoteEvent {
    return {
      ...note,
      pitch: this.resolveTerm(note.pitch, key, params),
    };
  }

  private lowerChord(
    chord: ChordEvent,
    key: KeyDirective | null,
    params: Map<string, PitchTerm>,
  ): ChordEvent {
    return {
      ...chord,
      pitches: chord.pitches.map((p) => this.resolveTerm(p, key, params)),
    };
  }

  private lowerSustain(
    sustain: SustainEvent,
    key: KeyDirective | null,
    params: Map<string, PitchTerm>,
  ): SustainEvent {
    return {
      ...sustain,
      pitch: this.resolveTerm(sustain.pitch, key, params),
    };
  }

  private resolveTerm(
    term: PitchTerm,
    key: KeyDirective | null,
    params: Map<string, PitchTerm>,
  ): PitchTerm {
    // If already absolute, nothing to do
    if (term.kind === "Pitch") return term;
    return resolvePitchTerm(term, key, params);
  }

  private inlineCall(
    call: Event & { kind: "Call" },
    key: KeyDirective | null,
    params: Map<string, PitchTerm>,
    keyStack: KeyDirective[],
  ): Event[] {
    const sym = this.symbols.lookup(call.name);
    if (sym === null || sym.kind !== "Binding") {
      // Not a binding we can inline (or unresolved — resolve pass should have caught it)
      return [call];
    }

    const binding: Binding = sym;
    if (binding.params === undefined || binding.params.length === 0) {
      // Not parameterized — leave as-is (will be inlined differently)
      return [call];
    }

    // Build param map: param name -> arg pitch term (with outer params substituted)
    const callParams = new Map<string, PitchTerm>(params);
    for (let i = 0; i < binding.params.length; i++) {
      const paramName = binding.params[i];
      if (paramName === undefined) continue;
      const arg = call.args[i];
      if (arg === undefined) continue;

      let argPitch: PitchTerm;
      if (arg.kind === "PitchArg") {
        argPitch = arg.value;
      } else if (arg.kind === "IdentArg") {
        // Could be a param ref from the outer scope
        const outerBound = params.get(arg.name);
        argPitch = outerBound ?? { kind: "ParamRef", name: arg.name, span: arg.span };
      } else {
        continue;
      }

      // Substitute any outer param refs in the arg itself
      const substituted = substituteParamRefs(argPitch, params);
      callParams.set(paramName, substituted);
    }

    // Clone and walk the binding body, substituting param refs and resolving pitches.
    // Strip any Call events that reference the same binding to avoid infinite recursion
    // (the parser embeds call sites inside the binding's own EventList body when the
    // call appears immediately after the definition with no intervening top-level boundary).
    const clonedBody = cloneExpr(binding.body);

    // Extract events from body
    const events: Event[] = [];
    if (clonedBody.kind === "EventList") {
      for (const ev of clonedBody.events) {
        // Skip self-calls embedded in the binding body — these are call-site artifacts
        if (ev.kind === "Call" && ev.name === call.name) continue;
        const withParamsSubst = substituteParamRefsInEvent(ev, callParams);
        events.push(...this.lowerEvent(withParamsSubst, key, callParams, keyStack));
      }
    } else {
      // Block body
      const lowered = this.lowerBlock(clonedBody, key, callParams, keyStack);
      for (const node of lowered.body) {
        if (isEvent(node)) events.push(node as Event);
      }
    }

    return events;
  }
}

// ---- Substitute param refs in event tree (before lowering) ----

function substituteParamRefsInEvent(event: Event, params: Map<string, PitchTerm>): Event {
  switch (event.kind) {
    case "Note":
      return { ...event, pitch: substituteParamRefs(event.pitch, params) };
    case "Chord":
      return { ...event, pitches: event.pitches.map((p) => substituteParamRefs(p, params)) };
    case "Sustain":
      return { ...event, pitch: substituteParamRefs(event.pitch, params) };
    case "Repeat":
      return { ...event, body: substituteParamRefsInBlock(event.body, params) };
    case "With":
      return { ...event, body: substituteParamRefsInBlock(event.body, params) };
    case "Envelope":
      return { ...event, body: substituteParamRefsInBlock(event.body, params) };
    case "Tuplet":
      return { ...event, body: substituteParamRefsInBlock(event.body, params) };
    case "Ramp":
      return { ...event, body: substituteParamRefsInBlock(event.body, params) };
    case "Annotated":
      return { ...event, target: substituteParamRefsInEvent(event.target, params) };
    case "AnnotatedBlock":
      return { ...event, target: substituteParamRefsInBlock(event.target, params) };
    default:
      return event;
  }
}

function substituteParamRefsInBlock(block: Block, params: Map<string, PitchTerm>): Block {
  return {
    kind: "Block",
    body: block.body.map((node) => {
      if (isEvent(node)) return substituteParamRefsInEvent(node as Event, params);
      return node;
    }),
    span: block.span,
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

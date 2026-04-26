import type {
  AbsolutePitch,
  AnnotatedBlock,
  AnnotatedEvent,
  Annotation,
  Arg,
  ArticulationMark,
  BarMarker,
  Binding,
  Block,
  Call,
  CallExpr,
  ChordEvent,
  Composition,
  DurationToken,
  DynamicMarker,
  EnvelopeExpr,
  Event,
  EventList,
  InheritedPitchLetter,
  InstrumentDef,
  InstrumentField,
  MotifRef,
  NoteEvent,
  ParamRef,
  PitchArith,
  PitchTerm,
  RampExpr,
  RepeatExpr,
  RestEvent,
  ScaleDegree,
  SlideEvent,
  SustainEvent,
  TieEvent,
  TopLevel,
  TupletExpr,
  UseDecl,
  VoiceDecl,
  WithExpr,
} from "../ast/nodes.js";
import { lex } from "../lexer/lexer.js";
import { parse } from "../parser/parser.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function format(source: string): string {
  const ast = parse(lex(source));
  return printComposition(ast);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function indent(n: number): string {
  return "  ".repeat(n);
}

function formatNumber(n: number): string {
  // Emit integer if no fractional part, otherwise trim trailing zeros
  if (Number.isInteger(n)) return String(n);
  const s = String(n);
  return s.replace(/\.?0+$/, "") || "0";
}

/**
 * Returns true for event node kinds that should be grouped with adjacent
 * events onto a single output line.
 */
function isInlineEvent(n: TopLevel): boolean {
  switch (n.kind) {
    case "Note":
    case "Chord":
    case "Rest":
    case "Sustain":
    case "Tie":
    case "Slide":
    case "Dynamic":
    case "MotifRef":
    case "Call":
    case "Annotated":
      return true;
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

function printComposition(c: Composition): string {
  // Collect version — either from the parsed composition.version field,
  // or from any Version directive in the body (hoist it to first position).
  let version = c.version;
  let body = c.body;

  if (!version) {
    const versionNode = body.find((n) => n.kind === "Version");
    if (versionNode && versionNode.kind === "Version") {
      version = versionNode.version;
      body = body.filter((n) => n !== versionNode);
    }
  }

  const lines: string[] = [];

  if (version !== undefined) {
    lines.push(`\\version "${version}"`);
  }

  // Emit body, grouping consecutive inline events onto a single line
  for (const group of groupTopLevelNodes(body)) {
    lines.push(printTopLevelGroup(group, 0));
  }

  const joined = lines.join("\n");
  // Collapse 3+ consecutive newlines to 2 (one blank line max)
  const normalized = joined.replace(/\n{3,}/g, "\n\n");
  return `${normalized.trimEnd()}\n`;
}

/**
 * Group top-level nodes: consecutive inline events are batched together.
 * Non-inline nodes are each their own group (single-element array).
 */
function groupTopLevelNodes(nodes: TopLevel[]): TopLevel[][] {
  const groups: TopLevel[][] = [];
  let current: TopLevel[] = [];

  for (const n of nodes) {
    if (isInlineEvent(n)) {
      current.push(n);
    } else {
      if (current.length > 0) {
        groups.push(current);
        current = [];
      }
      groups.push([n]);
    }
  }

  if (current.length > 0) {
    groups.push(current);
  }

  return groups;
}

function printTopLevelGroup(group: TopLevel[], depth: number): string {
  const first = group[0];
  if (group.length === 1 && first !== undefined && !isInlineEvent(first)) {
    return printTopLevel(first, depth);
  }
  // All inline events — print on one line
  return `${indent(depth)}${group.map((n) => printEventInline(n as Event)).join(" ")}`;
}

// ---------------------------------------------------------------------------
// Top-level (non-inline structural nodes)
// ---------------------------------------------------------------------------

function printTopLevel(n: TopLevel, depth: number): string {
  switch (n.kind) {
    case "UseDecl":
      return printUseDecl(n);
    case "Tempo":
      return `${indent(depth)}\\tempo ${formatNumber(n.value)}`;
    case "Time":
      return `${indent(depth)}\\time ${n.numerator}/${n.denominator}`;
    case "Key":
      return `${indent(depth)}\\key ${printAbsolutePitch(n.tonic)} ${n.mode}`;
    case "Instrument":
      return `${indent(depth)}\\instrument ${n.name}`;
    case "Detune":
      return `${indent(depth)}\\detune ${formatNumber(n.cents)}`;
    case "Version":
      return `${indent(depth)}\\version "${n.version}"`;
    case "Binding":
      return printBinding(n, depth);
    case "VoiceDecl":
      return printVoiceDecl(n, depth);
    case "InstrumentDef":
      return printInstrumentDef(n, depth);
    // Block-level events (repeat, with, ramp, etc.) fall through to event printer
    default:
      return printEvent(n as Event, depth);
  }
}

// ---------------------------------------------------------------------------
// Use declaration
// ---------------------------------------------------------------------------

function printUseDecl(n: UseDecl): string {
  if (n.alias) return `\\use "${n.path}" as ${n.alias}`;
  if (n.selected && n.selected.length > 0) return `\\use "${n.path}" (${n.selected.join(", ")})`;
  return `\\use "${n.path}"`;
}

// ---------------------------------------------------------------------------
// Binding
// ---------------------------------------------------------------------------

function printBinding(n: Binding, depth: number): string {
  const lines: string[] = [];

  if (n.doc) {
    for (const line of n.doc.split("\n")) {
      lines.push(`${indent(depth)}/// ${line.trim()}`);
    }
  }

  const sig = n.params ? `${n.name}(${n.params.join(", ")})` : n.name;
  const lhs = `${indent(depth)}${sig} = `;

  if (n.body.kind === "EventList") {
    lines.push(`${lhs}${printEventList(n.body, depth)}`);
  } else {
    // Block body
    lines.push(`${lhs}${printBlockInline(n.body, depth)}`);
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Voice declaration
// ---------------------------------------------------------------------------

function printVoiceDecl(n: VoiceDecl, depth: number): string {
  const lines: string[] = [];

  if (n.doc) {
    for (const line of n.doc.split("\n")) {
      lines.push(`${indent(depth)}/// ${line.trim()}`);
    }
  }

  for (const ann of n.annotations) {
    lines.push(`${indent(depth)}${printAnnotation(ann)}`);
  }

  lines.push(`${indent(depth)}voice ${n.name} {`);
  for (const group of groupTopLevelNodes(n.body.body)) {
    lines.push(printTopLevelGroup(group, depth + 1));
  }
  lines.push(`${indent(depth)}}`);

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Instrument definition
// ---------------------------------------------------------------------------

function printInstrumentDef(n: InstrumentDef, depth: number): string {
  const lines: string[] = [];

  if (n.doc) {
    for (const line of n.doc.split("\n")) {
      lines.push(`${indent(depth)}/// ${line.trim()}`);
    }
  }

  lines.push(`${indent(depth)}instrument define ${n.name} {`);
  for (const field of n.fields) {
    lines.push(printInstrumentField(field, depth + 1));
  }
  lines.push(`${indent(depth)}}`);

  return lines.join("\n");
}

function printInstrumentField(f: InstrumentField, depth: number): string {
  switch (f.kind) {
    case "Oscillator": {
      let head =
        f.value === "sample" && f.samplePath !== undefined
          ? `oscillator sample("${f.samplePath}")`
          : `oscillator ${f.value}`;
      if (f.root !== undefined) head += ` root ${printAbsolutePitch(f.root)}`;
      if (f.detune !== undefined && f.detune !== 0) head += ` ${formatNumber(f.detune)}`;
      if (f.envelope !== undefined) {
        const innerIndent = indent(depth + 1);
        return [
          `${indent(depth)}${head} {`,
          `${innerIndent}envelope ${printCall(f.envelope)}`,
          `${indent(depth)}}`,
        ].join("\n");
      }
      return `${indent(depth)}${head}`;
    }
    case "EnvelopeField":
      return `${indent(depth)}envelope ${printCall(f.call)}`;
    case "FilterField":
      return `${indent(depth)}filter ${printCall(f.call)}`;
    case "DetuneField":
      return `${indent(depth)}detune ${formatNumber(f.cents)}`;
    case "PitchSweepField":
      return `${indent(depth)}pitch_sweep ${formatNumber(f.semitones)} ${formatNumber(f.duration)}`;
    case "GainField":
      return `${indent(depth)}gain ${formatNumber(f.factor)}`;
  }
}

// ---------------------------------------------------------------------------
// Block helpers
// ---------------------------------------------------------------------------

/**
 * Print a block body with grouped lines, used for voice/repeat/with/etc.
 * Opening brace on same line as header.
 */
function printBlockBody(b: Block, depth: number): string {
  if (b.body.length === 0) return "{}";
  const lines: string[] = ["{"];
  for (const group of groupTopLevelNodes(b.body)) {
    lines.push(printTopLevelGroup(group, depth + 1));
  }
  lines.push(`${indent(depth)}}`);
  return lines.join("\n");
}

/**
 * Print a block used as binding RHS.
 * Returns the block starting with `{` (caller provides leading `name = `).
 */
function printBlockInline(b: Block, depth: number): string {
  if (b.body.length === 0) return "{}";
  const lines: string[] = ["{"];
  for (const group of groupTopLevelNodes(b.body)) {
    lines.push(printTopLevelGroup(group, depth + 1));
  }
  lines.push(`${indent(depth)}}`);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// EventList
// ---------------------------------------------------------------------------

/**
 * Print all events in an EventList on a single line.
 */
function printEventList(el: EventList, _depth: number): string {
  return el.events.map((e) => printEventInline(e)).join(" ");
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

function printEvent(e: Event, depth: number): string {
  switch (e.kind) {
    case "Bar":
      return printBarMarker(e, depth);
    case "Dynamic":
      return `${indent(depth)}${printDynamic(e)}`;
    case "Note":
      return `${indent(depth)}${printNoteInline(e)}`;
    case "Chord":
      return `${indent(depth)}${printChordInline(e)}`;
    case "Slide":
      return `${indent(depth)}${printSlideInline(e)}`;
    case "Rest":
      return `${indent(depth)}${printRestInline(e)}`;
    case "Sustain":
      return `${indent(depth)}~ ${printPitchTerm(e.pitch)}`;
    case "Tie":
      return printTieInline(e, depth);
    case "Ramp":
      return printRamp(e, depth);
    case "Repeat":
      return printRepeat(e, depth);
    case "With":
      return printWith(e, depth);
    case "Envelope":
      return printEnvelope(e, depth);
    case "Tuplet":
      return printTuplet(e, depth);
    case "MotifRef":
      return `${indent(depth)}${e.name}`;
    case "Call":
      return `${indent(depth)}${printCallExpr(e)}`;
    case "Annotated":
      return printAnnotatedEvent(e, depth);
    case "AnnotatedBlock":
      return printAnnotatedBlock(e, depth);
  }
}

/**
 * Print an event as an inline fragment (no leading indent, no leading newlines).
 */
function printEventInline(e: Event): string {
  switch (e.kind) {
    case "Bar":
      return e.double ? "||" : "|";
    case "Dynamic":
      return printDynamic(e);
    case "Note":
      return printNoteInline(e);
    case "Chord":
      return printChordInline(e);
    case "Slide":
      return printSlideInline(e);
    case "Rest":
      return printRestInline(e);
    case "Sustain":
      return `~ ${printPitchTerm(e.pitch)}`;
    case "Tie":
      return `${printNoteInline(e.left)} ~ ${printNoteInline(e.right)}`;
    case "Ramp":
      return `ramp(${e.from}, ${e.to}) ${printBlockBody(e.body, 0)}`;
    case "Repeat":
      return `repeat ${e.count} ${printBlockBody(e.body, 0)}`;
    case "With":
      return `with ${e.effects.map(printCall).join(", ")} ${printBlockBody(e.body, 0)}`;
    case "Envelope":
      return `envelope ${printCall(e.call)} ${printBlockBody(e.body, 0)}`;
    case "Tuplet":
      return printTupletInline(e);
    case "MotifRef":
      return e.name;
    case "Call":
      return printCallExpr(e);
    case "Annotated":
      return printAnnotatedEventInline(e);
    case "AnnotatedBlock":
      return printAnnotatedBlockInline(e);
  }
}

// ---------------------------------------------------------------------------
// Individual event printers (inline)
// ---------------------------------------------------------------------------

function printDynamic(e: DynamicMarker): string {
  return e.value;
}

function printNoteInline(e: NoteEvent): string {
  let s = "";
  if (e.duration) s += `${printDuration(e.duration)} `;
  s += printPitchTerm(e.pitch);
  s += printModifiers(e.modifiers);
  for (const ann of e.annotations) {
    s += printAnnotation(ann);
  }
  if (e.repeat !== undefined) s += ` * ${e.repeat}`;
  return s;
}

function printChordInline(e: ChordEvent): string {
  let s = "";
  if (e.duration) s += `${printDuration(e.duration)} `;
  s += `<${e.pitches.map(printPitchTerm).join(" ")}>`;
  s += printModifiers(e.modifiers);
  for (const ann of e.annotations) {
    s += printAnnotation(ann);
  }
  if (e.repeat !== undefined) s += ` * ${e.repeat}`;
  return s;
}

function printSlideInline(e: SlideEvent): string {
  const src = printNoteInline(e.source);
  const dst = printNoteInline(e.destination);
  return `${src} -> ${dst}`;
}

function printRestInline(e: RestEvent): string {
  let s = "";
  if (e.duration) s += `${printDuration(e.duration)} `;
  s += "r";
  s += printModifiers(e.modifiers);
  for (const ann of e.annotations) {
    s += printAnnotation(ann);
  }
  return s;
}

function printTieInline(e: TieEvent, depth: number): string {
  return `${indent(depth)}${printNoteInline(e.left)} ~ ${printNoteInline(e.right)}`;
}

// ---------------------------------------------------------------------------
// Block events (need indentation)
// ---------------------------------------------------------------------------

function printBarMarker(e: BarMarker, depth: number): string {
  return `${indent(depth)}${e.double ? "||" : "|"}`;
}

function printRamp(e: RampExpr, depth: number): string {
  if (e.body.body.length === 0) return `${indent(depth)}ramp(${e.from}, ${e.to}) {}`;
  const header = `${indent(depth)}ramp(${e.from}, ${e.to}) {`;
  const body = groupTopLevelNodes(e.body.body)
    .map((g) => printTopLevelGroup(g, depth + 1))
    .join("\n");
  const close = `${indent(depth)}}`;
  return [header, body, close].join("\n");
}

function printRepeat(e: RepeatExpr, depth: number): string {
  if (e.body.body.length === 0) return `${indent(depth)}repeat ${e.count} {}`;
  const header = `${indent(depth)}repeat ${e.count} {`;
  const body = groupTopLevelNodes(e.body.body)
    .map((g) => printTopLevelGroup(g, depth + 1))
    .join("\n");
  const close = `${indent(depth)}}`;
  return [header, body, close].join("\n");
}

function printWith(e: WithExpr, depth: number): string {
  const effectStr = e.effects.map(printCall).join(", ");
  if (e.body.body.length === 0) return `${indent(depth)}with ${effectStr} {}`;
  const header = `${indent(depth)}with ${effectStr} {`;
  const body = groupTopLevelNodes(e.body.body)
    .map((g) => printTopLevelGroup(g, depth + 1))
    .join("\n");
  const close = `${indent(depth)}}`;
  return [header, body, close].join("\n");
}

function printEnvelope(e: EnvelopeExpr, depth: number): string {
  const callStr = printCall(e.call);
  if (e.body.body.length === 0) return `${indent(depth)}envelope ${callStr} {}`;
  const header = `${indent(depth)}envelope ${callStr} {`;
  const body = groupTopLevelNodes(e.body.body)
    .map((g) => printTopLevelGroup(g, depth + 1))
    .join("\n");
  const close = `${indent(depth)}}`;
  return [header, body, close].join("\n");
}

function printTuplet(e: TupletExpr, depth: number): string {
  const spec = e.m !== undefined ? `${e.n}, ${e.m}` : String(e.n);
  if (e.body.body.length === 0) return `${indent(depth)}tuplet(${spec}) {}`;
  const header = `${indent(depth)}tuplet(${spec}) {`;
  const body = groupTopLevelNodes(e.body.body)
    .map((g) => printTopLevelGroup(g, depth + 1))
    .join("\n");
  const close = `${indent(depth)}}`;
  return [header, body, close].join("\n");
}

function printTupletInline(e: TupletExpr): string {
  const spec = e.m !== undefined ? `${e.n}, ${e.m}` : String(e.n);
  return `tuplet(${spec}) ${printBlockBody(e.body, 0)}`;
}

// ---------------------------------------------------------------------------
// Annotated events/blocks
// ---------------------------------------------------------------------------

function printAnnotatedEvent(e: AnnotatedEvent, depth: number): string {
  // Annotations are postfix on the event with no separator
  const inner = printEventInline(e.target);
  const anns = e.annotations.map(printAnnotation).join("");
  return `${indent(depth)}${inner}${anns}`;
}

function printAnnotatedEventInline(e: AnnotatedEvent): string {
  const inner = printEventInline(e.target);
  const anns = e.annotations.map(printAnnotation).join("");
  return `${inner}${anns}`;
}

function printAnnotatedBlock(e: AnnotatedBlock, depth: number): string {
  const lines: string[] = [];
  for (const ann of e.annotations) {
    lines.push(`${indent(depth)}${printAnnotation(ann)}`);
  }
  // Print the block body indented under the annotations
  if (e.target.body.length === 0) {
    lines.push(`${indent(depth)}{}`);
  } else {
    lines.push(`${indent(depth)}{`);
    for (const group of groupTopLevelNodes(e.target.body)) {
      lines.push(printTopLevelGroup(group, depth + 1));
    }
    lines.push(`${indent(depth)}}`);
  }
  return lines.join("\n");
}

function printAnnotatedBlockInline(e: AnnotatedBlock): string {
  const anns = e.annotations.map(printAnnotation).join("\n");
  const block = printBlockBody(e.target, 0);
  return `${anns}\n${block}`;
}

// ---------------------------------------------------------------------------
// Pitch terms
// ---------------------------------------------------------------------------

function printPitchTerm(p: PitchTerm): string {
  switch (p.kind) {
    case "Pitch":
      return printAbsolutePitch(p);
    case "ScaleDegree":
      return printScaleDegree(p);
    case "PitchArith":
      return printPitchArith(p);
    case "ParamRef":
      return printParamRef(p);
    case "InheritedPitchLetter":
      return printInheritedPitchLetter(p);
  }
}

function printAbsolutePitch(p: AbsolutePitch): string {
  let s = p.letter;
  if (p.accidental !== null) s += p.accidental;
  s += String(p.octave);
  if (p.cents !== 0) {
    s += p.cents > 0 ? `+${p.cents}c` : `${p.cents}c`;
  }
  return s;
}

function printScaleDegree(p: ScaleDegree): string {
  const sign = p.degree < 0 ? "-" : "";
  let s = `^${sign}${Math.abs(p.degree)}`;
  if (p.accidental) s += p.accidental;
  return s;
}

function printPitchArith(p: PitchArith): string {
  const base = printPitchTerm(p.base);
  if (p.semitones >= 0) return `${base}+${p.semitones}`;
  return `${base}${p.semitones}`;
}

function printParamRef(p: ParamRef): string {
  return p.name;
}

function printInheritedPitchLetter(p: InheritedPitchLetter): string {
  let s = p.letter;
  if (p.accidental) s += p.accidental;
  return s;
}

// ---------------------------------------------------------------------------
// Duration
// ---------------------------------------------------------------------------

function printDuration(d: DurationToken): string {
  return d.raw;
}

// ---------------------------------------------------------------------------
// Modifiers (articulation)
// ---------------------------------------------------------------------------

function printModifiers(marks: ArticulationMark[]): string {
  return marks.map((m) => m.mark).join("");
}

// ---------------------------------------------------------------------------
// Annotations
// ---------------------------------------------------------------------------

function printAnnotation(a: Annotation): string {
  // Annotation name already includes the '@' prefix from the lexer
  if (a.args.length === 0) return a.name;
  return `${a.name}(${a.args.map(printArg).join(", ")})`;
}

// ---------------------------------------------------------------------------
// Call
// ---------------------------------------------------------------------------

function printCall(c: Call): string {
  return `${c.name}(${c.args.map(printArg).join(", ")})`;
}

function printCallExpr(c: CallExpr): string {
  return `${c.name}(${c.args.map(printArg).join(", ")})`;
}

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

function printArg(a: Arg): string {
  switch (a.kind) {
    case "NumberArg":
      return formatNumber(a.value);
    case "StringArg":
      return `"${a.value}"`;
    case "PitchArg":
      return printPitchTerm(a.value);
    case "IdentArg":
      return a.name;
    case "NamedArg":
      return `${a.name}: ${printArg(a.value)}`;
  }
}

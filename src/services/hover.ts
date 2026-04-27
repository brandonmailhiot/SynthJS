import type {
  AbsolutePitch,
  Annotation,
  Binding,
  CallExpr,
  Composition,
  InstrumentDef,
  MotifRef,
  TopLevel,
} from "../ast/nodes.js";
import type { SourceSpan } from "../errors.js";
import type { CompositionIR, InstrumentSpec, TimelineEvent, VoiceTimeline } from "../ir/nodes.js";
import { lex } from "../lexer/lexer.js";
import { parse } from "../parser/parser.js";
import { computeFrequency } from "../pitch.js";
import { compileSync } from "../semantic/pipeline.js";
import { ANNOTATION_REGISTRY } from "../semantic/registries/annotations.js";
import { EFFECT_REGISTRY } from "../semantic/registries/effects.js";
import { type Range, spanToRange } from "./position.js";

export type HoverInfo = {
  range: Range;
  contents: string[];
};

export function getHover(source: string, offset: number): HoverInfo | null {
  let ast: Composition;
  try {
    ast = parse(lex(source));
  } catch {
    return null;
  }

  const found = findNodeAtOffset(ast, offset);
  if (!found) return null;

  const { node, kind } = found;

  // Pitch hover — pitch info plus rich event metadata (instrument, gain,
  // time position, voice, articulation, fxChain, …) when the pitch
  // resolves to a TimelineEvent in the compiled IR.
  if (kind === "Pitch") {
    const pitch = node as unknown as AbsolutePitch;
    const freq = computeFrequency(pitch);
    const baseLines = [
      `**Pitch:** ${pitch.letter}${pitch.accidental ?? ""}${pitch.octave ?? ""}`,
      `**Frequency:** ${freq.toFixed(2)} Hz`,
      ...(pitch.cents !== 0
        ? [`**Detune:** ${pitch.cents > 0 ? "+" : ""}${pitch.cents} cents`]
        : []),
    ];
    const eventLines = describeEventAtSpan(source, pitch.span);
    return {
      range: spanToRange(source, pitch.span),
      contents: eventLines ? [...baseLines, "---", ...eventLines] : baseLines,
    };
  }

  // InheritedPitchLetter hover (sticky octave) — letter is in the AST,
  // resolved frequency comes from the IR. We also compute the inherited
  // octave so the tooltip shows the same shape as an explicit-octave note.
  if (kind === "InheritedPitchLetter") {
    const inherited = node as unknown as {
      letter: string;
      accidental?: string;
      span: SourceSpan;
    };
    const resolved = resolveInheritedPitch(source, ast, inherited.span);
    const baseLines: string[] = [];
    if (resolved) {
      baseLines.push(
        `**Pitch:** ${inherited.letter}${inherited.accidental ?? ""}${resolved.octave} *(inherited)*`,
        `**Frequency:** ${resolved.freq.toFixed(2)} Hz`,
      );
    } else {
      baseLines.push(`**Pitch:** ${inherited.letter}${inherited.accidental ?? ""} *(inherited)*`);
    }
    const eventLines = describeEventAtSpan(source, inherited.span);
    return {
      range: spanToRange(source, inherited.span),
      contents: eventLines ? [...baseLines, "---", ...eventLines] : baseLines,
    };
  }

  // Rest hover — rests have no pitch, but we can still show the duration,
  // start time, voice, and articulation that apply.
  if (kind === "Rest") {
    const rest = node as unknown as { span: SourceSpan };
    const eventLines = describeEventAtSpan(source, rest.span);
    return {
      range: spanToRange(source, rest.span),
      contents: eventLines ? ["**Rest**", ...eventLines] : ["**Rest**"],
    };
  }

  // MotifRef hover
  if (kind === "MotifRef") {
    const ref = node as unknown as MotifRef;
    const binding = findBinding(ast, ref.name);
    if (binding) {
      const sig = binding.params ? `${binding.name}(${binding.params.join(", ")})` : binding.name;
      const lines = [`**Motif:** \`${sig}\``];
      if (binding.doc) lines.push(binding.doc.trim());
      return { range: spanToRange(source, ref.span), contents: lines };
    }
    return {
      range: spanToRange(source, ref.span),
      contents: [`**Motif reference:** \`${ref.name}\` (unresolved)`],
    };
  }

  // Call hover
  if (kind === "Call") {
    const call = node as unknown as CallExpr;
    const binding = findBinding(ast, call.name);
    if (binding) {
      const sig = binding.params ? `${binding.name}(${binding.params.join(", ")})` : binding.name;
      const lines = [`**Call:** \`${sig}\``];
      if (binding.doc) lines.push(binding.doc.trim());
      return { range: spanToRange(source, call.span), contents: lines };
    }
    // Effect call?
    const effectSpec = EFFECT_REGISTRY[call.name];
    if (effectSpec) {
      const params = effectSpec.params.map((p) => `${p.name}: ${p.kind}`).join(", ");
      return {
        range: spanToRange(source, call.span),
        contents: [`**Effect:** \`${call.name}(${params})\``],
      };
    }
    return {
      range: spanToRange(source, call.span),
      contents: [`**Call:** \`${call.name}\` (unresolved)`],
    };
  }

  // Annotation hover
  if (kind === "Annotation") {
    const anno = node as unknown as Annotation;
    const spec = ANNOTATION_REGISTRY[anno.name];
    if (spec) {
      const params = spec.params.map((p) => `${p.name}: ${p.kind}`).join(", ");
      return {
        range: spanToRange(source, anno.span),
        contents: [`**Annotation:** \`${anno.name}(${params})\``],
      };
    }
    return {
      range: spanToRange(source, anno.span),
      contents: [`**Annotation:** \`${anno.name}\` (unknown)`],
    };
  }

  // Binding declaration hover (cursor on a binding name)
  if (kind === "Binding") {
    const binding = node as unknown as Binding;
    const sig = binding.params ? `${binding.name}(${binding.params.join(", ")})` : binding.name;
    const lines = [`**Binding:** \`${sig}\``];
    if (binding.doc) lines.push(binding.doc.trim());
    return { range: spanToRange(source, binding.span), contents: lines };
  }

  // InstrumentDef hover
  if (kind === "InstrumentDef") {
    const def = node as unknown as InstrumentDef;
    const lines = [`**Instrument:** \`${def.name}\``];
    if (def.doc) lines.push(def.doc.trim());
    return { range: spanToRange(source, def.span), contents: lines };
  }

  return null;
}

type FoundNode = {
  node: Record<string, unknown> & { kind: string; span: SourceSpan };
  kind: string;
};

function findNodeAtOffset(ast: Composition, offset: number): FoundNode | null {
  // Walk tree, find smallest (deepest) node whose span contains offset.
  // Uses half-open intervals: start <= offset < end.
  // Equal-size nodes: prefer the later-visited (deeper/later sibling) one.
  let best: FoundNode | null = null;

  function visit(node: unknown): void {
    if (!node || typeof node !== "object") return;
    const obj = node as Record<string, unknown>;
    const span = obj.span as SourceSpan | undefined;
    if (span && typeof span.start === "number" && typeof span.end === "number") {
      if (offset >= span.start && offset < span.end) {
        const size = span.end - span.start;
        const bestSize = best
          ? best.node.span.end - best.node.span.start
          : Number.POSITIVE_INFINITY;
        if (size <= bestSize) {
          if (typeof obj.kind === "string") {
            best = {
              node: obj as Record<string, unknown> & { kind: string; span: SourceSpan },
              kind: obj.kind as string,
            };
          }
        }
      }
    }
    for (const key of Object.keys(obj)) {
      if (key === "span") continue;
      const v = obj[key];
      if (Array.isArray(v)) {
        for (const item of v) visit(item);
      } else if (v && typeof v === "object") {
        visit(v);
      }
    }
  }

  visit(ast);
  return best;
}

function findBinding(ast: Composition, name: string): Binding | null {
  function search(nodes: TopLevel[] | undefined): Binding | null {
    if (!nodes) return null;
    for (const n of nodes) {
      if (n.kind === "Binding" && n.name === name) return n;
      if (n.kind === "VoiceDecl") {
        const r = search(n.body.body);
        if (r) return r;
      }
    }
    return null;
  }
  return search(ast.body);
}

/**
 * Resolve an InheritedPitchLetter span to its frequency + octave by walking
 * the IR. Finds the parent Note or Chord AST event containing the inherited
 * pitch, identifies its index inside any chord pitch list, and looks up the
 * corresponding entry in the matching TimelineEvent's frequencies array.
 */
function resolveInheritedPitch(
  source: string,
  ast: Composition,
  span: SourceSpan,
): { freq: number; octave: number } | null {
  // Walk AST to find the smallest enclosing Note/Chord event and the
  // index of this pitch inside its pitch list.
  let index = -1;
  let parentSpan: SourceSpan | null = null;

  function visit(node: unknown): void {
    if (!node || typeof node !== "object") return;
    const obj = node as Record<string, unknown>;
    const kind = obj.kind as string | undefined;
    if (kind === "Note") {
      const noteSpan = obj.span as SourceSpan;
      if (
        noteSpan.start <= span.start &&
        noteSpan.end >= span.end &&
        (parentSpan === null || noteSpan.end - noteSpan.start <= parentSpan.end - parentSpan.start)
      ) {
        index = 0;
        parentSpan = noteSpan;
      }
    } else if (kind === "Chord") {
      const chordSpan = obj.span as SourceSpan;
      const pitches = obj.pitches as { span: SourceSpan }[] | undefined;
      if (
        pitches &&
        chordSpan.start <= span.start &&
        chordSpan.end >= span.end &&
        (parentSpan === null ||
          chordSpan.end - chordSpan.start <= parentSpan.end - parentSpan.start)
      ) {
        for (let i = 0; i < pitches.length; i++) {
          const p = pitches[i];
          if (p && p.span.start === span.start && p.span.end === span.end) {
            index = i;
            parentSpan = chordSpan;
            break;
          }
        }
      }
    }
    for (const key of Object.keys(obj)) {
      if (key === "span") continue;
      const v = obj[key];
      if (Array.isArray(v)) for (const item of v) visit(item);
      else if (v && typeof v === "object") visit(v);
    }
  }
  visit(ast);
  if (index < 0 || !parentSpan) return null;

  let ir: CompositionIR;
  try {
    ir = compileSync(source);
  } catch {
    return null;
  }
  for (const v of ir.voices) {
    for (const e of v.events) {
      const ps = parentSpan as SourceSpan;
      if (e.span.start === ps.start && e.span.end === ps.end) {
        const freq = e.frequencies[index];
        if (typeof freq !== "number") return null;
        // Derive octave from frequency: midi = 69 + 12 * log2(freq/440)
        const midi = Math.round(69 + 12 * Math.log2(freq / 440));
        const octave = Math.floor(midi / 12) - 1;
        return { freq, octave };
      }
    }
  }
  return null;
}

// ---- Event metadata (compile to IR, find matching TimelineEvent) ----

const ARTICULATION_LABELS: Record<string, string> = {
  ".": "staccato",
  _: "legato",
  ">": "accent",
  "^": "marcato",
};

const DYNAMIC_NAMES: { gain: number; name: string }[] = [
  { gain: 0.16, name: "\\pp" },
  { gain: 0.32, name: "\\p" },
  { gain: 0.5, name: "\\mp" },
  { gain: 0.65, name: "\\mf" },
  { gain: 0.8, name: "\\f" },
  { gain: 1.0, name: "\\ff" },
];

function nearestDynamic(gain: number): string | null {
  let best: { diff: number; name: string } | null = null;
  for (const { gain: g, name } of DYNAMIC_NAMES) {
    const diff = Math.abs(g - gain);
    if (!best || diff < best.diff) best = { diff, name };
  }
  return best && best.diff < 0.04 ? best.name : null;
}

function noteValueLabel(beats: number): string {
  // beats is in whole-note fractions — 1.0 = whole, 0.25 = quarter, etc.
  const exact: Record<string, string> = {
    "1": "whole",
    "0.5": "half",
    "0.25": "quarter",
    "0.125": "eighth",
    "0.0625": "sixteenth",
    "0.03125": "thirty-second",
    "0.75": "dotted half",
    "0.375": "dotted quarter",
    "0.1875": "dotted eighth",
  };
  const key = beats.toFixed(5).replace(/\.?0+$/, "");
  return exact[key] ?? `${beats} whole-notes`;
}

function timePosition(
  startBeat: number,
  tempo: number,
  timeSig: { numerator: number; denominator: number },
): { bar: number; beat: number; seconds: number } {
  const barLengthInWholeNotes = timeSig.numerator / timeSig.denominator;
  const barIndex = Math.floor(startBeat / barLengthInWholeNotes + 1e-9);
  const intoBar = startBeat - barIndex * barLengthInWholeNotes;
  const beatInBar = intoBar * timeSig.denominator + 1;
  const seconds = (startBeat * 4 * 60) / tempo;
  return { bar: barIndex + 1, beat: beatInBar, seconds };
}

function instrumentSummary(spec: InstrumentSpec): string {
  const layers = spec.oscillators.map((l) => {
    const detune =
      l.detune !== undefined && l.detune !== 0 ? `${l.detune > 0 ? "+" : ""}${l.detune}c` : "";
    return l.kind + (detune ? ` (${detune})` : "");
  });
  const parts: string[] = [`\`${spec.name}\``];
  parts.push(`oscillators: ${layers.join(" + ")}`);
  if (spec.filters.length > 0) {
    parts.push(
      `filters: ${spec.filters.map((f) => `${f.type}(${f.cutoff}, ${f.q})`).join(" -> ")}`,
    );
  }
  if (spec.envelope) {
    parts.push(`envelope: ${spec.envelope.kind}(${spec.envelope.args.join(", ")})`);
  }
  if (spec.detune !== undefined && spec.detune !== 0) parts.push(`detune: ${spec.detune}c`);
  if (spec.pitchSweep)
    parts.push(`pitch_sweep: ${spec.pitchSweep.semitones} semi over ${spec.pitchSweep.duration}s`);
  if (spec.gain !== undefined && spec.gain !== 1) parts.push(`gain: ×${spec.gain}`);
  return parts.join(" · ");
}

function describeEventAtSpan(source: string, span: SourceSpan): string[] | null {
  let ir: CompositionIR;
  try {
    ir = compileSync(source);
  } catch {
    return null;
  }

  // Find every TimelineEvent whose source span CONTAINS the hovered span.
  // A note event in `repeat 4 { … }` produces 4 events with the same span,
  // so we report the count and use the first occurrence's metadata for
  // structural fields (instrument, gain, articulation).
  const matches: { event: TimelineEvent; voice: VoiceTimeline }[] = [];
  for (const v of ir.voices) {
    for (const e of v.events) {
      if (e.span.start <= span.start && e.span.end >= span.end) {
        matches.push({ event: e, voice: v });
      }
    }
  }
  if (matches.length === 0) return null;

  const first = matches[0];
  if (!first) return null;
  const { event, voice } = first;

  const lines: string[] = [];

  // Voice + composition position
  lines.push(`**Voice:** \`${voice.name}\``);
  const t0 = timePosition(event.startBeat, ir.tempo, ir.timeSig);
  lines.push(
    `**Position:** bar ${t0.bar}, beat ${t0.beat % 1 === 0 ? t0.beat : t0.beat.toFixed(2)} (${t0.seconds.toFixed(3)}s)`,
  );

  // Duration (note-value name + seconds)
  const durSeconds = (event.durationBeats * 4 * 60) / ir.tempo;
  lines.push(`**Duration:** ${noteValueLabel(event.durationBeats)} (${durSeconds.toFixed(3)}s)`);

  // Volume (gain + nearest dynamic marking)
  const dyn = nearestDynamic(event.gain);
  lines.push(`**Volume:** ${event.gain.toFixed(2)}${dyn ? ` (≈ ${dyn})` : ""}`);

  // Instrument breakdown
  lines.push(`**Instrument:** ${instrumentSummary(event.instrument)}`);

  // Articulation
  if (event.articulation.length > 0) {
    const labels = event.articulation.map((a) => ARTICULATION_LABELS[a] ?? a);
    lines.push(`**Articulation:** ${labels.join(", ")}`);
  }

  // Slide target
  if (event.slideTo && event.slideTo.length > 0) {
    lines.push(`**Slide to:** ${event.slideTo.map((f) => `${f.toFixed(2)} Hz`).join(", ")}`);
  }

  // Effects chain
  if (event.fxChain.length > 0) {
    const fx = event.fxChain.map((f) => `${f.name}(${f.args.positional.join(", ")})`).join(" -> ");
    lines.push(`**Effects:** ${fx}`);
  }

  // Annotations
  if (event.annotations.length > 0) {
    const annos = event.annotations.map((a) => `${a.name}(${a.args.join(", ")})`).join(", ");
    lines.push(`**Annotations:** ${annos}`);
  }

  // Repeat-expansion count
  if (matches.length > 1) {
    lines.push(`*Plays ${matches.length}× in this composition (positions inside repeat blocks).*`);
  }

  return lines;
}

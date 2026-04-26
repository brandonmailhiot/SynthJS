import type { Composition, TopLevel, UseDecl } from "../ast/nodes.js";
import { lex } from "../lexer/lexer.js";
import { parse } from "../parser/parser.js";
import { ANNOTATION_REGISTRY } from "../semantic/registries/annotations.js";
import { EFFECT_REGISTRY } from "../semantic/registries/effects.js";
import { STDLIB, getStdlibSource } from "../stdlib/index.js";

export type CompletionItem = {
  label: string;
  kind:
    | "keyword"
    | "function"
    | "variable"
    | "value"
    | "directive"
    | "annotation"
    | "pitch"
    | "duration"
    | "instrument"
    | "effect"
    | "mode";
  detail?: string;
  documentation?: string;
};

const PRIMITIVES = ["sine", "square", "sawtooth", "triangle", "noise"];
const MODES = ["major", "minor", "dorian", "phrygian", "lydian", "mixolydian", "locrian"];
const KEYWORDS = [
  "voice",
  "with",
  "envelope",
  "tuplet",
  "repeat",
  "ramp",
  "as",
  "instrument",
  "define",
];
const COMMANDS = ["\\version", "\\tempo", "\\time", "\\key", "\\instrument", "\\detune", "\\use"];
const DYNAMICS = ["\\pp", "\\p", "\\mp", "\\mf", "\\f", "\\ff", "\\fff"];
const COMMON_DURATIONS = ["1", "2", "4", "8", "16", "32", "64", "1.", "2.", "4.", "8.", "4t", "8t"];
const COMMON_PITCHES = [
  "c4",
  "d4",
  "e4",
  "f4",
  "g4",
  "a4",
  "b4",
  "c5",
  "d5",
  "e5",
  "f5",
  "g5",
  "a5",
  "b5",
  "c3",
  "d3",
  "e3",
  "f3",
  "g3",
  "a3",
  "b3",
  "c#4",
  "d#4",
  "f#4",
  "g#4",
  "a#4",
  "r",
];

export function getCompletions(source: string, offset: number): CompletionItem[] {
  // Look at what's immediately before the cursor
  const before = source.slice(0, offset);
  const prefixMatch = before.match(/(\\\w*|@\w*|\w+)$/);
  const prefix = prefixMatch ? prefixMatch[0] : "";

  // \ → directive or dynamic
  if (prefix.startsWith("\\")) {
    return [
      ...COMMANDS.map((c) => ({ label: c, kind: "directive" as const })),
      ...DYNAMICS.map((d) => ({ label: d, kind: "value" as const, detail: "dynamic" })),
    ];
  }

  // @ → annotation
  if (prefix.startsWith("@")) {
    return Object.keys(ANNOTATION_REGISTRY).map((name) => {
      const spec = ANNOTATION_REGISTRY[name];
      if (!spec) return { label: name, kind: "annotation" as const };
      return {
        label: name,
        kind: "annotation" as const,
        detail: `(${spec.params.map((p) => `${p.name}: ${p.kind}`).join(", ")})`,
      };
    });
  }

  // After "with " → effect names
  const beforeWith = before.match(/\bwith\s+(\w*)$/);
  if (beforeWith) {
    return Object.keys(EFFECT_REGISTRY).map((name) => {
      const spec = EFFECT_REGISTRY[name];
      if (!spec) return { label: name, kind: "effect" as const };
      return {
        label: name,
        kind: "effect" as const,
        detail: `(${spec.params.map((p) => `${p.name}: ${p.kind}`).join(", ")})`,
      };
    });
  }

  // After "\\use \"" → stdlib paths
  const beforeUseString = before.match(/\\use\s+"([^"]*)$/);
  if (beforeUseString) {
    return Object.keys(STDLIB).map((path) => ({
      label: path,
      kind: "value" as const,
      detail: "stdlib module",
      documentation: stdlibSummary(path),
    }));
  }

  // After "\\instrument " → primitives + custom instruments + stdlib instruments
  const beforeInstr = before.match(/\\instrument\s+(\w*)$/);
  if (beforeInstr) {
    const items: CompletionItem[] = PRIMITIVES.map((p) => ({
      label: p,
      kind: "instrument" as const,
      detail: "primitive oscillator",
    }));
    const ast = tryParse(source);
    const importedStdlib = ast ? findStdlibImports(ast) : new Set<string>();
    if (ast) {
      for (const n of ast.body) {
        if (n.kind === "InstrumentDef") {
          items.push({ label: n.name, kind: "instrument", detail: "custom instrument" });
        }
      }
    }
    // Pull instrument names from every stdlib module, even when not yet
    // imported — flag the unimported ones so users discover them.
    const stdlibInstruments = collectStdlibInstruments();
    for (const inst of stdlibInstruments) {
      const imported = importedStdlib.has(inst.module);
      items.push({
        label: inst.name,
        kind: "instrument",
        detail: imported
          ? `stdlib (${inst.module})`
          : `stdlib (${inst.module}) — add \`\\use "${inst.module}"\``,
        ...(inst.doc ? { documentation: inst.doc } : {}),
      });
    }
    return items;
  }

  // After "\\key <pitch> " → mode names
  const beforeKeyMode = before.match(/\\key\s+\S+\s+(\w*)$/);
  if (beforeKeyMode) {
    return MODES.map((m) => ({ label: m, kind: "mode" as const }));
  }

  // After "\\key " → pitches
  const beforeKey = before.match(/\\key\s+(\w*)$/);
  if (beforeKey) {
    return COMMON_PITCHES.filter((p) => p !== "r").map((p) => ({
      label: p,
      kind: "pitch" as const,
    }));
  }

  // Default: event-position completions — durations, pitches, motif names, keywords
  const items: CompletionItem[] = [];
  for (const d of COMMON_DURATIONS) items.push({ label: d, kind: "duration" });
  for (const p of COMMON_PITCHES) items.push({ label: p, kind: "pitch" });
  for (const k of KEYWORDS) items.push({ label: k, kind: "keyword" });

  // Add bindings from current AST
  const ast = tryParse(source);
  if (ast) {
    collectBindings(ast.body, items);
  }

  // Surface stdlib motifs (parameterized bindings) as completions, with hints
  // when the source hasn't yet imported the relevant module.
  const importedStdlib = ast ? findStdlibImports(ast) : new Set<string>();
  const stdlibMotifs = collectStdlibMotifs();
  for (const m of stdlibMotifs) {
    const imported = importedStdlib.has(m.module);
    const sig = m.params ? `${m.name}(${m.params.join(", ")})` : m.name;
    items.push({
      label: m.name,
      kind: "function",
      detail: imported
        ? `stdlib (${m.module}) — ${sig}`
        : `stdlib (${m.module}) — ${sig} — add \`\\use "${m.module}"\``,
      ...(m.doc ? { documentation: m.doc } : {}),
    });
  }

  return items;
}

function tryParse(source: string): Composition | null {
  try {
    return parse(lex(source));
  } catch {
    // If the full source fails, try without the last incomplete line
    const lastNewline = source.lastIndexOf("\n");
    if (lastNewline > 0) {
      try {
        return parse(lex(source.slice(0, lastNewline)));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function collectBindings(body: TopLevel[], items: CompletionItem[]): void {
  for (const n of body) {
    if (n.kind === "Binding") {
      const sig = n.params ? `${n.name}(${n.params.join(", ")})` : n.name;
      items.push({
        label: n.name,
        kind: "function",
        detail: sig,
        ...(n.doc ? { documentation: n.doc.trim() } : {}),
      });
    }
    if (n.kind === "InstrumentDef") {
      items.push({ label: n.name, kind: "instrument", detail: "custom instrument" });
    }
    if (n.kind === "VoiceDecl") {
      collectBindings(n.body.body, items);
    }
  }
}

// ---- stdlib introspection ----

const STDLIB_SUMMARIES: Record<string, string> = {
  "@stdlib/scales":
    "Scale motifs: major_scale, minor_scale, pentatonic_major, pentatonic_minor, blues, dorian_scale, mixolydian_scale.",
  "@stdlib/chords": "Chord motifs: triad_major/minor/dim/aug/sus2/sus4 + sevenths.",
  "@stdlib/drums":
    "Drum instruments: kick_drum, snare_drum, hat_closed, hat_open, tom_low, tom_high.",
  "@stdlib/instruments":
    "Custom instruments: warm_pad, lead_saw, brass, bass_synth, bell, string_pad.",
  "@stdlib/fx": "Effect presets (documentation only — use inline `with` calls).",
};

function stdlibSummary(path: string): string {
  return STDLIB_SUMMARIES[path] ?? "";
}

function findStdlibImports(ast: Composition): Set<string> {
  const imported = new Set<string>();
  for (const node of ast.body) {
    if (node.kind === "UseDecl" && (node as UseDecl).path.startsWith("@stdlib/")) {
      imported.add((node as UseDecl).path);
    }
  }
  return imported;
}

type StdlibInstrument = { module: string; name: string; doc?: string };
type StdlibMotif = { module: string; name: string; params?: string[]; doc?: string };

let stdlibCache: { instruments: StdlibInstrument[]; motifs: StdlibMotif[] } | null = null;

function buildStdlibCache(): { instruments: StdlibInstrument[]; motifs: StdlibMotif[] } {
  if (stdlibCache) return stdlibCache;
  const instruments: StdlibInstrument[] = [];
  const motifs: StdlibMotif[] = [];
  for (const path of Object.keys(STDLIB)) {
    const src = getStdlibSource(path) ?? "";
    let ast: Composition;
    try {
      ast = parse(lex(src));
    } catch {
      continue;
    }
    for (const node of ast.body) {
      if (node.kind === "InstrumentDef") {
        instruments.push({
          module: path,
          name: node.name,
          ...(node.doc ? { doc: node.doc.trim() } : {}),
        });
      } else if (node.kind === "Binding") {
        motifs.push({
          module: path,
          name: node.name,
          ...(node.params ? { params: node.params } : {}),
          ...(node.doc ? { doc: node.doc.trim() } : {}),
        });
      }
    }
  }
  stdlibCache = { instruments, motifs };
  return stdlibCache;
}

function collectStdlibInstruments(): StdlibInstrument[] {
  return buildStdlibCache().instruments;
}

function collectStdlibMotifs(): StdlibMotif[] {
  return buildStdlibCache().motifs;
}

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
import { lex } from "../lexer/lexer.js";
import { parse } from "../parser/parser.js";
import { computeFrequency } from "../pitch.js";
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

  // Pitch hover
  if (kind === "Pitch") {
    const pitch = node as unknown as AbsolutePitch;
    const freq = computeFrequency(pitch);
    return {
      range: spanToRange(source, pitch.span),
      contents: [
        `**Pitch:** ${pitch.letter}${pitch.accidental ?? ""}${pitch.octave ?? ""}`,
        `**Frequency:** ${freq.toFixed(2)} Hz`,
        ...(pitch.cents !== 0
          ? [`**Detune:** ${pitch.cents > 0 ? "+" : ""}${pitch.cents} cents`]
          : []),
      ],
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

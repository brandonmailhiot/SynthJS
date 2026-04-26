import type { Binding, Composition, InstrumentDef, TopLevel } from "../ast/nodes.js";
import type { SourceSpan } from "../errors.js";
import { lex } from "../lexer/lexer.js";
import { parse } from "../parser/parser.js";
import { type Range, spanToRange } from "./position.js";

export function getDefinition(source: string, offset: number): Range | null {
  let ast: Composition;
  try {
    ast = parse(lex(source));
  } catch {
    return null;
  }
  const found = findNodeAtOffset(ast, offset);
  if (!found) return null;

  const { node } = found;

  // MotifRef → binding's span
  if ((node as { kind: string }).kind === "MotifRef") {
    const ref = node as { name: string };
    const binding = findBinding(ast, ref.name);
    if (binding) return spanToRange(source, binding.span);
  }

  // Call → binding's span (if it's a motif call, not effect)
  if ((node as { kind: string }).kind === "Call") {
    const call = node as { name: string };
    const binding = findBinding(ast, call.name);
    if (binding) return spanToRange(source, binding.span);
  }

  // InstrumentDirective name → InstrumentDef's span
  if ((node as { kind: string }).kind === "Instrument") {
    const directive = node as { name: string };
    const inst = findInstrumentDef(ast, directive.name);
    if (inst) return spanToRange(source, inst.span);
  }

  return null;
}

type BestNode = { node: object; kind: string; size: number };

function findNodeAtOffset(ast: Composition, offset: number): { node: object; kind: string } | null {
  let best: BestNode | null = null;
  function visit(node: unknown): void {
    if (!node || typeof node !== "object") return;
    const obj = node as Record<string, unknown>;
    const span = obj.span as SourceSpan | undefined;
    if (span && typeof span.start === "number" && typeof span.end === "number") {
      if (offset >= span.start && offset <= span.end) {
        const size = span.end - span.start;
        const currentBest: BestNode | null = best;
        if (typeof obj.kind === "string" && (!currentBest || size <= currentBest.size)) {
          best = { node: obj, kind: obj.kind, size };
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
  if (!best) return null;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  const r = best as BestNode;
  return { node: r.node, kind: r.kind };
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

function findInstrumentDef(ast: Composition, name: string): InstrumentDef | null {
  function search(nodes: TopLevel[] | undefined): InstrumentDef | null {
    if (!nodes) return null;
    for (const n of nodes) {
      if (n.kind === "InstrumentDef" && n.name === name) return n;
      if (n.kind === "VoiceDecl") {
        const r = search(n.body.body);
        if (r) return r;
      }
    }
    return null;
  }
  return search(ast.body);
}

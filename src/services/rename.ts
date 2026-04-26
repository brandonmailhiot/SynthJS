import type { Composition } from "../ast/nodes.js";
import type { SourceSpan } from "../errors.js";
import { lex } from "../lexer/lexer.js";
import { parse } from "../parser/parser.js";
import type { Range } from "./position.js";

export type TextEdit = {
  range: Range;
  newText: string;
};

export function rename(source: string, offset: number, newName: string): TextEdit[] | null {
  let ast: Composition;
  try {
    ast = parse(lex(source));
  } catch {
    return null;
  }

  const found = findNodeAtOffset(ast, offset);
  if (!found) return null;

  // Identify the symbol name
  let oldName: string | undefined;
  const node = found.node as { kind: string; name?: string };
  if (
    (node.kind === "Binding" ||
      node.kind === "MotifRef" ||
      node.kind === "Call" ||
      node.kind === "InstrumentDef") &&
    typeof node.name === "string"
  ) {
    oldName = node.name;
  }

  if (!oldName) return null;

  if (!isValidIdentifier(newName)) return null;

  const edits: TextEdit[] = [];
  walkAst(ast, (n) => {
    const obj = n as { kind: string; name?: string; span: SourceSpan };
    if (
      (obj.kind === "Binding" ||
        obj.kind === "MotifRef" ||
        obj.kind === "Call" ||
        obj.kind === "InstrumentDef" ||
        obj.kind === "Instrument") &&
      obj.name === oldName
    ) {
      // For these node kinds, the span covers the full node (including args).
      // We need to find the offset of `name` within the source for a precise edit.
      // Heuristic: find oldName at obj.span.start.
      const startPos = findNameOffsetInSpan(source, obj.span, oldName);
      if (startPos !== null) {
        const endPos = startPos + oldName.length;
        edits.push({
          range: {
            start: positionFromOffset(source, startPos),
            end: positionFromOffset(source, endPos),
          },
          newText: newName,
        });
      }
    }
  });

  return edits;
}

function isValidIdentifier(s: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s);
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
  const r = best as BestNode;
  return { node: r.node, kind: r.kind };
}

function walkAst(ast: Composition, cb: (n: object) => void): void {
  function visit(node: unknown): void {
    if (!node || typeof node !== "object") return;
    cb(node as object);
    const obj = node as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
      if (key === "span") continue;
      const v = obj[key];
      if (Array.isArray(v)) for (const item of v) visit(item);
      else if (v && typeof v === "object") visit(v);
    }
  }
  visit(ast);
}

function findNameOffsetInSpan(source: string, span: SourceSpan, name: string): number | null {
  const slice = source.slice(span.start, span.end);
  const idx = slice.indexOf(name);
  if (idx === -1) return null;
  return span.start + idx;
}

function positionFromOffset(source: string, offset: number) {
  let line = 1;
  let col = 1;
  for (let i = 0; i < Math.min(offset, source.length); i++) {
    if (source[i] === "\n") {
      line++;
      col = 1;
    } else col++;
  }
  return { line, column: col };
}

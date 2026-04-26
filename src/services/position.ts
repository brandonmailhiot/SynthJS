import type { SourceSpan } from "../errors.js";

export type Position = { line: number; column: number }; // 1-indexed
export type Range = { start: Position; end: Position };

export function offsetToPosition(source: string, offset: number): Position {
  let line = 1;
  let col = 1;
  const upTo = Math.min(Math.max(0, offset), source.length);
  for (let i = 0; i < upTo; i++) {
    if (source[i] === "\n") {
      line++;
      col = 1;
    } else {
      col++;
    }
  }
  return { line, column: col };
}

export function positionToOffset(source: string, pos: Position): number {
  let line = 1;
  let col = 1;
  for (let i = 0; i < source.length; i++) {
    if (line === pos.line && col === pos.column) return i;
    if (source[i] === "\n") {
      line++;
      col = 1;
    } else {
      col++;
    }
  }
  return source.length;
}

export function spanToRange(source: string, span: SourceSpan): Range {
  return {
    start: { line: span.line, column: span.column },
    end: offsetToPosition(source, span.end),
  };
}

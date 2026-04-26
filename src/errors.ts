export type SourceSpan = {
  start: number;
  end: number;
  line: number;
  column: number;
};

export type Severity = "error" | "warning";

export class LexError extends Error {
  override readonly name = "LexError";
  readonly span: SourceSpan;
  constructor(message: string, span: SourceSpan) {
    super(message);
    this.span = span;
  }
}

export class ParseError extends Error {
  override readonly name = "ParseError";
  readonly span: SourceSpan;
  constructor(message: string, span: SourceSpan) {
    super(message);
    this.span = span;
  }
}

export class ResolveError extends Error {
  override readonly name = "ResolveError";
  readonly span: SourceSpan;
  readonly suggestion: string | undefined;
  constructor(message: string, span: SourceSpan, suggestion?: string) {
    super(message);
    this.span = span;
    this.suggestion = suggestion;
  }
}

export class ValidationError extends Error {
  override readonly name = "ValidationError";
  readonly span: SourceSpan;
  readonly severity: Severity;
  constructor(message: string, span: SourceSpan, severity: Severity = "error") {
    super(message);
    this.span = span;
    this.severity = severity;
  }
}

export type SynthError = LexError | ParseError | ResolveError | ValidationError;

export function formatError(e: SynthError, source: string): string {
  const lines = source.split("\n");
  const lineText = lines[e.span.line - 1] ?? "";
  const caret =
    " ".repeat(Math.max(0, e.span.column - 1)) + "^".repeat(Math.max(1, e.span.end - e.span.start));
  const head = `${e.name}: ${e.message}\n  at line ${e.span.line}, col ${e.span.column}`;
  const snippet = `\n  | ${lineText}\n  | ${caret}`;
  const tail =
    e instanceof ResolveError && e.suggestion !== undefined
      ? `\n  did you mean '${e.suggestion}'?`
      : "";
  return head + snippet + tail;
}

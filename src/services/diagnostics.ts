import { LexError, ParseError, ResolveError, ValidationError } from "../errors.js";
import { compileSync } from "../semantic/pipeline.js";
import { type Range, spanToRange } from "./position.js";

export type DiagnosticSeverity = "error" | "warning" | "info";

export type ServiceDiagnostic = {
  range: Range;
  severity: DiagnosticSeverity;
  message: string;
  source: "synthjs";
  suggestion?: string;
};

export function getDiagnostics(source: string): ServiceDiagnostic[] {
  const diags: ServiceDiagnostic[] = [];
  try {
    const ir = compileSync(source);
    for (const d of ir.diagnostics) {
      diags.push({
        range: spanToRange(source, d.span),
        severity: d.severity,
        message: d.message,
        source: "synthjs",
      });
    }
  } catch (err) {
    if (
      err instanceof LexError ||
      err instanceof ParseError ||
      err instanceof ResolveError ||
      err instanceof ValidationError
    ) {
      const base: ServiceDiagnostic = {
        range: spanToRange(source, err.span),
        severity: "error",
        message: err.message,
        source: "synthjs",
      };
      const suggestion = err instanceof ResolveError ? err.suggestion : undefined;
      diags.push(suggestion !== undefined ? { ...base, suggestion } : base);
    } else {
      diags.push({
        range: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
        severity: "error",
        message: (err as Error).message,
        source: "synthjs",
      });
    }
  }
  return diags;
}

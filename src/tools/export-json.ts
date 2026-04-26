import type { CompositionIR } from "../ir/nodes.js";

export type JsonExportOptions = {
  pretty?: boolean;
  includeSpans?: boolean;
  precision?: number;
};

export function exportJson(ir: CompositionIR, opts: JsonExportOptions = {}): string {
  const pretty = opts.pretty ?? true;
  const includeSpans = opts.includeSpans ?? false;
  const precision = opts.precision ?? 6;

  const cleaned = clean(ir, { includeSpans, precision });
  return pretty ? JSON.stringify(cleaned, null, 2) : JSON.stringify(cleaned);
}

function clean(value: unknown, opts: { includeSpans: boolean; precision: number }): unknown {
  if (typeof value === "number") {
    return Number(value.toFixed(opts.precision));
  }
  if (Array.isArray(value)) return value.map((v) => clean(v, opts));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    const sortedKeys = Object.keys(value).sort();
    for (const k of sortedKeys) {
      if (k === "span" && !opts.includeSpans) continue;
      out[k] = clean((value as Record<string, unknown>)[k], opts);
    }
    return out;
  }
  return value;
}

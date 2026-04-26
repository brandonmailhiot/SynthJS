type ArgKind = "string" | "number" | "int" | "filter_type" | "oversample";

type ParamSpec = {
  name: string;
  kind: ArgKind;
  range?: [number, number];
};

export type EffectSpec = {
  params: ParamSpec[];
};

export const EFFECT_REGISTRY: Record<string, EffectSpec> = {
  gain: { params: [{ name: "level", kind: "number", range: [0, 1] }] },
  reverb: {
    params: [
      { name: "channels", kind: "int" },
      { name: "seconds", kind: "number" },
      { name: "decay", kind: "number" },
    ],
  },
  delay: {
    params: [
      { name: "seconds", kind: "number" },
      { name: "feedback", kind: "number", range: [0, 1] },
    ],
  },
  filter: {
    params: [
      { name: "type", kind: "filter_type" },
      { name: "cutoff", kind: "number" },
      { name: "q", kind: "number" },
    ],
  },
  distortion: {
    params: [
      { name: "amount", kind: "number", range: [0, 100] },
      { name: "oversample", kind: "oversample" },
    ],
  },
  chorus: {
    params: [
      { name: "rate", kind: "number" },
      { name: "depth", kind: "number" },
      { name: "mix", kind: "number" },
    ],
  },
  compressor: {
    params: [
      { name: "threshold", kind: "number" },
      { name: "ratio", kind: "number" },
      { name: "attack", kind: "number" },
      { name: "release", kind: "number" },
    ],
  },
};

const FILTER_TYPES = new Set(["lowpass", "highpass", "bandpass", "notch"]);
const OVERSAMPLES = new Set(["none", "2x", "4x"]);

export function isKnownEffect(name: string): boolean {
  return Object.hasOwn(EFFECT_REGISTRY, name);
}

type EffectArgInput =
  | { kind: "NumberArg"; value: number }
  | { kind: "StringArg"; value: string }
  | { kind: "NamedArg"; name: string; value: EffectArgInput };

export function validateEffectArgs(name: string, args: EffectArgInput[]): string | null {
  const spec = EFFECT_REGISTRY[name];
  if (!spec) return `unknown effect '${name}'`;

  const resolved: (EffectArgInput | null)[] = new Array(spec.params.length).fill(null);
  let positionalIdx = 0;
  for (const arg of args) {
    if (arg.kind === "NamedArg") {
      const idx = spec.params.findIndex((p) => p.name === arg.name);
      if (idx < 0) return `unknown parameter '${arg.name}' for ${name}`;
      resolved[idx] = arg.value;
    } else {
      if (positionalIdx >= spec.params.length) return `too many arguments for ${name}`;
      resolved[positionalIdx++] = arg;
    }
  }

  for (let i = 0; i < spec.params.length; i++) {
    const p = spec.params[i];
    if (!p) continue;
    const got = resolved[i] ?? null;
    if (got === null) return `missing argument '${p.name}' for ${name}`;
    if (p.kind === "filter_type") {
      if (got.kind !== "StringArg" || !FILTER_TYPES.has(got.value)) {
        return `${name}: filter type must be one of ${[...FILTER_TYPES].join(", ")}`;
      }
    } else if (p.kind === "oversample") {
      if (got.kind !== "StringArg" || !OVERSAMPLES.has(got.value)) {
        return `${name}: oversample must be one of ${[...OVERSAMPLES].join(", ")}`;
      }
    } else if (p.kind === "string") {
      if (got.kind !== "StringArg") return `${name}: '${p.name}' expects string`;
    } else if (p.kind === "number" || p.kind === "int") {
      if (got.kind !== "NumberArg") return `${name}: '${p.name}' expects number`;
      if (p.kind === "int" && !Number.isInteger(got.value))
        return `${name}: '${p.name}' expects integer`;
      if (p.range) {
        const [lo, hi] = p.range;
        if (got.value < lo || got.value > hi) {
          return `${name}: '${p.name}' must be in ${lo}..${hi}`;
        }
      }
    }
  }
  return null;
}

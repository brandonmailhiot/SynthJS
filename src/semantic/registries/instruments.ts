const PRIMITIVES = new Set(["sine", "square", "sawtooth", "triangle", "noise", "sample"]);
const ENVELOPES = new Set(["adsr", "linear", "percussive"]);
const FILTERS = new Set(["lowpass", "highpass", "bandpass", "notch"]);

export function isPrimitiveOscillator(s: string): boolean {
  return PRIMITIVES.has(s);
}
export function isEnvelopeName(s: string): boolean {
  return ENVELOPES.has(s);
}
export function isFilterName(s: string): boolean {
  return FILTERS.has(s);
}

type ArgInput =
  | { kind: "NumberArg"; value: number }
  | { kind: "StringArg"; value: string }
  | { kind: "NamedArg"; name: string; value: ArgInput };

const ENV_SPECS: Record<string, { name: string; range?: [number, number] }[]> = {
  adsr: [
    { name: "attack" },
    { name: "decay" },
    { name: "sustain", range: [0, 1] },
    { name: "release" },
  ],
  linear: [{ name: "attack" }, { name: "release" }],
  percussive: [{ name: "attack" }, { name: "decay" }],
};

export function validateEnvelopeCall(name: string, args: ArgInput[]): string | null {
  const spec = ENV_SPECS[name];
  if (!spec) return `unknown envelope '${name}'`;

  const positional: ArgInput[] = [];
  const named: Record<string, ArgInput> = {};
  for (const a of args) {
    if (a.kind === "NamedArg") named[a.name] = a.value;
    else positional.push(a);
  }
  for (let i = 0; i < spec.length; i++) {
    const p = spec[i];
    if (!p) continue;
    const got = named[p.name] ?? positional[i] ?? null;
    if (got === null) return `missing '${p.name}' for envelope ${name}`;
    if (got.kind !== "NumberArg") return `${name}: '${p.name}' expects number`;
    if (p.range) {
      const [lo, hi] = p.range;
      if (got.value < lo || got.value > hi) {
        return `${name}: '${p.name}' must be in ${lo}..${hi}`;
      }
    }
  }
  return null;
}

export function validateFilterCall(name: string, args: ArgInput[]): string | null {
  if (!FILTERS.has(name)) return `unknown filter '${name}'`;
  const positional: ArgInput[] = [];
  for (const a of args) if (a.kind !== "NamedArg") positional.push(a);
  if (positional.length < 2) return `${name}: expects (cutoff, q)`;
  if (positional[0]?.kind !== "NumberArg") return `${name}: cutoff expects number`;
  if (positional[1]?.kind !== "NumberArg") return `${name}: q expects number`;
  return null;
}

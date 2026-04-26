type ArgKind = "string" | "number" | "int";

type ParamSpec = {
  name: string;
  kind: ArgKind;
  range?: [number, number];
};

export type AnnotationSpec = {
  params: ParamSpec[];
  acceptsNamed?: boolean;
};

export const ANNOTATION_REGISTRY: Record<string, AnnotationSpec> = {
  "@section": { params: [{ name: "name", kind: "string" }] },
  "@cue": { params: [{ name: "name", kind: "string" }] },
  "@chance": { params: [{ name: "p", kind: "number", range: [0, 1] }] },
  "@text": { params: [{ name: "s", kind: "string" }] },
  "@vary": {
    params: [
      { name: "timing", kind: "number" },
      { name: "pitch", kind: "number" },
    ],
    acceptsNamed: true,
  },
  "@swing": { params: [{ name: "amount", kind: "number", range: [0, 1] }] },
  "@midi_channel": { params: [{ name: "n", kind: "int", range: [1, 16] }] },
  "@midi_program": { params: [{ name: "n", kind: "int", range: [0, 127] }] },
};

export function isKnownAnnotation(name: string): boolean {
  return Object.hasOwn(ANNOTATION_REGISTRY, name);
}

type AnnotationArgInput =
  | { kind: "NumberArg"; value: number }
  | { kind: "StringArg"; value: string }
  | { kind: "NamedArg"; name: string; value: AnnotationArgInput };

export function validateAnnotationArgs(name: string, args: AnnotationArgInput[]): string | null {
  const spec = ANNOTATION_REGISTRY[name];
  if (!spec) return `unknown annotation '${name}'`;

  const resolved: (AnnotationArgInput | null)[] = new Array(spec.params.length).fill(null);
  let positionalIdx = 0;
  for (const arg of args) {
    if (arg.kind === "NamedArg") {
      if (!spec.acceptsNamed) return `annotation '${name}' does not accept named arguments`;
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
    if (got === null) {
      if (spec.acceptsNamed) continue;
      return `missing argument '${p.name}' for ${name}`;
    }
    if (p.kind === "string" && got.kind !== "StringArg")
      return `${name}: '${p.name}' expects string`;
    if ((p.kind === "number" || p.kind === "int") && got.kind !== "NumberArg")
      return `${name}: '${p.name}' expects number`;
    if (p.kind === "int" && got.kind === "NumberArg" && !Number.isInteger(got.value))
      return `${name}: '${p.name}' expects integer`;
    if (p.range !== undefined && got.kind === "NumberArg") {
      const [lo, hi] = p.range;
      if (got.value < lo || got.value > hi) {
        return `${name}: '${p.name}' must be in ${lo}..${hi}`;
      }
    }
  }
  return null;
}

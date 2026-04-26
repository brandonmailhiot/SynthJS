import { describe, expect, it } from "vitest";
import { EFFECT_REGISTRY, isKnownEffect, validateEffectArgs } from "./effects.js";

describe("EFFECT_REGISTRY", () => {
  it("contains 7 built-ins", () => {
    expect(Object.keys(EFFECT_REGISTRY).sort()).toEqual([
      "chorus",
      "compressor",
      "delay",
      "distortion",
      "filter",
      "gain",
      "reverb",
    ]);
  });
  it("reverb has 3 params", () => {
    const spec = EFFECT_REGISTRY.reverb;
    if (!spec) throw new Error("reverb not in registry");
    expect(spec.params).toHaveLength(3);
  });
});

describe("isKnownEffect", () => {
  it("accepts known", () => {
    expect(isKnownEffect("reverb")).toBe(true);
  });
  it("rejects unknown", () => {
    expect(isKnownEffect("xyz")).toBe(false);
  });
});

describe("validateEffectArgs", () => {
  it("reverb(2, 1, 0.7) ok", () => {
    expect(
      validateEffectArgs("reverb", [
        { kind: "NumberArg", value: 2 },
        { kind: "NumberArg", value: 1 },
        { kind: "NumberArg", value: 0.7 },
      ]),
    ).toBeNull();
  });
  it('filter("lowpass", 2000, 0.7) ok', () => {
    expect(
      validateEffectArgs("filter", [
        { kind: "StringArg", value: "lowpass" },
        { kind: "NumberArg", value: 2000 },
        { kind: "NumberArg", value: 0.7 },
      ]),
    ).toBeNull();
  });
  it("filter with bad type rejects", () => {
    expect(
      validateEffectArgs("filter", [
        { kind: "StringArg", value: "weird" },
        { kind: "NumberArg", value: 2000 },
        { kind: "NumberArg", value: 0.7 },
      ]),
    ).toContain("filter type");
  });
  it("gain(2) out of range", () => {
    expect(validateEffectArgs("gain", [{ kind: "NumberArg", value: 2 }])).toContain("0..1");
  });
  it("named arg form", () => {
    expect(
      validateEffectArgs("reverb", [
        { kind: "NamedArg", name: "seconds", value: { kind: "NumberArg", value: 0.8 } },
        { kind: "NamedArg", name: "channels", value: { kind: "NumberArg", value: 1 } },
        { kind: "NamedArg", name: "decay", value: { kind: "NumberArg", value: 0.95 } },
      ]),
    ).toBeNull();
  });
  it("distortion oversample validation", () => {
    expect(
      validateEffectArgs("distortion", [
        { kind: "NumberArg", value: 15 },
        { kind: "StringArg", value: "8x" },
      ]),
    ).toContain("oversample");
  });
  it("unknown effect", () => {
    expect(validateEffectArgs("xyz", [])).toContain("unknown effect");
  });

  it("too many positional args rejected", () => {
    expect(
      validateEffectArgs("gain", [
        { kind: "NumberArg", value: 0.5 },
        { kind: "NumberArg", value: 0.5 },
      ]),
    ).toContain("too many");
  });

  it("wrong arg type for number param rejected", () => {
    expect(
      validateEffectArgs("gain", [{ kind: "StringArg", value: "loud" }]),
    ).toContain("expects number");
  });

  it("unknown named arg rejected", () => {
    expect(
      validateEffectArgs("gain", [{ kind: "NamedArg", name: "xyz", value: { kind: "NumberArg", value: 0.5 } }]),
    ).toContain("unknown parameter");
  });

  it("missing arg rejected", () => {
    expect(validateEffectArgs("gain", [])).toContain("missing argument");
  });
});

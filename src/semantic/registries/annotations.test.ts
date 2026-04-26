import { describe, expect, it } from "vitest";
import { ANNOTATION_REGISTRY, isKnownAnnotation, validateAnnotationArgs } from "./annotations.js";

describe("ANNOTATION_REGISTRY", () => {
  it("contains all 8 built-ins", () => {
    const names = Object.keys(ANNOTATION_REGISTRY).sort();
    expect(names).toEqual([
      "@chance",
      "@cue",
      "@midi_channel",
      "@midi_program",
      "@section",
      "@swing",
      "@text",
      "@vary",
    ]);
  });

  it("has spec for @cue", () => {
    const spec = ANNOTATION_REGISTRY["@cue"];
    if (!spec) throw new Error("@cue not in registry");
    expect(spec.params).toHaveLength(1);
    expect(spec.params[0]?.name).toBe("name");
    expect(spec.params[0]?.kind).toBe("string");
  });
});

describe("isKnownAnnotation", () => {
  it("accepts known", () => {
    expect(isKnownAnnotation("@cue")).toBe(true);
  });
  it("rejects unknown", () => {
    expect(isKnownAnnotation("@unknown")).toBe(false);
  });
});

describe("validateAnnotationArgs", () => {
  it("@chance(0.7) ok", () => {
    expect(validateAnnotationArgs("@chance", [{ kind: "NumberArg", value: 0.7 }])).toBeNull();
  });
  it("@chance(2) out of range", () => {
    expect(validateAnnotationArgs("@chance", [{ kind: "NumberArg", value: 2 }])).toContain("0..1");
  });
  it('@cue("hit") ok', () => {
    expect(validateAnnotationArgs("@cue", [{ kind: "StringArg", value: "hit" }])).toBeNull();
  });
  it("@cue(123) wrong kind", () => {
    expect(validateAnnotationArgs("@cue", [{ kind: "NumberArg", value: 123 }])).toContain("string");
  });
  it("@vary(timing: 5, pitch: 3) ok with named args", () => {
    expect(
      validateAnnotationArgs("@vary", [
        { kind: "NamedArg", name: "timing", value: { kind: "NumberArg", value: 5 } },
        { kind: "NamedArg", name: "pitch", value: { kind: "NumberArg", value: 3 } },
      ]),
    ).toBeNull();
  });
  it("@midi_channel(1) ok", () => {
    expect(validateAnnotationArgs("@midi_channel", [{ kind: "NumberArg", value: 1 }])).toBeNull();
  });
  it("@midi_channel(0) out of range", () => {
    expect(validateAnnotationArgs("@midi_channel", [{ kind: "NumberArg", value: 0 }])).toContain(
      "1..16",
    );
  });
  it("@midi_program with non-int rejects", () => {
    expect(validateAnnotationArgs("@midi_program", [{ kind: "NumberArg", value: 56.5 }])).toContain(
      "integer",
    );
  });
  it("unknown annotation returns error", () => {
    expect(validateAnnotationArgs("@unknown", [])).toContain("unknown annotation");
  });
});

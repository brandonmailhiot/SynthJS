import { describe, expect, it } from "vitest";
import {
  isEnvelopeName,
  isFilterName,
  isPrimitiveOscillator,
  validateEnvelopeCall,
  validateFilterCall,
} from "./instruments.js";

describe("isPrimitiveOscillator", () => {
  it("accepts the four primitives", () => {
    for (const o of ["sine", "square", "sawtooth", "triangle"]) {
      expect(isPrimitiveOscillator(o)).toBe(true);
    }
  });
  it("rejects unknown", () => {
    expect(isPrimitiveOscillator("noise")).toBe(false);
  });
});

describe("isEnvelopeName / isFilterName", () => {
  it("envelope names", () => {
    expect(isEnvelopeName("adsr")).toBe(true);
    expect(isEnvelopeName("xyz")).toBe(false);
  });
  it("filter names", () => {
    expect(isFilterName("lowpass")).toBe(true);
    expect(isFilterName("xyz")).toBe(false);
  });
});

describe("envelope validation", () => {
  it("adsr(0.01, 0.1, 0.7, 0.3) ok", () => {
    expect(
      validateEnvelopeCall("adsr", [
        { kind: "NumberArg", value: 0.01 },
        { kind: "NumberArg", value: 0.1 },
        { kind: "NumberArg", value: 0.7 },
        { kind: "NumberArg", value: 0.3 },
      ]),
    ).toBeNull();
  });
  it("linear(0.05, 0.1) ok", () => {
    expect(
      validateEnvelopeCall("linear", [
        { kind: "NumberArg", value: 0.05 },
        { kind: "NumberArg", value: 0.1 },
      ]),
    ).toBeNull();
  });
  it("percussive(0.01, 0.1) ok", () => {
    expect(
      validateEnvelopeCall("percussive", [
        { kind: "NumberArg", value: 0.01 },
        { kind: "NumberArg", value: 0.1 },
      ]),
    ).toBeNull();
  });
  it("adsr with sustain > 1 rejects", () => {
    expect(
      validateEnvelopeCall("adsr", [
        { kind: "NumberArg", value: 0.01 },
        { kind: "NumberArg", value: 0.1 },
        { kind: "NumberArg", value: 1.5 },
        { kind: "NumberArg", value: 0.3 },
      ]),
    ).toContain("0..1");
  });
  it("named args for adsr", () => {
    expect(
      validateEnvelopeCall("adsr", [
        { kind: "NamedArg", name: "attack", value: { kind: "NumberArg", value: 0.01 } },
        { kind: "NamedArg", name: "decay", value: { kind: "NumberArg", value: 0.1 } },
        { kind: "NamedArg", name: "sustain", value: { kind: "NumberArg", value: 0.7 } },
        { kind: "NamedArg", name: "release", value: { kind: "NumberArg", value: 0.3 } },
      ]),
    ).toBeNull();
  });
  it("unknown envelope kind", () => {
    expect(validateEnvelopeCall("xyz", [])).toContain("unknown envelope");
  });
});

describe("filter validation", () => {
  it("lowpass(2000, 0.7) ok", () => {
    expect(
      validateFilterCall("lowpass", [
        { kind: "NumberArg", value: 2000 },
        { kind: "NumberArg", value: 0.7 },
      ]),
    ).toBeNull();
  });
  it("unknown filter", () => {
    expect(validateFilterCall("xyz", [])).toContain("unknown filter");
  });
});

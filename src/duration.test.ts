import { describe, expect, it } from "vitest";
import { isValidDurationDivisor, parseDuration } from "./duration.js";

describe("parseDuration", () => {
  it("parses whole note", () => {
    expect(parseDuration("1")).toBeCloseTo(1, 6);
  });
  it("parses half note", () => {
    expect(parseDuration("2")).toBeCloseTo(0.5, 6);
  });
  it("parses quarter", () => {
    expect(parseDuration("4")).toBeCloseTo(0.25, 6);
  });
  it("parses eighth", () => {
    expect(parseDuration("8")).toBeCloseTo(0.125, 6);
  });
  it("parses sixteenth", () => {
    expect(parseDuration("16")).toBeCloseTo(0.0625, 6);
  });
  it("parses sixty-fourth", () => {
    expect(parseDuration("64")).toBeCloseTo(1 / 64, 6);
  });

  it("parses dotted quarter", () => {
    expect(parseDuration("4.")).toBeCloseTo(0.25 + 0.125, 6);
  });
  it("parses double-dotted quarter", () => {
    expect(parseDuration("4..")).toBeCloseTo(0.25 + 0.125 + 0.0625, 6);
  });
  it("parses dotted whole", () => {
    expect(parseDuration("1.")).toBeCloseTo(1 + 0.5, 6);
  });

  it("parses quarter triplet", () => {
    expect(parseDuration("4t")).toBeCloseTo(0.25 * (2 / 3), 6);
  });
  it("parses eighth triplet", () => {
    expect(parseDuration("8t")).toBeCloseTo(0.125 * (2 / 3), 6);
  });

  it("parses dotted-triplet (4.t)", () => {
    expect(parseDuration("4.t")).toBeCloseTo((0.25 + 0.125) * (2 / 3), 6);
  });

  it("returns null for non-power-of-two divisors", () => {
    expect(parseDuration("3")).toBeNull();
    expect(parseDuration("5")).toBeNull();
    expect(parseDuration("7")).toBeNull();
  });

  it("returns null for malformed", () => {
    expect(parseDuration("")).toBeNull();
    expect(parseDuration("4x")).toBeNull();
    expect(parseDuration("a")).toBeNull();
    expect(parseDuration(".")).toBeNull();
    expect(parseDuration("t")).toBeNull();
  });
});

describe("isValidDurationDivisor", () => {
  it("accepts powers of 2 from 1 to 64", () => {
    for (const n of [1, 2, 4, 8, 16, 32, 64]) {
      expect(isValidDurationDivisor(n)).toBe(true);
    }
  });
  it("rejects non-powers", () => {
    expect(isValidDurationDivisor(0)).toBe(false);
    expect(isValidDurationDivisor(3)).toBe(false);
    expect(isValidDurationDivisor(128)).toBe(false);
  });
});

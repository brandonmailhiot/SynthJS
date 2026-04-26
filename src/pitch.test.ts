import { describe, expect, it } from "vitest";
import {
  type Accidental,
  type NoteLetter,
  computeFrequency,
  isNoteLetter,
  parsePitchString,
} from "./pitch.js";

describe("computeFrequency", () => {
  it("a4 = 440 Hz", () => {
    expect(computeFrequency({ letter: "a", accidental: null, octave: 4, cents: 0 })).toBeCloseTo(
      440,
      4,
    );
  });

  it("c4 ≈ 261.63 Hz", () => {
    expect(computeFrequency({ letter: "c", accidental: null, octave: 4, cents: 0 })).toBeCloseTo(
      261.626,
      2,
    );
  });

  it("a5 = 880 Hz", () => {
    expect(computeFrequency({ letter: "a", accidental: null, octave: 5, cents: 0 })).toBeCloseTo(
      880,
      4,
    );
  });

  it("a3 = 220 Hz", () => {
    expect(computeFrequency({ letter: "a", accidental: null, octave: 3, cents: 0 })).toBeCloseTo(
      220,
      4,
    );
  });

  it("c#4 ≈ 277.18 Hz", () => {
    expect(computeFrequency({ letter: "c", accidental: "#", octave: 4, cents: 0 })).toBeCloseTo(
      277.183,
      2,
    );
  });

  it("cb4 ≈ b3 frequency", () => {
    const cb4 = computeFrequency({ letter: "c", accidental: "b", octave: 4, cents: 0 });
    const b3 = computeFrequency({ letter: "b", accidental: null, octave: 3, cents: 0 });
    expect(cb4).toBeCloseTo(b3, 4);
  });

  it("c##4 ≈ d4 frequency", () => {
    const cs2 = computeFrequency({ letter: "c", accidental: "##", octave: 4, cents: 0 });
    const d4 = computeFrequency({ letter: "d", accidental: null, octave: 4, cents: 0 });
    expect(cs2).toBeCloseTo(d4, 4);
  });

  it("dbb4 ≈ c4 frequency", () => {
    const dbb4 = computeFrequency({ letter: "d", accidental: "bb", octave: 4, cents: 0 });
    const c4 = computeFrequency({ letter: "c", accidental: null, octave: 4, cents: 0 });
    expect(dbb4).toBeCloseTo(c4, 4);
  });

  it("natural matches no-accidental", () => {
    const cn4 = computeFrequency({ letter: "c", accidental: "n", octave: 4, cents: 0 });
    const c4 = computeFrequency({ letter: "c", accidental: null, octave: 4, cents: 0 });
    expect(cn4).toBeCloseTo(c4, 4);
  });

  it("a4+15c is detuned up 15 cents", () => {
    const detuned = computeFrequency({ letter: "a", accidental: null, octave: 4, cents: 15 });
    const expected = 440 * 2 ** (15 / 1200);
    expect(detuned).toBeCloseTo(expected, 4);
  });

  it("a4-7c is detuned down 7 cents", () => {
    const detuned = computeFrequency({ letter: "a", accidental: null, octave: 4, cents: -7 });
    const expected = 440 * 2 ** (-7 / 1200);
    expect(detuned).toBeCloseTo(expected, 4);
  });

  it("covers octaves 0..9", () => {
    for (let o = 0; o <= 9; o++) {
      const f = computeFrequency({ letter: "a", accidental: null, octave: o, cents: 0 });
      expect(Number.isFinite(f)).toBe(true);
      expect(f).toBeGreaterThan(0);
    }
  });
});

describe("isNoteLetter", () => {
  it("accepts a..g", () => {
    for (const c of ["a", "b", "c", "d", "e", "f", "g"]) {
      expect(isNoteLetter(c)).toBe(true);
    }
  });
  it("rejects others", () => {
    expect(isNoteLetter("h")).toBe(false);
    expect(isNoteLetter("A")).toBe(false);
    expect(isNoteLetter("4")).toBe(false);
    expect(isNoteLetter("")).toBe(false);
  });
});

describe("parsePitchString", () => {
  it("parses a4", () => {
    expect(parsePitchString("a4")).toEqual({
      letter: "a",
      accidental: null,
      octave: 4,
      cents: 0,
    });
  });
  it("parses c#5", () => {
    expect(parsePitchString("c#5")).toEqual({
      letter: "c",
      accidental: "#",
      octave: 5,
      cents: 0,
    });
  });
  it("parses cb4", () => {
    expect(parsePitchString("cb4")).toEqual({
      letter: "c",
      accidental: "b",
      octave: 4,
      cents: 0,
    });
  });
  it("parses c##4", () => {
    expect(parsePitchString("c##4")).toEqual({
      letter: "c",
      accidental: "##",
      octave: 4,
      cents: 0,
    });
  });
  it("parses cbb4", () => {
    expect(parsePitchString("cbb4")).toEqual({
      letter: "c",
      accidental: "bb",
      octave: 4,
      cents: 0,
    });
  });
  it("parses cn4", () => {
    expect(parsePitchString("cn4")).toEqual({
      letter: "c",
      accidental: "n",
      octave: 4,
      cents: 0,
    });
  });
  it("parses a4+15c (cent offset)", () => {
    expect(parsePitchString("a4+15c")).toEqual({
      letter: "a",
      accidental: null,
      octave: 4,
      cents: 15,
    });
  });
  it("parses a4-7c", () => {
    expect(parsePitchString("a4-7c")).toEqual({
      letter: "a",
      accidental: null,
      octave: 4,
      cents: -7,
    });
  });
  it("returns null for non-pitch", () => {
    expect(parsePitchString("xyz")).toBeNull();
    expect(parsePitchString("a")).toBeNull(); // octave required
    expect(parsePitchString("h4")).toBeNull(); // h not a letter
  });
});

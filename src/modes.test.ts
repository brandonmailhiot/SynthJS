import { describe, expect, it } from "vitest";
import { MODES, type Mode, isMode, modeIntervals } from "./modes.js";

describe("MODES", () => {
  it("has all seven modes", () => {
    const names: Mode[] = [
      "major",
      "minor",
      "dorian",
      "phrygian",
      "lydian",
      "mixolydian",
      "locrian",
    ];
    for (const m of names) {
      expect(MODES[m]).toBeDefined();
      expect(MODES[m]).toHaveLength(7);
    }
  });

  it("major has expected intervals", () => {
    expect(MODES.major).toEqual([0, 2, 4, 5, 7, 9, 11]);
  });

  it("minor has expected intervals", () => {
    expect(MODES.minor).toEqual([0, 2, 3, 5, 7, 8, 10]);
  });

  it("dorian has expected intervals", () => {
    expect(MODES.dorian).toEqual([0, 2, 3, 5, 7, 9, 10]);
  });

  it("phrygian has expected intervals", () => {
    expect(MODES.phrygian).toEqual([0, 1, 3, 5, 7, 8, 10]);
  });

  it("lydian has expected intervals", () => {
    expect(MODES.lydian).toEqual([0, 2, 4, 6, 7, 9, 11]);
  });

  it("mixolydian has expected intervals", () => {
    expect(MODES.mixolydian).toEqual([0, 2, 4, 5, 7, 9, 10]);
  });

  it("locrian has expected intervals", () => {
    expect(MODES.locrian).toEqual([0, 1, 3, 5, 6, 8, 10]);
  });
});

describe("isMode", () => {
  it("accepts known modes", () => {
    expect(isMode("major")).toBe(true);
    expect(isMode("dorian")).toBe(true);
  });
  it("rejects unknown", () => {
    expect(isMode("ionian")).toBe(false);
    expect(isMode("")).toBe(false);
  });
});

describe("modeIntervals", () => {
  it("returns intervals for a known mode", () => {
    expect(modeIntervals("major")).toEqual([0, 2, 4, 5, 7, 9, 11]);
  });
});

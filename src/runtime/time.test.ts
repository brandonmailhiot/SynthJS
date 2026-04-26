import { describe, expect, it } from "vitest";
import { beatsToSeconds } from "./time.js";

describe("beatsToSeconds", () => {
  it("0.25 (quarter) at tempo 60 = 1 sec", () => {
    expect(beatsToSeconds(0.25, 60)).toBeCloseTo(1.0);
  });
  it("0.25 at tempo 120 = 0.5 sec", () => {
    expect(beatsToSeconds(0.25, 120)).toBeCloseTo(0.5);
  });
  it("1.0 (whole) at tempo 60 = 4 sec", () => {
    expect(beatsToSeconds(1.0, 60)).toBeCloseTo(4.0);
  });
  it("0 beats = 0 sec", () => {
    expect(beatsToSeconds(0, 120)).toBe(0);
  });
  it("0.125 (eighth) at 60 = 0.5 sec", () => {
    expect(beatsToSeconds(0.125, 60)).toBeCloseTo(0.5);
  });
  it("zero tempo throws", () => {
    expect(() => beatsToSeconds(0.25, 0)).toThrow(RangeError);
  });
});

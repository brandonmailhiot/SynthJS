import { describe, expect, it } from "vitest";
import { applyArticulation } from "./articulation.js";

describe("applyArticulation", () => {
  it("empty marks → no adjustment", () => {
    expect(applyArticulation([], 1.0)).toEqual({ playDuration: 1.0, gainBoost: 1.0 });
  });
  it("staccato halves playDuration", () => {
    expect(applyArticulation(["."], 1.0)).toEqual({ playDuration: 0.5, gainBoost: 1.0 });
  });
  it("tenuto keeps full duration", () => {
    expect(applyArticulation(["_"], 1.0)).toEqual({ playDuration: 1.0, gainBoost: 1.0 });
  });
  it("accent boosts gain", () => {
    expect(applyArticulation([">"], 1.0)).toEqual({ playDuration: 1.0, gainBoost: 1.2 });
  });
  it("marcato shortens and boosts", () => {
    const r = applyArticulation(["^"], 1.0);
    expect(r.playDuration).toBeCloseTo(0.6);
    expect(r.gainBoost).toBeCloseTo(1.3);
  });
  it("staccato + accent combines", () => {
    const r = applyArticulation([".", ">"], 1.0);
    expect(r.playDuration).toBeCloseTo(0.5);
    expect(r.gainBoost).toBeCloseTo(1.2);
  });
  it("tenuto + accent combines", () => {
    const r = applyArticulation(["_", ">"], 1.0);
    expect(r.playDuration).toBeCloseTo(1.0);
    expect(r.gainBoost).toBeCloseTo(1.2);
  });
  it("scales with baseDuration", () => {
    expect(applyArticulation(["."], 2.0).playDuration).toBeCloseTo(1.0);
  });
});

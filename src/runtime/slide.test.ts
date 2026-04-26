import { describe, expect, it } from "vitest";
import { MockAudioContext } from "./mock-audio-context.js";
import { applySlide } from "./slide.js";

describe("applySlide", () => {
  it("sets start frequency at start time", () => {
    const ctx = new MockAudioContext();
    const osc = ctx.createOscillator();
    applySlide(osc.frequency, 220, 440, 0.5, 1.0);
    const hist = (osc.frequency as unknown as { history: unknown[] }).history;
    expect(hist[0]).toEqual({
      method: "param",
      name: "frequency",
      op: "setValueAtTime",
      value: 220,
      time: 0.5,
    });
  });

  it("ramps to target at start + duration", () => {
    const ctx = new MockAudioContext();
    const osc = ctx.createOscillator();
    applySlide(osc.frequency, 220, 440, 0.5, 1.0);
    const hist = (osc.frequency as unknown as { history: unknown[] }).history;
    expect(hist[1]).toEqual({
      method: "param",
      name: "frequency",
      op: "linearRampToValueAtTime",
      value: 440,
      time: 1.5,
    });
  });

  it("zero duration: target ramp time equals start time", () => {
    const ctx = new MockAudioContext();
    const osc = ctx.createOscillator();
    applySlide(osc.frequency, 220, 440, 1.0, 0);
    const hist = (osc.frequency as unknown as { history: unknown[] }).history;
    expect(hist[1]).toMatchObject({ time: 1.0 });
  });

  it("downward slide", () => {
    const ctx = new MockAudioContext();
    const osc = ctx.createOscillator();
    applySlide(osc.frequency, 880, 220, 0, 0.5);
    const hist = (osc.frequency as unknown as { history: unknown[] }).history;
    expect(hist[1]).toMatchObject({ value: 220 });
  });

  it("issues exactly two scheduling calls", () => {
    const ctx = new MockAudioContext();
    const osc = ctx.createOscillator();
    applySlide(osc.frequency, 100, 200, 0, 1);
    const hist = (osc.frequency as unknown as { history: unknown[] }).history;
    expect(hist).toHaveLength(2);
  });
});

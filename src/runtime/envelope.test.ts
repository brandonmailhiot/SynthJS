import { describe, expect, it } from "vitest";
import { buildEnvelope } from "./envelope.js";
import { MockAudioContext } from "./mock-audio-context.js";

describe("buildEnvelope — default (undefined)", () => {
  it("applies default ADSR when spec is undefined", () => {
    const ctx = new MockAudioContext();
    const rig = buildEnvelope(ctx, undefined, 1.0, 1.0, 0.5);
    const hist = (
      rig.input.gain as unknown as { history: { op: string; value: number; time?: number }[] }
    ).history;
    // Should have at least: setValueAtTime(0, t0), linearRamp to peak, linearRamp to sustain, setValueAtTime sustain (release start), linearRamp to 0
    expect(hist.length).toBeGreaterThan(2);
    expect(hist[0]).toMatchObject({ op: "setValueAtTime", value: 0, time: 1.0 });
    // peakGain = 0.5; sustain in default = 1.0 → peak * sustain = 0.5
    const peakRamp = hist.find((h) => h.op === "linearRampToValueAtTime" && h.value === 0.5);
    expect(peakRamp).toBeDefined();
  });
});

describe("buildEnvelope — ADSR", () => {
  it("schedules attack ramp to peakGain", () => {
    const ctx = new MockAudioContext();
    const rig = buildEnvelope(ctx, { kind: "adsr", args: [0.1, 0.1, 0.7, 0.1] }, 0, 1, 0.8);
    const hist = (
      rig.input.gain as unknown as { history: { op: string; value: number; time?: number }[] }
    ).history;
    expect(hist).toContainEqual({
      method: "param",
      name: "gain",
      op: "linearRampToValueAtTime",
      value: 0.8,
      time: 0.1,
    });
  });

  it("schedules decay to sustain level", () => {
    const ctx = new MockAudioContext();
    const rig = buildEnvelope(ctx, { kind: "adsr", args: [0.1, 0.1, 0.7, 0.1] }, 0, 1, 1.0);
    const hist = (
      rig.input.gain as unknown as { history: { op: string; value: number; time?: number }[] }
    ).history;
    expect(hist).toContainEqual({
      method: "param",
      name: "gain",
      op: "linearRampToValueAtTime",
      value: 0.7,
      time: 0.2,
    });
  });

  it("schedules release to 0 at end", () => {
    const ctx = new MockAudioContext();
    const rig = buildEnvelope(ctx, { kind: "adsr", args: [0.1, 0.1, 0.7, 0.1] }, 0, 1, 1.0);
    const hist = (
      rig.input.gain as unknown as { history: { op: string; value: number; time?: number }[] }
    ).history;
    expect(hist).toContainEqual({
      method: "param",
      name: "gain",
      op: "linearRampToValueAtTime",
      value: 0,
      time: 1,
    });
  });

  it("clips attack when longer than duration", () => {
    const ctx = new MockAudioContext();
    const rig = buildEnvelope(ctx, { kind: "adsr", args: [2, 0.1, 0.7, 0.1] }, 0, 0.5, 1.0);
    const hist = (
      rig.input.gain as unknown as { history: { op: string; value: number; time?: number }[] }
    ).history;
    // Attack should clip at startTime + duration = 0.5
    const attackRamp = hist.find((h) => h.op === "linearRampToValueAtTime" && h.value === 1.0);
    expect(attackRamp?.time).toBe(0.5);
  });
});

describe("buildEnvelope — linear", () => {
  it("schedules attack and release only", () => {
    const ctx = new MockAudioContext();
    const rig = buildEnvelope(ctx, { kind: "linear", args: [0.1, 0.1] }, 0, 1, 0.8);
    const hist = (rig.input.gain as unknown as { history: { op: string; value: number }[] })
      .history;
    const peakRamp = hist.find((h) => h.op === "linearRampToValueAtTime" && h.value === 0.8);
    expect(peakRamp).toBeDefined();
    const releaseRamp = hist.find((h) => h.op === "linearRampToValueAtTime" && h.value === 0);
    expect(releaseRamp).toBeDefined();
  });
});

describe("buildEnvelope — percussive", () => {
  it("schedules exponential decay", () => {
    const ctx = new MockAudioContext();
    const rig = buildEnvelope(ctx, { kind: "percussive", args: [0.005, 0.2] }, 0, 1, 1.0);
    const hist = (rig.input.gain as unknown as { history: { op: string; value: number }[] })
      .history;
    const expDecay = hist.find((h) => h.op === "exponentialRampToValueAtTime");
    expect(expDecay).toBeDefined();
  });
});

describe("buildEnvelope — input/output identity", () => {
  it("returns same gain node for input and output", () => {
    const ctx = new MockAudioContext();
    const rig = buildEnvelope(ctx, undefined, 0, 1, 1);
    expect(rig.input).toBe(rig.output);
  });
});

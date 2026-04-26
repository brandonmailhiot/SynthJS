import { describe, expect, it } from "vitest";
import type { InstrumentSpec, OscillatorLayer } from "../ir/nodes.js";
import { MockAudioContext } from "./mock-audio-context.js";
import { buildOscillator } from "./oscillator.js";

const baseInstrument = (over: Partial<InstrumentSpec> = {}): InstrumentSpec => ({
  name: "sine",
  oscillators: [{ kind: "sine" }],
  filters: [],
  ...over,
});

const layer = (kind: OscillatorLayer["kind"], detune?: number): OscillatorLayer =>
  detune !== undefined ? { kind, detune } : { kind };

describe("buildOscillator — single layer", () => {
  it("sets oscillator type from instrument", () => {
    const ctx = new MockAudioContext();
    const rig = buildOscillator(ctx, baseInstrument({ oscillators: [{ kind: "sawtooth" }] }), 440);
    // First-created oscillator on the context records its type.
    const sawHistory = ctx.history.filter(
      (h) => h.method === "createOscillator" && (h.result as { type?: string }).type === "sawtooth",
    );
    expect(sawHistory.length).toBe(1);
  });

  it("sets frequency.value on tonal layer", () => {
    const ctx = new MockAudioContext();
    buildOscillator(ctx, baseInstrument(), 261.626);
    const oscRec = ctx.history.find((h) => h.method === "createOscillator");
    expect((oscRec?.result as { frequency: { value: number } }).frequency.value).toBeCloseTo(
      261.626,
    );
  });

  it("output equals summing gain when no filter", () => {
    const ctx = new MockAudioContext();
    const rig = buildOscillator(ctx, baseInstrument(), 440);
    // With single layer + no filter, output is the summing GainNode (not the raw osc).
    const gainCalls = ctx.history.filter((h) => h.method === "createGain");
    expect(gainCalls.length).toBeGreaterThan(0);
    expect(rig.output).toBe(gainCalls[0]?.result);
  });

  it("applies instrument-level detune to layer", () => {
    const ctx = new MockAudioContext();
    buildOscillator(ctx, baseInstrument({ detune: 5 }), 440);
    const oscRec = ctx.history.find((h) => h.method === "createOscillator");
    const hist = (
      (oscRec?.result as { detune: unknown }).detune as unknown as { history: unknown[] }
    ).history;
    expect(hist).toContainEqual({
      method: "param",
      name: "detune",
      op: "setValueAtTime",
      value: 5,
      time: 0,
    });
  });

  it("skips detune setValueAtTime when total detune is zero", () => {
    const ctx = new MockAudioContext();
    buildOscillator(ctx, baseInstrument({ detune: 0 }), 440);
    const oscRec = ctx.history.find((h) => h.method === "createOscillator");
    const hist = (
      (oscRec?.result as { detune: unknown }).detune as unknown as { history: unknown[] }
    ).history;
    expect(hist).toHaveLength(0);
  });

  it("inserts BiquadFilter when filter present", () => {
    const ctx = new MockAudioContext();
    const rig = buildOscillator(
      ctx,
      baseInstrument({ filters: [{ type: "lowpass", cutoff: 2000, q: 0.7 }] }),
      440,
    );
    expect(ctx.history.some((h) => h.method === "createBiquadFilter")).toBe(true);
    const filterRec = ctx.history.find((h) => h.method === "createBiquadFilter");
    expect(rig.output).toBe(filterRec?.result);
  });

  it("filter type/cutoff/q applied", () => {
    const ctx = new MockAudioContext();
    buildOscillator(
      ctx,
      baseInstrument({ filters: [{ type: "highpass", cutoff: 800, q: 1.5 }] }),
      440,
    );
    const filterRec = ctx.history.find((h) => h.method === "createBiquadFilter");
    const filter = filterRec?.result as {
      type: string;
      frequency: { value: number };
      Q: { value: number };
    };
    expect(filter.type).toBe("highpass");
    expect(filter.frequency.value).toBe(800);
    expect(filter.Q.value).toBe(1.5);
  });
});

describe("buildOscillator — filter chain", () => {
  it("two filters compose source -> f1 -> f2", () => {
    const ctx = new MockAudioContext();
    const rig = buildOscillator(
      ctx,
      baseInstrument({
        filters: [
          { type: "highpass", cutoff: 500, q: 0.7 },
          { type: "lowpass", cutoff: 5000, q: 0.7 },
        ],
      }),
      440,
    );
    const filterRecs = ctx.history.filter((h) => h.method === "createBiquadFilter");
    expect(filterRecs).toHaveLength(2);
    // The output is the *last* filter in the chain.
    expect(rig.output).toBe(filterRecs[1]?.result);
  });

  it("three filters chain in declared order", () => {
    const ctx = new MockAudioContext();
    const rig = buildOscillator(
      ctx,
      baseInstrument({
        filters: [
          { type: "highpass", cutoff: 200, q: 0.7 },
          { type: "bandpass", cutoff: 1500, q: 1.0 },
          { type: "lowpass", cutoff: 8000, q: 0.7 },
        ],
      }),
      440,
    );
    const filterRecs = ctx.history.filter((h) => h.method === "createBiquadFilter");
    expect(filterRecs).toHaveLength(3);
    expect(rig.output).toBe(filterRecs[2]?.result);
  });
});

describe("buildOscillator — oscillator stack", () => {
  it("creates one oscillator node per layer", () => {
    const ctx = new MockAudioContext();
    buildOscillator(
      ctx,
      baseInstrument({
        oscillators: [
          { kind: "sawtooth", detune: -7 },
          { kind: "sawtooth" },
          { kind: "sawtooth", detune: 7 },
        ],
      }),
      440,
    );
    const oscRecs = ctx.history.filter((h) => h.method === "createOscillator");
    expect(oscRecs).toHaveLength(3);
  });

  it("applies per-layer detune (combined with instrument detune)", () => {
    const ctx = new MockAudioContext();
    buildOscillator(
      ctx,
      baseInstrument({
        detune: 10,
        oscillators: [
          { kind: "sawtooth", detune: -7 },
          { kind: "sawtooth", detune: 7 },
        ],
      }),
      440,
    );
    const oscRecs = ctx.history.filter((h) => h.method === "createOscillator");
    const detune0 = (
      (oscRecs[0]?.result as { detune: unknown }).detune as unknown as {
        history: { value: number }[];
      }
    ).history[0]?.value;
    const detune1 = (
      (oscRecs[1]?.result as { detune: unknown }).detune as unknown as {
        history: { value: number }[];
      }
    ).history[0]?.value;
    expect(detune0).toBe(3); // 10 + (-7)
    expect(detune1).toBe(17); // 10 + 7
  });

  it("equal-power normalization: summing gain = 1/sqrt(N)", () => {
    const ctx = new MockAudioContext();
    buildOscillator(
      ctx,
      baseInstrument({
        oscillators: [layer("sawtooth"), layer("sawtooth"), layer("sawtooth"), layer("sawtooth")],
      }),
      440,
    );
    const summing = ctx.history.find((h) => h.method === "createGain")?.result as {
      gain: { value: number };
    };
    expect(summing.gain.value).toBeCloseTo(0.5); // 1/sqrt(4)
  });

  it("mixed pitched + noise stack works", () => {
    const ctx = new MockAudioContext();
    const rig = buildOscillator(
      ctx,
      baseInstrument({
        oscillators: [layer("sawtooth"), layer("noise")],
      }),
      440,
    );
    expect(rig.isNoise).toBe(false); // not all-noise
    expect(rig.frequencies).toHaveLength(1); // only the saw layer is tonal
  });

  it("all-noise stack reports isNoise=true", () => {
    const ctx = new MockAudioContext();
    const rig = buildOscillator(
      ctx,
      baseInstrument({ oscillators: [layer("noise"), layer("noise")] }),
      440,
    );
    expect(rig.isNoise).toBe(true);
    expect(rig.frequencies).toHaveLength(0);
  });

  it("stack feeds filter chain", () => {
    const ctx = new MockAudioContext();
    const rig = buildOscillator(
      ctx,
      baseInstrument({
        oscillators: [layer("sawtooth"), layer("sawtooth", 7)],
        filters: [
          { type: "highpass", cutoff: 500, q: 0.7 },
          { type: "lowpass", cutoff: 5000, q: 0.7 },
        ],
      }),
      440,
    );
    const filterRecs = ctx.history.filter((h) => h.method === "createBiquadFilter");
    expect(filterRecs).toHaveLength(2);
    expect(rig.output).toBe(filterRecs[1]?.result);
  });

  it("per-layer envelope inserts a Gain node between layer and sum", () => {
    const ctx = new MockAudioContext();
    buildOscillator(
      ctx,
      baseInstrument({
        oscillators: [
          { kind: "sine" },
          { kind: "noise", envelope: { kind: "percussive", args: [0.001, 0.005] } },
        ],
      }),
      440,
      0,
      0.5,
    );
    // One summing gain (always) + one per-layer envelope gain = 2 createGain calls.
    const gainCalls = ctx.history.filter((h) => h.method === "createGain");
    expect(gainCalls).toHaveLength(2);
  });

  it("layer without envelope connects directly to summing gain", () => {
    const ctx = new MockAudioContext();
    buildOscillator(
      ctx,
      baseInstrument({ oscillators: [layer("sawtooth"), layer("sawtooth")] }),
      440,
    );
    // Only the summing gain — no per-layer envelopes.
    const gainCalls = ctx.history.filter((h) => h.method === "createGain");
    expect(gainCalls).toHaveLength(1);
  });
});

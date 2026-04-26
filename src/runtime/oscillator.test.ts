import { describe, expect, it } from "vitest";
import type { InstrumentSpec } from "../ir/nodes.js";
import { MockAudioContext } from "./mock-audio-context.js";
import { buildOscillator } from "./oscillator.js";

const baseInstrument = (over: Partial<InstrumentSpec> = {}): InstrumentSpec => ({
  name: "sine",
  oscillator: "sine",
  ...over,
});

describe("buildOscillator", () => {
  it("sets oscillator type from instrument", () => {
    const ctx = new MockAudioContext();
    const rig = buildOscillator(ctx, baseInstrument({ oscillator: "sawtooth" }), 440);
    expect((rig.source as unknown as { type: string }).type).toBe("sawtooth");
  });

  it("sets frequency.value", () => {
    const ctx = new MockAudioContext();
    const rig = buildOscillator(ctx, baseInstrument(), 261.626);
    expect((rig.source as unknown as { frequency: { value: number } }).frequency.value).toBeCloseTo(
      261.626,
    );
  });

  it("output equals source when no filter", () => {
    const ctx = new MockAudioContext();
    const rig = buildOscillator(ctx, baseInstrument(), 440);
    expect(rig.output).toBe(rig.source);
  });

  it("applies detune when non-zero", () => {
    const ctx = new MockAudioContext();
    const rig = buildOscillator(ctx, baseInstrument({ detune: 5 }), 440);
    const hist = (
      (rig.source as unknown as { detune: unknown }).detune as unknown as { history: unknown[] }
    ).history;
    expect(hist).toContainEqual({
      method: "param",
      name: "detune",
      op: "setValueAtTime",
      value: 5,
      time: 0,
    });
  });

  it("skips detune when zero", () => {
    const ctx = new MockAudioContext();
    const rig = buildOscillator(ctx, baseInstrument({ detune: 0 }), 440);
    const hist = (
      (rig.source as unknown as { detune: unknown }).detune as unknown as { history: unknown[] }
    ).history;
    expect(hist).toHaveLength(0);
  });

  it("inserts BiquadFilter when filter present", () => {
    const ctx = new MockAudioContext();
    const rig = buildOscillator(
      ctx,
      baseInstrument({ filter: { type: "lowpass", cutoff: 2000, q: 0.7 } }),
      440,
    );
    expect(ctx.history.some((h) => h.method === "createBiquadFilter")).toBe(true);
    expect(rig.output).not.toBe(rig.source);
  });

  it("filter type/cutoff/q applied", () => {
    const ctx = new MockAudioContext();
    const rig = buildOscillator(
      ctx,
      baseInstrument({ filter: { type: "highpass", cutoff: 800, q: 1.5 } }),
      440,
    );
    const filter = rig.output as unknown as {
      type: string;
      frequency: { value: number };
      Q: { value: number };
    };
    expect(filter.type).toBe("highpass");
    expect(filter.frequency.value).toBe(800);
    expect(filter.Q.value).toBe(1.5);
  });

  it("oscillator connects to filter when filter present", () => {
    const ctx = new MockAudioContext();
    const rig = buildOscillator(
      ctx,
      baseInstrument({ filter: { type: "lowpass", cutoff: 2000, q: 0.7 } }),
      440,
    );
    const oscHist = (rig.source as unknown as { history: { method: string; target: object }[] })
      .history;
    expect(oscHist).toHaveLength(1);
    expect(oscHist[0]?.method).toBe("connect");
    expect(oscHist[0]?.target).toBe(rig.output);
  });
});

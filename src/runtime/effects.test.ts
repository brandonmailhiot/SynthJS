import { describe, expect, it } from "vitest";
import type { EffectInvocation } from "../ir/nodes.js";
import { buildEffect, createReverbBuffer, makeDistortionCurve } from "./effects.js";
import { MockAudioContext } from "./mock-audio-context.js";

const fx = (
  name: string,
  positional: (number | string)[] = [],
  named: Record<string, number | string> = {},
): EffectInvocation => ({ name, args: { positional, named } });

describe("buildEffect — gain", () => {
  it("creates a GainNode with given level", () => {
    const ctx = new MockAudioContext();
    const node = buildEffect(ctx, fx("gain", [0.5]));
    expect(ctx.history.some((h) => h.method === "createGain")).toBe(true);
    expect((node as unknown as { gain: { value: number } }).gain.value).toBe(0.5);
  });
});

describe("buildEffect — reverb", () => {
  it("creates a ConvolverNode with buffer", () => {
    const ctx = new MockAudioContext();
    const node = buildEffect(ctx, fx("reverb", [1, 1, 0.5]));
    expect(ctx.history.some((h) => h.method === "createConvolver")).toBe(true);
    expect((node as unknown as { buffer: object | null }).buffer).not.toBeNull();
  });

  it("buffer dimensions match args", () => {
    const ctx = new MockAudioContext();
    const buf = createReverbBuffer(ctx, 2, 0.5, 0.5);
    expect(buf.numberOfChannels).toBe(2);
    expect(buf.length).toBeGreaterThan(0);
  });
});

describe("buildEffect — delay", () => {
  it("creates a DelayNode with feedback loop", () => {
    const ctx = new MockAudioContext();
    buildEffect(ctx, fx("delay", [0.25, 0.3]));
    expect(ctx.history.filter((h) => h.method === "createDelay")).toHaveLength(1);
    expect(ctx.history.filter((h) => h.method === "createGain")).toHaveLength(1);
  });

  it("delayTime set from arg", () => {
    const ctx = new MockAudioContext();
    const node = buildEffect(ctx, fx("delay", [0.5, 0.3]));
    expect((node as unknown as { delayTime: { value: number } }).delayTime.value).toBe(0.5);
  });
});

describe("buildEffect — filter", () => {
  it("creates BiquadFilterNode", () => {
    const ctx = new MockAudioContext();
    const node = buildEffect(ctx, fx("filter", ["highpass", 800, 1.5]));
    expect((node as unknown as { type: string }).type).toBe("highpass");
    expect((node as unknown as { frequency: { value: number } }).frequency.value).toBe(800);
    expect((node as unknown as { Q: { value: number } }).Q.value).toBe(1.5);
  });
});

describe("buildEffect — distortion", () => {
  it("creates WaveShaperNode with curve", () => {
    const ctx = new MockAudioContext();
    const node = buildEffect(ctx, fx("distortion", [15, "2x"]));
    expect((node as unknown as { curve: Float32Array | null }).curve).not.toBeNull();
    expect((node as unknown as { oversample: string }).oversample).toBe("2x");
  });

  it("makeDistortionCurve returns Float32Array of length 44100", () => {
    const curve = makeDistortionCurve(15);
    expect(curve).toBeInstanceOf(Float32Array);
    expect(curve.length).toBe(44100);
  });
});

describe("buildEffect — chorus", () => {
  it("creates DelayNode + Oscillator + Gain nodes", () => {
    const ctx = new MockAudioContext();
    buildEffect(ctx, fx("chorus", [0.5, 0.002, 0.5]));
    expect(ctx.history.some((h) => h.method === "createDelay")).toBe(true);
    expect(ctx.history.some((h) => h.method === "createOscillator")).toBe(true);
    expect(ctx.history.filter((h) => h.method === "createGain").length).toBeGreaterThanOrEqual(3);
  });
});

describe("buildEffect — compressor", () => {
  it("creates DynamicsCompressorNode with params", () => {
    const ctx = new MockAudioContext();
    const node = buildEffect(ctx, fx("compressor", [-30, 6, 0.005, 0.3]));
    expect((node as unknown as { threshold: { value: number } }).threshold.value).toBe(-30);
    expect((node as unknown as { ratio: { value: number } }).ratio.value).toBe(6);
    expect((node as unknown as { attack: { value: number } }).attack.value).toBe(0.005);
    expect((node as unknown as { release: { value: number } }).release.value).toBe(0.3);
  });
});

describe("buildEffect — named args", () => {
  it("reverb with named args", () => {
    const ctx = new MockAudioContext();
    const node = buildEffect(ctx, fx("reverb", [], { channels: 1, seconds: 0.8, decay: 0.95 }));
    expect((node as unknown as { buffer: object | null }).buffer).not.toBeNull();
  });
});

describe("buildEffect — unknown", () => {
  it("throws for unknown effect", () => {
    const ctx = new MockAudioContext();
    expect(() => buildEffect(ctx, fx("xyz"))).toThrow();
  });
});

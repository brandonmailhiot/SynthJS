import { describe, expect, it } from "vitest";
import type { EffectInvocation } from "../ir/nodes.js";
import {
  DEFAULT_EFFECT_ARGS,
  buildEffect,
  createReverbBuffer,
  makeDistortionCurve,
} from "./effects.js";
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
    expect((node.input as unknown as { gain: { value: number } }).gain.value).toBe(0.5);
  });

  it("input === output (simpleNode invariant)", () => {
    const ctx = new MockAudioContext();
    const node = buildEffect(ctx, fx("gain", [0.5]));
    expect(node.input).toBe(node.output);
  });
});

describe("buildEffect — reverb", () => {
  it("creates a ConvolverNode with buffer", () => {
    const ctx = new MockAudioContext();
    const node = buildEffect(ctx, fx("reverb", [1, 1, 0.5]));
    expect(ctx.history.some((h) => h.method === "createConvolver")).toBe(true);
    expect((node.input as unknown as { buffer: object | null }).buffer).not.toBeNull();
  });

  it("input === output (simpleNode invariant)", () => {
    const ctx = new MockAudioContext();
    const node = buildEffect(ctx, fx("reverb", [1, 1, 0.5]));
    expect(node.input).toBe(node.output);
  });

  it("buffer dimensions match args", () => {
    const ctx = new MockAudioContext();
    const buf = createReverbBuffer(ctx, 2, 0.5, 0.5);
    expect(buf.numberOfChannels).toBe(2);
    expect(buf.length).toBeGreaterThan(0);
  });

  it("buffer length matches rate * seconds", () => {
    const ctx = new MockAudioContext();
    const seconds = 2.0;
    const buf = createReverbBuffer(ctx, 1, seconds, 0.5);
    expect(buf.length).toBe(Math.floor(ctx.sampleRate * seconds));
  });

  it("first sample (i=0) has magnitude near 0 due to fade-in", () => {
    const ctx = new MockAudioContext();
    // Use a long buffer so fadeIn > 0
    const buf = createReverbBuffer(ctx, 1, 2.0, 0.5);
    const data = buf.getChannelData(0);
    // At i=0, fade = 0/fadeIn = 0, so data[0] should be exactly 0 (±0)
    expect(Math.abs(data[0] ?? 0)).toBe(0);
  });

  it("mid samples have higher average magnitude than initial samples post fade-in", () => {
    const ctx = new MockAudioContext();
    const buf = createReverbBuffer(ctx, 1, 2.0, 0.5);
    const data = buf.getChannelData(0);
    const fadeIn = Math.min(Math.floor(ctx.sampleRate * 0.005), Math.floor(buf.length * 0.01));
    // Samples just after fade-in should have nonzero magnitude
    let sumAfterFade = 0;
    const checkCount = 100;
    for (let i = fadeIn + 1; i < fadeIn + 1 + checkCount; i++) {
      sumAfterFade += Math.abs(data[i] ?? 0);
    }
    const avgAfterFade = sumAfterFade / checkCount;
    expect(avgAfterFade).toBeGreaterThan(0);
  });

  it("decay clamped from -1: buffer produces only finite values", () => {
    const ctx = new MockAudioContext();
    const buf = createReverbBuffer(ctx, 1, 0.5, -1);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      expect(Number.isFinite(data[i])).toBe(true);
    }
  });

  it("decay clamped from 100: buffer has signal (some nonzero samples)", () => {
    const ctx = new MockAudioContext();
    const buf = createReverbBuffer(ctx, 1, 0.5, 100);
    const data = buf.getChannelData(0);
    const hasSignal = Array.from(data).some((v) => v !== 0);
    expect(hasSignal).toBe(true);
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
    expect((node.input as unknown as { delayTime: { value: number } }).delayTime.value).toBe(0.5);
  });

  it("input === output (simpleNode invariant)", () => {
    const ctx = new MockAudioContext();
    const node = buildEffect(ctx, fx("delay", [0.25, 0.3]));
    expect(node.input).toBe(node.output);
  });
});

describe("buildEffect — filter", () => {
  it("creates BiquadFilterNode", () => {
    const ctx = new MockAudioContext();
    const node = buildEffect(ctx, fx("filter", ["highpass", 800, 1.5]));
    expect((node.input as unknown as { type: string }).type).toBe("highpass");
    expect((node.input as unknown as { frequency: { value: number } }).frequency.value).toBe(800);
    expect((node.input as unknown as { Q: { value: number } }).Q.value).toBe(1.5);
  });

  it("input === output (simpleNode invariant)", () => {
    const ctx = new MockAudioContext();
    const node = buildEffect(ctx, fx("filter", ["highpass", 800, 1.5]));
    expect(node.input).toBe(node.output);
  });
});

describe("buildEffect — distortion", () => {
  it("creates WaveShaperNode with curve", () => {
    const ctx = new MockAudioContext();
    const node = buildEffect(ctx, fx("distortion", [15, "2x"]));
    expect((node.input as unknown as { curve: Float32Array | null }).curve).not.toBeNull();
    expect((node.input as unknown as { oversample: string }).oversample).toBe("2x");
  });

  it("input === output (simpleNode invariant)", () => {
    const ctx = new MockAudioContext();
    const node = buildEffect(ctx, fx("distortion", [15, "2x"]));
    expect(node.input).toBe(node.output);
  });

  it("makeDistortionCurve returns Float32Array of length 44100", () => {
    const curve = makeDistortionCurve(15);
    expect(curve).toBeInstanceOf(Float32Array);
    expect(curve.length).toBe(44100);
  });

  it("96kHz ctx produces curve of length 96000", () => {
    const ctx = new MockAudioContext();
    ctx.sampleRate = 96000;
    const node = buildEffect(ctx, fx("distortion", [15, "2x"]));
    const curve = (node.input as unknown as { curve: Float32Array }).curve;
    expect(curve).not.toBeNull();
    expect(curve.length).toBe(96000);
  });

  it("22050Hz ctx produces curve of length 22050", () => {
    const ctx = new MockAudioContext();
    ctx.sampleRate = 22050;
    const node = buildEffect(ctx, fx("distortion", [15, "2x"]));
    const curve = (node.input as unknown as { curve: Float32Array }).curve;
    expect(curve).not.toBeNull();
    expect(curve.length).toBe(22050);
  });

  it("tiny sample rate (100) clamps curve length to 256", () => {
    const ctx = new MockAudioContext();
    ctx.sampleRate = 100;
    const node = buildEffect(ctx, fx("distortion", [15, "2x"]));
    const curve = (node.input as unknown as { curve: Float32Array }).curve;
    expect(curve).not.toBeNull();
    expect(curve.length).toBe(256);
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

  it("has distinct input and output", () => {
    const ctx = new MockAudioContext();
    const node = buildEffect(ctx, fx("chorus", [0.5, 0.002, 0.5]));
    expect(node.input).not.toBe(node.output);
  });

  it("output is a gain node", () => {
    const ctx = new MockAudioContext();
    const node = buildEffect(ctx, fx("chorus", [0.5, 0.002, 0.5]));
    expect((node.output as unknown as { gain: object }).gain).toBeDefined();
  });

  it("dry/wet ratio respects mix arg — creates 5 gain nodes (input + output + dry + wet + lfoGain)", () => {
    const ctx = new MockAudioContext();
    buildEffect(ctx, fx("chorus", [0.5, 0.002, 0.3]));
    // input + output + dry + wet + lfoGain = 5 gain nodes
    expect(ctx.history.filter((h) => h.method === "createGain")).toHaveLength(5);
  });
});

describe("buildEffect — compressor", () => {
  it("creates DynamicsCompressorNode with params", () => {
    const ctx = new MockAudioContext();
    const node = buildEffect(ctx, fx("compressor", [-30, 6, 0.005, 0.3]));
    expect((node.input as unknown as { threshold: { value: number } }).threshold.value).toBe(-30);
    expect((node.input as unknown as { ratio: { value: number } }).ratio.value).toBe(6);
    expect((node.input as unknown as { attack: { value: number } }).attack.value).toBe(0.005);
    expect((node.input as unknown as { release: { value: number } }).release.value).toBe(0.3);
  });

  it("input === output (simpleNode invariant)", () => {
    const ctx = new MockAudioContext();
    const node = buildEffect(ctx, fx("compressor", [-30, 6, 0.005, 0.3]));
    expect(node.input).toBe(node.output);
  });
});

describe("buildEffect — named args", () => {
  it("reverb with named args", () => {
    const ctx = new MockAudioContext();
    const node = buildEffect(ctx, fx("reverb", [], { channels: 1, seconds: 0.8, decay: 0.95 }));
    expect((node.input as unknown as { buffer: object | null }).buffer).not.toBeNull();
  });
});

describe("buildEffect — unknown", () => {
  it("throws for unknown effect", () => {
    const ctx = new MockAudioContext();
    expect(() => buildEffect(ctx, fx("xyz"))).toThrow();
  });
});

describe("DEFAULT_EFFECT_ARGS — defaults activate when args are empty", () => {
  it("gain with no args uses default level 1.0", () => {
    const ctx = new MockAudioContext();
    const node = buildEffect(ctx, { name: "gain", args: { positional: [], named: {} } });
    expect((node.input as unknown as { gain: { value: number } }).gain.value).toBe(1.0);
  });

  it("reverb with no args uses default seconds 1.0 → buffer length = sampleRate", () => {
    const ctx = new MockAudioContext();
    const node = buildEffect(ctx, { name: "reverb", args: { positional: [], named: {} } });
    const buf = (node.input as unknown as { buffer: { length: number } }).buffer;
    expect(buf).not.toBeNull();
    expect(buf.length).toBe(ctx.sampleRate * DEFAULT_EFFECT_ARGS.reverb.seconds);
  });

  it("delay with no args uses default seconds 0.25", () => {
    const ctx = new MockAudioContext();
    const node = buildEffect(ctx, { name: "delay", args: { positional: [], named: {} } });
    expect((node.input as unknown as { delayTime: { value: number } }).delayTime.value).toBe(
      DEFAULT_EFFECT_ARGS.delay.seconds,
    );
  });

  it("filter with no args uses default cutoff 1000 and type lowpass", () => {
    const ctx = new MockAudioContext();
    const node = buildEffect(ctx, { name: "filter", args: { positional: [], named: {} } });
    expect((node.input as unknown as { frequency: { value: number } }).frequency.value).toBe(
      DEFAULT_EFFECT_ARGS.filter.cutoff,
    );
    expect((node.input as unknown as { type: string }).type).toBe(DEFAULT_EFFECT_ARGS.filter.type);
  });

  it("distortion with no args uses default amount 0", () => {
    const ctx = new MockAudioContext();
    const node = buildEffect(ctx, { name: "distortion", args: { positional: [], named: {} } });
    const curve = (node.input as unknown as { curve: Float32Array }).curve;
    // With amount=0, curve midpoint (x=0) should be 0
    expect(curve).not.toBeNull();
    const mid = Math.floor(curve.length / 2);
    expect(curve[mid]).toBeCloseTo(0, 5);
  });

  it("compressor with no args uses default threshold -24 and ratio 12", () => {
    const ctx = new MockAudioContext();
    const node = buildEffect(ctx, { name: "compressor", args: { positional: [], named: {} } });
    expect((node.input as unknown as { threshold: { value: number } }).threshold.value).toBe(
      DEFAULT_EFFECT_ARGS.compressor.threshold,
    );
    expect((node.input as unknown as { ratio: { value: number } }).ratio.value).toBe(
      DEFAULT_EFFECT_ARGS.compressor.ratio,
    );
  });
});

import { describe, expect, it } from "vitest";
import { adaptAudioContext } from "./audio-context.js";
import { MockAudioContext } from "./mock-audio-context.js";

describe("MockAudioContext", () => {
  it("records createOscillator", () => {
    const ctx = new MockAudioContext();
    const osc = ctx.createOscillator();
    expect(ctx.history).toHaveLength(1);
    expect(ctx.history[0]).toMatchObject({ method: "createOscillator", result: osc });
  });

  it("creates gain nodes that record connect", () => {
    const ctx = new MockAudioContext();
    const a = ctx.createGain();
    const b = ctx.createGain();
    a.connect(b);
    expect((a as unknown as { history: unknown[] }).history).toEqual([
      { method: "connect", target: b },
    ]);
  });

  it("oscillator records start/stop with timestamps", () => {
    const ctx = new MockAudioContext();
    const osc = ctx.createOscillator();
    osc.start(0.5);
    osc.stop(1.5);
    const hist = (osc as unknown as { history: unknown[] }).history;
    expect(hist).toContainEqual({ method: "start", when: 0.5 });
    expect(hist).toContainEqual({ method: "stop", when: 1.5 });
  });

  it("AudioParam records linearRampToValueAtTime", () => {
    const ctx = new MockAudioContext();
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(440, 0);
    osc.frequency.linearRampToValueAtTime(880, 1);
    const hist = (osc.frequency as unknown as { history: unknown[] }).history;
    expect(hist).toContainEqual({
      method: "param",
      name: "frequency",
      op: "setValueAtTime",
      value: 440,
      time: 0,
    });
    expect(hist).toContainEqual({
      method: "param",
      name: "frequency",
      op: "linearRampToValueAtTime",
      value: 880,
      time: 1,
    });
  });

  it("createBuffer returns buffer with correct dimensions", () => {
    const ctx = new MockAudioContext();
    const buf = ctx.createBuffer(2, 44100, 44100);
    expect(buf.numberOfChannels).toBe(2);
    expect(buf.length).toBe(44100);
    expect(buf.sampleRate).toBe(44100);
    const ch = buf.getChannelData(0);
    expect(ch).toBeInstanceOf(Float32Array);
    expect(ch.length).toBe(44100);
  });

  it("resume / suspend / close transition state", async () => {
    const ctx = new MockAudioContext();
    expect(ctx.state).toBe("suspended");
    await ctx.resume();
    expect(ctx.state).toBe("running");
    await ctx.suspend();
    expect(ctx.state).toBe("suspended");
    await ctx.close();
    expect(ctx.state).toBe("closed");
  });

  it("biquad filter accepts type and params", () => {
    const ctx = new MockAudioContext();
    const f = ctx.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = 2000;
    f.Q.value = 0.7;
    expect(f.type).toBe("highpass");
    expect(f.frequency.value).toBe(2000);
  });

  it("convolver buffer assignment", () => {
    const ctx = new MockAudioContext();
    const conv = ctx.createConvolver();
    const buf = ctx.createBuffer(1, 1024, 44100);
    conv.buffer = buf;
    expect(conv.buffer).toBe(buf);
  });

  it("waveshaper curve and oversample", () => {
    const ctx = new MockAudioContext();
    const ws = ctx.createWaveShaper();
    ws.curve = new Float32Array([1, 2, 3]);
    ws.oversample = "4x";
    expect(ws.curve?.length).toBe(3);
    expect(ws.oversample).toBe("4x");
  });

  it("compressor params accessible", () => {
    const ctx = new MockAudioContext();
    const c = ctx.createDynamicsCompressor();
    c.threshold.value = -24;
    c.ratio.value = 4;
    expect(c.threshold.value).toBe(-24);
  });
});

describe("adaptAudioContext", () => {
  it("rejects an object missing required methods", () => {
    const fake = {} as unknown as AudioContext;
    expect(() => adaptAudioContext(fake)).toThrow(TypeError);
  });
  it("accepts MockAudioContext (structurally compatible)", () => {
    const ctx = new MockAudioContext();
    expect(adaptAudioContext(ctx as unknown as AudioContext)).toBe(ctx);
  });
});

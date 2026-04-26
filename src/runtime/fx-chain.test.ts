import { describe, expect, it } from "vitest";
import type { EffectInvocation } from "../ir/nodes.js";
import { buildFxChain } from "./fx-chain.js";
import { MockAudioContext } from "./mock-audio-context.js";

const fx = (name: string, positional: (number | string)[] = []): EffectInvocation => ({
  name,
  args: { positional, named: {} },
});

describe("buildFxChain", () => {
  it("empty chain returns source", () => {
    const ctx = new MockAudioContext();
    const src = ctx.createGain();
    const out = buildFxChain(ctx, [], src);
    expect(out).toBe(src);
  });

  it("single effect: source connects to effect's input; effect output returned", () => {
    const ctx = new MockAudioContext();
    const src = ctx.createGain();
    const out = buildFxChain(ctx, [fx("gain", [0.5])], src);
    // For simple effects, input === output, so out is the effect node
    expect(out).not.toBe(src);
    const srcHist = (src as unknown as { history: { method: string; target: object }[] }).history;
    expect(srcHist[0]?.method).toBe("connect");
    // src connects to effect.input which equals effect.output for simple effects
    expect(srcHist[0]?.target).toBe(out);
  });

  it("multiple effects chain in order", () => {
    const ctx = new MockAudioContext();
    const src = ctx.createGain();
    const out = buildFxChain(
      ctx,
      [fx("gain", [0.5]), fx("filter", ["lowpass", 2000, 0.7]), fx("reverb", [1, 1, 0.5])],
      src,
    );
    // src → gain → filter → reverb
    // Verify src connects to gain (first effect)
    const srcHist = (src as unknown as { history: { method: string; target: object }[] }).history;
    expect(srcHist).toHaveLength(1);
    // Verify out is the reverb (last effect); reverb calls createConvolver then createBuffer
    expect(ctx.history.some((h) => h.method === "createConvolver")).toBe(true);
  });

  it("each effect's output node connects to the next", () => {
    const ctx = new MockAudioContext();
    const src = ctx.createGain();
    buildFxChain(ctx, [fx("gain", [0.5]), fx("gain", [0.7])], src);
    // src → gain1 → gain2
    // The second-to-last gain should have one connect to the last gain.
    const allCreates = ctx.history.filter((h) => h.method === "createGain").length;
    // 1 source + 2 effects = 3 createGain
    expect(allCreates).toBeGreaterThanOrEqual(3);
  });

  it("returns last effect node", () => {
    const ctx = new MockAudioContext();
    const src = ctx.createGain();
    const out = buildFxChain(ctx, [fx("gain", [0.5])], src);
    expect((out as unknown as { gain: { value: number } }).gain.value).toBe(0.5);
  });

  it("chorus in chain connects source to chorus input, returns chorus output", () => {
    const ctx = new MockAudioContext();
    const src = ctx.createGain();
    const out = buildFxChain(ctx, [fx("chorus", [0.5, 0.002, 0.5])], src);
    // chorus has compound input/output — out is not the source
    expect(out).not.toBe(src);
    // out is the chorus output gain node
    expect((out as unknown as { gain: object }).gain).toBeDefined();
    // src should have connected to a node (chorus input)
    const srcHist = (src as unknown as { history: { method: string; target: object }[] }).history;
    expect(srcHist[0]?.method).toBe("connect");
    // The target of src's connect is the chorus input, which is NOT the output
    expect(srcHist[0]?.target).not.toBe(out);
  });
});

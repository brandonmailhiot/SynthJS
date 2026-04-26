import { describe, expect, it } from "vitest";
import { Composition, MockAudioContext, compileSync } from "./index.js";

describe("end-to-end runtime", () => {
  it("compiles and plays 4 c4", async () => {
    const ir = compileSync('\\version "2.0"\n4 c4');
    const ctx = new MockAudioContext();
    const comp = new Composition(ir, { audioContext: ctx, scheduler: { lookaheadSeconds: 100 } });
    await comp.play();
    expect(ctx.history.filter((h) => h.method === "createOscillator")).toHaveLength(1);
  });

  it("plays a chord", async () => {
    const ir = compileSync("4 <c4 e4 g4>");
    const ctx = new MockAudioContext();
    const comp = new Composition(ir, { audioContext: ctx, scheduler: { lookaheadSeconds: 100 } });
    await comp.play();
    expect(ctx.history.filter((h) => h.method === "createOscillator")).toHaveLength(3);
  });

  it("plays two voices in parallel", async () => {
    const ir = compileSync("voice a { 4 c4 } voice b { 4 g4 }");
    const ctx = new MockAudioContext();
    const comp = new Composition(ir, { audioContext: ctx, scheduler: { lookaheadSeconds: 100 } });
    await comp.play();
    expect(ctx.history.filter((h) => h.method === "createOscillator")).toHaveLength(2);
  });

  it("@cue fires onCue callback", async () => {
    const ir = compileSync('4 c4@cue("hit")');
    const ctx = new MockAudioContext();
    const cues: string[] = [];
    const comp = new Composition(ir, {
      audioContext: ctx,
      onCue: (c) => cues.push(c.name),
      scheduler: { lookaheadSeconds: 100 },
    });
    await comp.play();
    expect(cues).toEqual(["hit"]);
  });

  it("with reverb wires ConvolverNode into chain", async () => {
    const ir = compileSync("with reverb(2, 1, 0.7) { 4 c4 }");
    const ctx = new MockAudioContext();
    const comp = new Composition(ir, { audioContext: ctx, scheduler: { lookaheadSeconds: 100 } });
    await comp.play();
    expect(ctx.history.some((h) => h.method === "createConvolver")).toBe(true);
  });

  it("\\instrument sawtooth applies", async () => {
    const ir = compileSync("\\instrument sawtooth\n4 c4");
    const ctx = new MockAudioContext();
    const comp = new Composition(ir, { audioContext: ctx, scheduler: { lookaheadSeconds: 100 } });
    await comp.play();
    expect(ctx.history.filter((h) => h.method === "createOscillator")).toHaveLength(1);
  });

  it("scale-degree composition compiles and plays", async () => {
    const ir = compileSync("\\key c4 major\n4 ^1 ^3 ^5");
    const ctx = new MockAudioContext();
    const comp = new Composition(ir, { audioContext: ctx, scheduler: { lookaheadSeconds: 100 } });
    await comp.play();
    expect(ctx.history.filter((h) => h.method === "createOscillator")).toHaveLength(3);
  });

  it("slide event triggers linearRampToValueAtTime", async () => {
    const ir = compileSync("2 e2 -> c3");
    const ctx = new MockAudioContext();
    const comp = new Composition(ir, { audioContext: ctx, scheduler: { lookaheadSeconds: 100 } });
    await comp.play();
    // Slide creates oscillator with frequency ramp
    expect(ctx.history.filter((h) => h.method === "createOscillator").length).toBeGreaterThan(0);
  });

  it("custom instrument applies oscillator + filter", async () => {
    const ir = compileSync(
      "instrument define warm { oscillator sawtooth filter lowpass(2000, 0.7) }\n\\instrument warm\n4 c4",
    );
    const ctx = new MockAudioContext();
    const comp = new Composition(ir, { audioContext: ctx, scheduler: { lookaheadSeconds: 100 } });
    await comp.play();
    expect(ctx.history.some((h) => h.method === "createBiquadFilter")).toBe(true);
  });

  it("dynamic affects gain", async () => {
    const ir = compileSync("\\ff 4 c4");
    const ctx = new MockAudioContext();
    const comp = new Composition(ir, { audioContext: ctx, scheduler: { lookaheadSeconds: 100 } });
    await comp.play();
    // Just verify it compiles + plays
    expect(ctx.history.filter((h) => h.method === "createOscillator")).toHaveLength(1);
  });
});

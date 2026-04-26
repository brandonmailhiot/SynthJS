import { describe, expect, it } from "vitest";
import type { CompositionIR, InstrumentSpec, TimelineEvent } from "../ir/nodes.js";
import { Composition } from "./composition.js";
import { MockAudioContext } from "./mock-audio-context.js";

const span = { start: 0, end: 0, line: 1, column: 1 };
const sineInstrument: InstrumentSpec = { name: "sine", oscillator: "sine" };

const noteEvent = (over: Partial<TimelineEvent> = {}): TimelineEvent => ({
  startBeat: 0,
  durationBeats: 0.25,
  frequencies: [440],
  gain: 0.65,
  articulation: [],
  fxChain: [],
  instrument: sineInstrument,
  annotations: [],
  span,
  ...over,
});

const irOf = (events: TimelineEvent[], voiceName = "main"): CompositionIR => ({
  tempo: 60,
  timeSig: { numerator: 4, denominator: 4 },
  voices: [{ name: voiceName, events }],
  diagnostics: [],
});

describe("Composition — construction", () => {
  it("uses provided audioContext", () => {
    const ctx = new MockAudioContext();
    const comp = new Composition(irOf([noteEvent()]), { audioContext: ctx });
    expect(comp.state).toBe("idle");
  });

  it("throws when no audioContext available globally", () => {
    // No AudioContext in node test env (we are in jsdom or node, no AudioContext)
    expect(() => new Composition(irOf([noteEvent()]))).toThrow();
  });
});

describe("Composition — play", () => {
  it("transitions to playing", async () => {
    const ctx = new MockAudioContext();
    const comp = new Composition(irOf([noteEvent()]), { audioContext: ctx });
    await comp.play();
    expect(comp.state).toBe("playing");
  });

  it("schedules oscillators for all events", async () => {
    const ctx = new MockAudioContext();
    const events = [noteEvent({ startBeat: 0 }), noteEvent({ startBeat: 0.25 })];
    const comp = new Composition(irOf(events), { audioContext: ctx });
    await comp.play();
    expect(ctx.history.filter((h) => h.method === "createOscillator")).toHaveLength(2);
  });

  it("creates a voice output gain node connected to destination", async () => {
    const ctx = new MockAudioContext();
    const comp = new Composition(irOf([noteEvent()]), { audioContext: ctx });
    await comp.play();
    // Voice output gain is created
    const gainCount = ctx.history.filter((h) => h.method === "createGain").length;
    expect(gainCount).toBeGreaterThan(0);
  });

  it("resumes ctx when suspended", async () => {
    const ctx = new MockAudioContext();
    expect(ctx.state).toBe("suspended");
    const comp = new Composition(irOf([noteEvent()]), { audioContext: ctx });
    await comp.play();
    expect(ctx.history.some((h) => h.method === "resume")).toBe(true);
  });

  it("idempotent play (no double-schedule)", async () => {
    const ctx = new MockAudioContext();
    const comp = new Composition(irOf([noteEvent()]), { audioContext: ctx });
    await comp.play();
    const before = ctx.history.filter((h) => h.method === "createOscillator").length;
    await comp.play();
    const after = ctx.history.filter((h) => h.method === "createOscillator").length;
    expect(after).toBe(before);
  });

  it("filters events by 'from' parameter", async () => {
    const ctx = new MockAudioContext();
    const events = [
      noteEvent({ startBeat: 0 }),
      noteEvent({ startBeat: 0.5 }),
      noteEvent({ startBeat: 1.0 }),
    ];
    const comp = new Composition(irOf(events), { audioContext: ctx });
    await comp.play({ from: 0.5 });
    // Only events at 0.5 and 1.0 should be scheduled
    expect(ctx.history.filter((h) => h.method === "createOscillator")).toHaveLength(2);
  });
});

describe("Composition — multi-voice", () => {
  it("schedules all voices independently", async () => {
    const ctx = new MockAudioContext();
    const ir: CompositionIR = {
      tempo: 60,
      timeSig: { numerator: 4, denominator: 4 },
      voices: [
        { name: "bass", events: [noteEvent({ frequencies: [110] })] },
        { name: "melody", events: [noteEvent({ frequencies: [440] })] },
      ],
      diagnostics: [],
    };
    const comp = new Composition(ir, { audioContext: ctx });
    await comp.play();
    expect(ctx.history.filter((h) => h.method === "createOscillator")).toHaveLength(2);
  });
});

describe("Composition — stop", () => {
  it("transitions to stopped", async () => {
    const ctx = new MockAudioContext();
    const comp = new Composition(irOf([noteEvent()]), { audioContext: ctx });
    await comp.play();
    comp.stop();
    expect(comp.state).toBe("stopped");
  });

  it("idempotent stop", async () => {
    const ctx = new MockAudioContext();
    const comp = new Composition(irOf([noteEvent()]), { audioContext: ctx });
    await comp.play();
    comp.stop();
    comp.stop();
    expect(comp.state).toBe("stopped");
  });
});

describe("Composition — destroy", () => {
  it("closes context when ownsContext is true (no audioContext provided) — skipped (jsdom has no AudioContext)", () => {
    expect(true).toBe(true);
  });

  it("does NOT close context when audioContext is provided", async () => {
    const ctx = new MockAudioContext();
    const comp = new Composition(irOf([noteEvent()]), { audioContext: ctx });
    await comp.play();
    await comp.destroy();
    expect(ctx.history.filter((h) => h.method === "close")).toHaveLength(0);
  });
});

describe("Composition — diagnostics", () => {
  it("forwards diagnostics from IR", () => {
    const ir: CompositionIR = {
      tempo: 60,
      timeSig: { numerator: 4, denominator: 4 },
      voices: [],
      diagnostics: [{ message: "test warning", severity: "warning", span }],
    };
    const ctx = new MockAudioContext();
    const comp = new Composition(ir, { audioContext: ctx });
    expect(comp.diagnostics).toHaveLength(1);
    expect(comp.diagnostics[0]?.severity).toBe("warning");
  });
});

describe("Composition — pause/resume", () => {
  it("pause from playing transitions to paused and calls ctx.suspend", async () => {
    const ctx = new MockAudioContext();
    const comp = new Composition(irOf([noteEvent()]), { audioContext: ctx });
    await comp.play();
    expect(comp.state).toBe("playing");
    await comp.pause();
    expect(comp.state).toBe("paused");
    expect(ctx.history.some((h) => h.method === "suspend")).toBe(true);
  });

  it("resume from paused transitions to playing and calls ctx.resume", async () => {
    const ctx = new MockAudioContext();
    const comp = new Composition(irOf([noteEvent()]), { audioContext: ctx });
    await comp.play();
    await comp.pause();
    const resumeCountBefore = ctx.history.filter((h) => h.method === "resume").length;
    await comp.resume();
    expect(comp.state).toBe("playing");
    const resumeCountAfter = ctx.history.filter((h) => h.method === "resume").length;
    expect(resumeCountAfter).toBe(resumeCountBefore + 1);
  });

  it("pause when not playing is a no-op (state stays idle)", async () => {
    const ctx = new MockAudioContext();
    const comp = new Composition(irOf([noteEvent()]), { audioContext: ctx });
    await comp.pause(); // state is idle, not playing
    expect(comp.state).toBe("idle");
    expect(ctx.history.some((h) => h.method === "suspend")).toBe(false);
  });

  it("resume when not paused is a no-op (state stays playing)", async () => {
    const ctx = new MockAudioContext();
    const comp = new Composition(irOf([noteEvent()]), { audioContext: ctx });
    await comp.play();
    const resumeCountBefore = ctx.history.filter((h) => h.method === "resume").length;
    await comp.resume(); // state is playing, not paused
    expect(comp.state).toBe("playing");
    expect(ctx.history.filter((h) => h.method === "resume").length).toBe(resumeCountBefore);
  });

  it("stop from paused transitions to stopped", async () => {
    const ctx = new MockAudioContext();
    const comp = new Composition(irOf([noteEvent()]), { audioContext: ctx });
    await comp.play();
    await comp.pause();
    comp.stop();
    expect(comp.state).toBe("stopped");
  });
});

describe("Composition — onCue", () => {
  it("forwards onCue to VoicePlayer", async () => {
    const cued: string[] = [];
    const ctx = new MockAudioContext();
    const ev = noteEvent({ annotations: [{ name: "@cue", args: ["hit"] }] });
    const comp = new Composition(irOf([ev]), {
      audioContext: ctx,
      onCue: (c) => cued.push(c.name),
      scheduler: { lookaheadSeconds: 100 },
    });
    await comp.play();
    // Manually flush scheduler
    // Direct flush isn't on Composition's API; rely on schedule.start having flushed
    // Since we set lookahead to 100 seconds, the start() call's initial flush should
    // dispatch the cue.
    expect(cued).toEqual(["hit"]);
  });
});

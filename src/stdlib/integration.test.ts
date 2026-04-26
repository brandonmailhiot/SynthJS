import { describe, expect, it } from "vitest";
import { compileSync } from "../index.js";

describe("stdlib end-to-end via compileSync", () => {
  it("\\use @stdlib/scales + major_scale", () => {
    const ir = compileSync(`\\version "2.0"
\\use "@stdlib/scales"
\\tempo 60
major_scale(c4)`);
    expect(ir.voices[0]?.events.length).toBeGreaterThan(0);
  });

  it("\\use @stdlib/chords + triad_major produces chord", () => {
    const ir = compileSync(`\\use "@stdlib/chords"
4 c4
triad_major(c4)`);
    const events = ir.voices[0]?.events;
    expect(events && events.length).toBeGreaterThan(0);
    // Should include a chord (3 frequencies)
    const chordEv = events?.find((e) => e.frequencies.length === 3);
    expect(chordEv).toBeDefined();
  });

  it("\\use @stdlib/instruments + custom instrument applied", () => {
    const ir = compileSync(`\\use "@stdlib/instruments"
\\instrument warm_pad
4 c4`);
    const ev = ir.voices[0]?.events[0];
    expect(ev?.instrument.oscillator).toBe("sawtooth");
    expect(ev?.instrument.detune).toBe(5);
  });

  it("\\use @stdlib/drums kick_drum applied", () => {
    const ir = compileSync(`\\use "@stdlib/drums"
\\instrument kick_drum
16 c2`);
    const ev = ir.voices[0]?.events[0];
    expect(ev?.instrument.oscillator).toBe("sine");
    expect(ev?.instrument.detune).toBe(-1200);
  });

  it("selective \\use brings only named", () => {
    const ir = compileSync(`\\use "@stdlib/chords" (triad_major)
4 c4
triad_major(c4)`);
    expect(ir.voices[0]?.events.length).toBeGreaterThan(0);
    // triad_minor not visible — would throw if used:
    expect(() =>
      compileSync(`\\use "@stdlib/chords" (triad_major)
triad_minor(c4)`),
    ).toThrow();
  });

  it("compileSync rejects relative \\use", () => {
    expect(() =>
      compileSync(`\\use "./shared.synth"
4 c4`),
    ).toThrow(/compile\(\)/);
  });

  it("compileSync rejects aliased stdlib imports", () => {
    expect(() =>
      compileSync(`\\use "@stdlib/scales" as s
4 c4`),
    ).toThrow();
  });
});

import { describe, expect, it } from "vitest";
import { lex } from "../lexer/lexer.js";
import { parse } from "../parser/parser.js";
import { lowerEffects } from "./lower-effects.js";
import { lowerSticky } from "./lower-sticky.js";

const lower = (src: string) => lowerEffects(lowerSticky(parse(lex(src))).ast);

describe("lower-effects — with", () => {
  it("with reverb tags fxChain on inner event", () => {
    const c = lower("with reverb(2, 1, 0.7) { 4 c4 }");
    const note = c.body.find((b) => b.kind === "Note");
    if (note?.kind === "Note") {
      expect(note.fxChain).toBeDefined();
      expect(note.fxChain).toHaveLength(1);
      expect(note.fxChain?.[0]?.name).toBe("reverb");
    }
  });

  it("nested with concatenates chains (inner first)", () => {
    const c = lower("with reverb(2, 1, 0.7) { with delay(0.5, 0.3) { 4 c4 } }");
    const note = c.body.find((b) => b.kind === "Note");
    if (note?.kind === "Note") {
      expect(note.fxChain).toHaveLength(2);
      expect(note.fxChain?.[0]?.name).toBe("delay"); // inner first
      expect(note.fxChain?.[1]?.name).toBe("reverb");
    }
  });

  it("with multiple effects in one call", () => {
    const c = lower("with delay(0.5, 0.3), reverb(2, 1, 0.7) { 4 c4 }");
    const note = c.body.find((b) => b.kind === "Note");
    if (note?.kind === "Note") {
      expect(note.fxChain).toHaveLength(2);
    }
  });

  it("WithExpr structural nodes removed after pass", () => {
    const c = lower("with reverb(2, 1, 0.7) { 4 c4 }");
    expect(c.body.every((b) => b.kind !== "With")).toBe(true);
  });

  it("with tags multiple events", () => {
    const c = lower("with reverb(2, 1, 0.7) { 4 c4 d4 e4 }");
    const notes = c.body.filter((b) => b.kind === "Note");
    expect(notes).toHaveLength(3);
    for (const n of notes) {
      if (n.kind === "Note") {
        expect(n.fxChain).toHaveLength(1);
        expect(n.fxChain?.[0]?.name).toBe("reverb");
      }
    }
  });

  it("events outside with have no fxChain", () => {
    const c = lower("4 c4 with reverb(2, 1, 0.7) { d4 } e4");
    const notes = c.body.filter((b) => b.kind === "Note");
    expect(notes).toHaveLength(3);
    // c4 has no fxChain
    if (notes[0]?.kind === "Note") expect(notes[0].fxChain).toBeUndefined();
    // d4 has reverb
    if (notes[1]?.kind === "Note") {
      expect(notes[1].fxChain).toHaveLength(1);
      expect(notes[1].fxChain?.[0]?.name).toBe("reverb");
    }
    // e4 has no fxChain
    if (notes[2]?.kind === "Note") expect(notes[2].fxChain).toBeUndefined();
  });
});

describe("lower-effects — envelope", () => {
  it("envelope adsr tags envelope on inner event", () => {
    const c = lower("envelope adsr(0.01, 0.1, 0.7, 0.3) { 4 c4 }");
    const note = c.body.find((b) => b.kind === "Note");
    if (note?.kind === "Note") {
      expect(note.envelope).toBeDefined();
      expect(note.envelope?.name).toBe("adsr");
    }
  });

  it("EnvelopeExpr structural nodes removed after pass", () => {
    const c = lower("envelope adsr(0.01, 0.1, 0.7, 0.3) { 4 c4 }");
    expect(c.body.every((b) => b.kind !== "Envelope")).toBe(true);
  });

  it("inner envelope overrides outer", () => {
    const c = lower(
      "envelope adsr(0.01, 0.1, 0.7, 0.3) { envelope adsr(0.05, 0.2, 0.5, 0.1) { 4 c4 } }",
    );
    const note = c.body.find((b) => b.kind === "Note");
    if (note?.kind === "Note") {
      expect(note.envelope?.name).toBe("adsr");
      // Inner envelope args differ from outer; check second arg (decay)
      const decayArg = note.envelope?.args[1];
      if (decayArg?.kind === "NumberArg") expect(decayArg.value).toBeCloseTo(0.2);
    }
  });
});

describe("lower-effects — tuplet", () => {
  it("tuplet(3) sets durationScale 2/3", () => {
    const c = lower("tuplet(3) { 8 c4 d4 e4 }");
    const notes = c.body.filter((b) => b.kind === "Note");
    expect(notes).toHaveLength(3);
    for (const n of notes) {
      if (n.kind === "Note") expect(n.durationScale).toBeCloseTo(2 / 3);
    }
  });

  it("tuplet(N, M) explicit", () => {
    const c = lower("tuplet(5, 4) { 16 c4 d4 e4 f4 g4 }");
    const notes = c.body.filter((b) => b.kind === "Note");
    expect(notes).toHaveLength(5);
    for (const n of notes) {
      if (n.kind === "Note") expect(n.durationScale).toBeCloseTo(4 / 5);
    }
  });

  it("nested tuplets multiply scales", () => {
    const c = lower("tuplet(3) { tuplet(3) { 8 c4 d4 e4 } }");
    const notes = c.body.filter((b) => b.kind === "Note");
    for (const n of notes) {
      if (n.kind === "Note") expect(n.durationScale).toBeCloseTo((2 / 3) ** 2);
    }
  });

  it("TupletExpr structural nodes removed after pass", () => {
    const c = lower("tuplet(3) { 8 c4 d4 e4 }");
    expect(c.body.every((b) => b.kind !== "Tuplet")).toBe(true);
  });

  it("tuplet(2) sets durationScale 1/2", () => {
    const c = lower("tuplet(2) { 8 c4 d4 }");
    const notes = c.body.filter((b) => b.kind === "Note");
    for (const n of notes) {
      if (n.kind === "Note") expect(n.durationScale).toBeCloseTo(1 / 2);
    }
  });
});

describe("lower-effects — ramp", () => {
  it("ramp(\\p, \\ff) interpolates linearly", () => {
    const c = lower("ramp(\\p, \\ff) { 4 c4 d4 e4 f4 }");
    const notes = c.body.filter((b) => b.kind === "Note");
    expect(notes).toHaveLength(4);
    // p = 0.35, ff = 1.0; over 4 notes: 0.35, ~0.567, ~0.783, 1.0
    if (notes[0]?.kind === "Note") expect(notes[0].effectiveDynamic).toBeCloseTo(0.35, 2);
    if (notes[3]?.kind === "Note") expect(notes[3].effectiveDynamic).toBeCloseTo(1.0, 2);
  });

  it("ramp with single event = from value", () => {
    const c = lower("ramp(\\p, \\ff) { 4 c4 }");
    const note = c.body.find((b) => b.kind === "Note");
    if (note?.kind === "Note") expect(note.effectiveDynamic).toBeCloseTo(0.35);
  });

  it("RampExpr structural nodes removed after pass", () => {
    const c = lower("ramp(\\mp, \\ff) { 4 c4 d4 }");
    expect(c.body.every((b) => b.kind !== "Ramp")).toBe(true);
  });

  it("ramp(\\mp, \\ff) middle value interpolated", () => {
    const c = lower("ramp(\\mp, \\ff) { 4 c4 d4 e4 }");
    const notes = c.body.filter((b) => b.kind === "Note");
    // mp=0.5, ff=1.0; over 3 notes: 0.5, 0.75, 1.0
    if (notes[1]?.kind === "Note") expect(notes[1].effectiveDynamic).toBeCloseTo(0.75, 2);
  });
});

describe("lower-effects — combined", () => {
  it("with + envelope + tuplet stacked", () => {
    const c = lower(
      "with reverb(2, 1, 0.7) { envelope adsr(0.01, 0.1, 0.7, 0.3) { tuplet(3) { 8 c4 d4 e4 } } }",
    );
    const notes = c.body.filter((b) => b.kind === "Note");
    for (const n of notes) {
      if (n.kind === "Note") {
        expect(n.fxChain?.[0]?.name).toBe("reverb");
        expect(n.envelope?.name).toBe("adsr");
        expect(n.durationScale).toBeCloseTo(2 / 3);
      }
    }
  });

  it("ramp inside with: events carry both fxChain and interpolated dynamic", () => {
    const c = lower("with reverb(2, 1, 0.7) { ramp(\\p, \\ff) { 4 c4 d4 } }");
    const notes = c.body.filter((b) => b.kind === "Note");
    expect(notes).toHaveLength(2);
    for (const n of notes) {
      if (n.kind === "Note") {
        expect(n.fxChain).toHaveLength(1);
        expect(n.fxChain?.[0]?.name).toBe("reverb");
      }
    }
    // p=0.35 for first note, ff=1.0 for last
    if (notes[0]?.kind === "Note") expect(notes[0].effectiveDynamic).toBeCloseTo(0.35, 2);
    if (notes[1]?.kind === "Note") expect(notes[1].effectiveDynamic).toBeCloseTo(1.0, 2);
  });
});

describe("lower-effects — slide event", () => {
  it("with propagates fxChain to slide source and destination", () => {
    const c = lower("with reverb(2, 1, 0.7) { 4 c4~d4 }");
    const slide = c.body.find((b) => b.kind === "Slide");
    if (slide?.kind === "Slide") {
      expect(slide.fxChain).toHaveLength(1);
      expect(slide.source.fxChain).toHaveLength(1);
      expect(slide.destination.fxChain).toHaveLength(1);
      expect(slide.fxChain?.[0]?.name).toBe("reverb");
    }
  });

  it("tuplet propagates durationScale to slide", () => {
    const c = lower("tuplet(3) { 8 c4~d4 }");
    const slide = c.body.find((b) => b.kind === "Slide");
    if (slide?.kind === "Slide") {
      expect(slide.durationScale).toBeCloseTo(2 / 3);
      expect(slide.source.durationScale).toBeCloseTo(2 / 3);
      expect(slide.destination.durationScale).toBeCloseTo(2 / 3);
    }
  });

  it("envelope propagates to slide source and destination", () => {
    const c = lower("envelope adsr(0.01, 0.1, 0.7, 0.3) { 4 c4~d4 }");
    const slide = c.body.find((b) => b.kind === "Slide");
    if (slide?.kind === "Slide") {
      expect(slide.envelope).toBeDefined();
      expect(slide.source.envelope).toBeDefined();
      expect(slide.destination.envelope).toBeDefined();
    }
  });

  it("ramp propagates dynamic override to slide source and destination", () => {
    const c = lower("ramp(\\p, \\ff) { 4 c4~d4 e4 }");
    const slide = c.body.find((b) => b.kind === "Slide");
    if (slide?.kind === "Slide") {
      // ramp over 2 events: slide (index 0) = p=0.35, note (index 1) = ff=1.0
      expect(slide.source.effectiveDynamic).toBeCloseTo(0.35, 2);
      expect(slide.destination.effectiveDynamic).toBeCloseTo(0.35, 2);
    }
  });
});

describe("lower-effects — ramp nested wrappers", () => {
  it("tuplet inside ramp: durationScale applied, dynamic interpolated", () => {
    const c = lower("ramp(\\p, \\ff) { tuplet(3) { 8 c4 d4 e4 } }");
    const notes = c.body.filter((b) => b.kind === "Note");
    expect(notes).toHaveLength(3);
    for (const n of notes) {
      if (n.kind === "Note") {
        expect(n.durationScale).toBeCloseTo(2 / 3);
      }
    }
    // First note at p=0.35, last at ff=1.0
    if (notes[0]?.kind === "Note") expect(notes[0].effectiveDynamic).toBeCloseTo(0.35, 2);
    if (notes[2]?.kind === "Note") expect(notes[2].effectiveDynamic).toBeCloseTo(1.0, 2);
  });

  it("nested ramp inside outer ramp uses inner ramp's own interpolation", () => {
    const c = lower("ramp(\\p, \\ff) { ramp(\\ff, \\p) { 4 c4 d4 } }");
    const notes = c.body.filter((b) => b.kind === "Note");
    expect(notes).toHaveLength(2);
    // inner ramp ff=1.0 -> p=0.35: first note at 1.0, last at 0.35
    if (notes[0]?.kind === "Note") expect(notes[0].effectiveDynamic).toBeCloseTo(1.0, 2);
    if (notes[1]?.kind === "Note") expect(notes[1].effectiveDynamic).toBeCloseTo(0.35, 2);
  });

  it("repeat inside ramp: events carry interpolated dynamics", () => {
    const c = lower("ramp(\\p, \\ff) { repeat 1 { 4 c4 d4 } }");
    const notes = c.body.filter((b) => b.kind === "Note");
    expect(notes.length).toBeGreaterThan(0);
    // All notes should have effectiveDynamic set
    for (const n of notes) {
      if (n.kind === "Note") expect(n.effectiveDynamic).toBeDefined();
    }
  });

  it("envelope inside ramp: envelope tagged and dynamics interpolated", () => {
    const c = lower("ramp(\\p, \\ff) { envelope adsr(0.01, 0.1, 0.7, 0.3) { 4 c4 d4 } }");
    const notes = c.body.filter((b) => b.kind === "Note");
    expect(notes).toHaveLength(2);
    for (const n of notes) {
      if (n.kind === "Note") {
        expect(n.envelope).toBeDefined();
        expect(n.effectiveDynamic).toBeDefined();
      }
    }
  });

  it("with inside ramp: fxChain tagged and dynamics interpolated", () => {
    const c = lower("ramp(\\p, \\ff) { with reverb(2, 1, 0.7) { 4 c4 d4 } }");
    const notes = c.body.filter((b) => b.kind === "Note");
    expect(notes).toHaveLength(2);
    for (const n of notes) {
      if (n.kind === "Note") {
        expect(n.fxChain).toHaveLength(1);
        expect(n.effectiveDynamic).toBeDefined();
      }
    }
  });
});

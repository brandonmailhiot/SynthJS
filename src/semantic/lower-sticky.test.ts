import { describe, expect, it } from "vitest";
import { ValidationError } from "../errors.js";
import { lex } from "../lexer/lexer.js";
import { parse } from "../parser/parser.js";
import { lowerSticky } from "./lower-sticky.js";

const lower = (src: string) => lowerSticky(parse(lex(src))).ast;

describe("lower-sticky — duration", () => {
  it("4 c4 d4 e4 -> all quarter", () => {
    const c = lower("4 c4 d4 e4");
    for (const ev of c.body) {
      if (ev.kind === "Note") expect(ev.duration?.divisor).toBe(4);
    }
  });
  it("4 c4 8 d4 -> first quarter, second eighth", () => {
    const c = lower("4 c4 8 d4");
    const n1 = c.body[0];
    const n2 = c.body[1];
    if (n1?.kind === "Note") expect(n1.duration?.divisor).toBe(4);
    if (n2?.kind === "Note") expect(n2.duration?.divisor).toBe(8);
  });
  it("first event without duration throws", () => {
    expect(() => lower("c4")).toThrow(ValidationError);
  });
  it("rest inherits duration", () => {
    const c = lower("4 c4 r");
    const rest = c.body[1];
    if (rest?.kind === "Rest") expect(rest.duration?.divisor).toBe(4);
  });
  it("dotted duration is propagated", () => {
    const c = lower("4. c4 d");
    for (const ev of c.body) {
      if (ev.kind === "Note") expect(ev.duration?.dots).toBe(1);
    }
  });
});

describe("lower-sticky — octave", () => {
  it("4 c4 d e f -> all octave 4", () => {
    const c = lower("4 c4 d e f");
    for (const ev of c.body) {
      if (ev.kind === "Note" && ev.pitch.kind === "Pitch") {
        expect(ev.pitch.octave).toBe(4);
      }
    }
  });
  it("4 c4 d e c5 d -> octave switch", () => {
    const c = lower("4 c4 d e c5 d");
    const n5 = c.body[4];
    if (n5?.kind === "Note" && n5.pitch.kind === "Pitch") {
      expect(n5.pitch.octave).toBe(5);
    }
  });
  it("inherited letter sharp: 4 c4 d#", () => {
    const c = lower("4 c4 d#");
    const n = c.body[1];
    if (n?.kind === "Note" && n.pitch.kind === "Pitch") {
      expect(n.pitch.letter).toBe("d");
      expect(n.pitch.accidental).toBe("#");
      expect(n.pitch.octave).toBe(4);
    }
  });
  it("InheritedPitchLetter without anchor throws", () => {
    expect(() => lower("4 d")).toThrow(ValidationError);
  });
  it("octave carries across measures through bar markers", () => {
    const c = lower("4 c4 | d e");
    // d and e should have octave 4
    const notes = c.body.filter((n) => n.kind === "Note");
    for (const n of notes) {
      if (n.kind === "Note" && n.pitch.kind === "Pitch") {
        expect(n.pitch.octave).toBe(4);
      }
    }
  });
});

describe("lower-sticky — dynamic", () => {
  it("default mf", () => {
    const c = lower("4 c4");
    const n = c.body[0];
    if (n?.kind === "Note") expect(n.effectiveDynamic).toBeCloseTo(0.65);
  });
  it("\\mp 4 c4 -> 0.5", () => {
    const c = lower("\\mp 4 c4");
    const n = c.body[1]; // body[0] is the DynamicMarker
    if (n?.kind === "Note") expect(n.effectiveDynamic).toBeCloseTo(0.5);
  });
  it("\\ff sticky across notes", () => {
    const c = lower("\\ff 4 c4 d e");
    for (const ev of c.body) {
      if (ev.kind === "Note") expect(ev.effectiveDynamic).toBeCloseTo(1.0);
    }
  });
  it("\\pp maps to 0.20", () => {
    const c = lower("\\pp 4 c4");
    const n = c.body[1];
    if (n?.kind === "Note") expect(n.effectiveDynamic).toBeCloseTo(0.2);
  });
  it("dynamic changes mid-sequence", () => {
    const c = lower("\\p 4 c4 \\ff d");
    const notes = c.body.filter((n) => n.kind === "Note");
    if (notes[0]?.kind === "Note") expect(notes[0].effectiveDynamic).toBeCloseTo(0.35);
    if (notes[1]?.kind === "Note") expect(notes[1].effectiveDynamic).toBeCloseTo(1.0);
  });
});

describe("lower-sticky — instrument", () => {
  it("default sine", () => {
    const c = lower("4 c4");
    const n = c.body[0];
    if (n?.kind === "Note") expect(n.effectiveInstrument).toBe("sine");
  });
  it("\\instrument sawtooth applies forward", () => {
    const c = lower("\\instrument sawtooth\n4 c4 d");
    for (const ev of c.body) {
      if (ev.kind === "Note") expect(ev.effectiveInstrument).toBe("sawtooth");
    }
  });
  it("instrument changes mid-sequence", () => {
    const c = lower("4 c4 \\instrument square d");
    const notes = c.body.filter((n) => n.kind === "Note");
    if (notes[0]?.kind === "Note") expect(notes[0].effectiveInstrument).toBe("sine");
    if (notes[1]?.kind === "Note") expect(notes[1].effectiveInstrument).toBe("square");
  });
});

describe("lower-sticky — voices", () => {
  it("voice introduces new sticky scope", () => {
    const src = "\\instrument sawtooth\nvoice melody { 4 c4 }";
    const c = lower(src);
    const voice = c.body.find((n) => n.kind === "VoiceDecl");
    if (voice?.kind === "VoiceDecl") {
      const ev = voice.body.body[0];
      if (ev?.kind === "Note") expect(ev.effectiveInstrument).toBe("sawtooth");
    }
  });
  it("voice state does not leak back to parent", () => {
    const src = "voice melody { \\instrument square\n4 c4 }\n4 c4";
    const c = lower(src);
    // top-level note after voice should still have default sine
    const topNote = c.body.find((n) => n.kind === "Note");
    if (topNote?.kind === "Note") expect(topNote.effectiveInstrument).toBe("sine");
  });
  it("repeat block inherits and isolates sticky state", () => {
    const c = lower("4 c4 repeat 2 { \\ff d e } f");
    const notes = c.body.filter((n) => n.kind === "Note");
    // first note: default dynamic
    if (notes[0]?.kind === "Note") expect(notes[0].effectiveDynamic).toBeCloseTo(0.65);
    // note after repeat: back to default (block scope restored)
    const last = notes[notes.length - 1];
    if (last?.kind === "Note") expect(last.effectiveDynamic).toBeCloseTo(0.65);
  });
});

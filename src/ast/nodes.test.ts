import { describe, expect, it } from "vitest";
import type {
  AbsolutePitch,
  Annotation,
  Binding,
  ChordEvent,
  Composition,
  KeyDirective,
  NoteEvent,
  RampExpr,
  ScaleDegree,
  SlideEvent,
  TempoDirective,
  VoiceDecl,
} from "./nodes.js";

const span = { start: 0, end: 0, line: 1, column: 1 };

describe("AST node shapes", () => {
  it("Composition with version", () => {
    const c: Composition = {
      kind: "Composition",
      version: "2.0",
      body: [],
      span,
    };
    expect(c.version).toBe("2.0");
  });

  it("TempoDirective", () => {
    const d: TempoDirective = { kind: "Tempo", value: 120, span };
    expect(d.value).toBe(120);
  });

  it("KeyDirective", () => {
    const d: KeyDirective = {
      kind: "Key",
      tonic: { kind: "Pitch", letter: "c", accidental: null, octave: 4, cents: 0, span },
      mode: "major",
      span,
    };
    expect(d.mode).toBe("major");
  });

  it("Binding with doc", () => {
    const b: Binding = {
      kind: "Binding",
      doc: " Major triad arpeggio.",
      name: "arp",
      params: ["root"],
      body: { kind: "EventList", events: [], span },
      span,
    };
    expect(b.doc).toContain("arpeggio");
    expect(b.params).toEqual(["root"]);
  });

  it("AbsolutePitch", () => {
    const p: AbsolutePitch = {
      kind: "Pitch",
      letter: "c",
      accidental: "#",
      octave: 4,
      cents: 0,
      span,
    };
    expect(p.accidental).toBe("#");
  });

  it("ScaleDegree", () => {
    const s: ScaleDegree = {
      kind: "ScaleDegree",
      degree: 4,
      accidental: "#",
      span,
    };
    expect(s.degree).toBe(4);
  });

  it("NoteEvent", () => {
    const n: NoteEvent = {
      kind: "Note",
      duration: { divisor: 4, dots: 0, triplet: false, raw: "4", span },
      pitch: { kind: "Pitch", letter: "c", accidental: null, octave: 4, cents: 0, span },
      modifiers: [],
      annotations: [],
      span,
    };
    expect(n.pitch.kind).toBe("Pitch");
  });

  it("ChordEvent", () => {
    const c: ChordEvent = {
      kind: "Chord",
      duration: { divisor: 4, dots: 0, triplet: false, raw: "4", span },
      pitches: [
        { kind: "Pitch", letter: "c", accidental: null, octave: 4, cents: 0, span },
        { kind: "Pitch", letter: "e", accidental: null, octave: 4, cents: 0, span },
        { kind: "Pitch", letter: "g", accidental: null, octave: 4, cents: 0, span },
      ],
      modifiers: [],
      annotations: [],
      span,
    };
    expect(c.pitches).toHaveLength(3);
  });

  it("SlideEvent", () => {
    const noteSrc: NoteEvent = {
      kind: "Note",
      duration: { divisor: 2, dots: 0, triplet: false, raw: "2", span },
      pitch: { kind: "Pitch", letter: "e", accidental: null, octave: 2, cents: 0, span },
      modifiers: [],
      annotations: [],
      span,
    };
    const noteDst: NoteEvent = {
      kind: "Note",
      pitch: { kind: "Pitch", letter: "c", accidental: null, octave: 3, cents: 0, span },
      modifiers: [],
      annotations: [],
      span,
    };
    const s: SlideEvent = { kind: "Slide", source: noteSrc, destination: noteDst, span };
    if (s.source.pitch.kind === "Pitch") {
      expect(s.source.pitch.letter).toBe("e");
    }
  });

  it("RampExpr", () => {
    const r: RampExpr = {
      kind: "Ramp",
      from: "\\mp",
      to: "\\ff",
      body: { kind: "Block", body: [], span },
      span,
    };
    expect(r.from).toBe("\\mp");
  });

  it("VoiceDecl with annotation", () => {
    const ann: Annotation = { kind: "Annotation", name: "@midi_channel", args: [], span };
    const v: VoiceDecl = {
      kind: "VoiceDecl",
      annotations: [ann],
      name: "melody",
      body: { kind: "Block", body: [], span },
      span,
    };
    expect(v.annotations[0]?.name).toBe("@midi_channel");
  });
});

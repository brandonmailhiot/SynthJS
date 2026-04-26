import { describe, expect, it, vi } from "vitest";
import type { NoteLetter } from "../pitch.js";
import type { Composition, NoteEvent } from "./nodes.js";
import { walk } from "./visitor.js";

const span = { start: 0, end: 0, line: 1, column: 1 };

const makeNote = (letter: NoteLetter): NoteEvent => ({
  kind: "Note",
  pitch: { kind: "Pitch", letter, accidental: null, octave: 4, cents: 0, span },
  modifiers: [],
  annotations: [],
  span,
});

describe("walk", () => {
  it("visits a composition body", () => {
    const c: Composition = {
      kind: "Composition",
      body: [makeNote("c"), makeNote("d")],
      span,
    };
    const seen: string[] = [];
    walk(c, {
      Note: (n) => {
        if (n.pitch.kind === "Pitch") seen.push(n.pitch.letter);
      },
    });
    expect(seen).toEqual(["c", "d"]);
  });

  it("descends into Slide source and destination", () => {
    const c: Composition = {
      kind: "Composition",
      body: [
        {
          kind: "Slide",
          source: {
            kind: "Note",
            duration: { divisor: 2, dots: 0, triplet: false, raw: "2", span },
            pitch: { kind: "Pitch", letter: "e", accidental: null, octave: 2, cents: 0, span },
            modifiers: [],
            annotations: [],
            span,
          },
          destination: {
            kind: "Note",
            pitch: { kind: "Pitch", letter: "c", accidental: null, octave: 3, cents: 0, span },
            modifiers: [],
            annotations: [],
            span,
          },
          span,
        },
      ],
      span,
    };
    const letters: string[] = [];
    walk(c, {
      Note: (n) => {
        if (n.pitch.kind === "Pitch") letters.push(n.pitch.letter);
      },
    });
    expect(letters).toEqual(["e", "c"]);
  });

  it("calls Composition visitor", () => {
    const fn = vi.fn();
    const c: Composition = { kind: "Composition", body: [], span };
    walk(c, { Composition: fn });
    expect(fn).toHaveBeenCalledWith(c);
  });

  it("visits UseDecl", () => {
    const fn = vi.fn();
    const c: Composition = {
      kind: "Composition",
      body: [{ kind: "UseDecl", path: "./foo.synth", span }],
      span,
    };
    walk(c, { UseDecl: fn, TopLevel: vi.fn() });
    expect(fn).toHaveBeenCalledOnce();
  });

  it("visits Directive kinds (Tempo, Time, Key, Instrument, Detune, Version)", () => {
    const fn = vi.fn();
    const c: Composition = {
      kind: "Composition",
      body: [
        { kind: "Tempo", value: 120, span },
        { kind: "Time", numerator: 4, denominator: 4, span },
        {
          kind: "Key",
          tonic: { kind: "Pitch", letter: "c", accidental: null, octave: 4, cents: 0, span },
          mode: "major",
          span,
        },
        { kind: "Instrument", name: "sine", span },
        { kind: "Detune", cents: 5, span },
        { kind: "Version", version: "2.0", span },
      ],
      span,
    };
    walk(c, { Directive: fn });
    expect(fn).toHaveBeenCalledTimes(6);
  });

  it("visits Binding and descends into EventList body", () => {
    const bindingFn = vi.fn();
    const eventListFn = vi.fn();
    const noteFn = vi.fn();
    const c: Composition = {
      kind: "Composition",
      body: [
        {
          kind: "Binding",
          name: "motif",
          body: { kind: "EventList", events: [makeNote("g")], span },
          span,
        },
      ],
      span,
    };
    walk(c, { Binding: bindingFn, EventList: eventListFn, Note: noteFn });
    expect(bindingFn).toHaveBeenCalledOnce();
    expect(eventListFn).toHaveBeenCalledOnce();
    expect(noteFn).toHaveBeenCalledOnce();
  });

  it("visits Binding with Block body", () => {
    const blockFn = vi.fn();
    const c: Composition = {
      kind: "Composition",
      body: [
        {
          kind: "Binding",
          name: "motif",
          body: { kind: "Block", body: [makeNote("a")], span },
          span,
        },
      ],
      span,
    };
    walk(c, { Block: blockFn });
    expect(blockFn).toHaveBeenCalledOnce();
  });

  it("visits VoiceDecl and its block body", () => {
    const voiceFn = vi.fn();
    const blockFn = vi.fn();
    const c: Composition = {
      kind: "Composition",
      body: [
        {
          kind: "VoiceDecl",
          name: "melody",
          annotations: [],
          body: { kind: "Block", body: [makeNote("b")], span },
          span,
        },
      ],
      span,
    };
    walk(c, { VoiceDecl: voiceFn, Block: blockFn });
    expect(voiceFn).toHaveBeenCalledOnce();
    expect(blockFn).toHaveBeenCalledTimes(1);
  });

  it("visits InstrumentDef", () => {
    const fn = vi.fn();
    const c: Composition = {
      kind: "Composition",
      body: [{ kind: "InstrumentDef", name: "warm", fields: [], span }],
      span,
    };
    walk(c, { InstrumentDef: fn });
    expect(fn).toHaveBeenCalledOnce();
  });

  it("visits Chord event", () => {
    const fn = vi.fn();
    const c: Composition = {
      kind: "Composition",
      body: [
        {
          kind: "Chord",
          pitches: [
            { kind: "Pitch", letter: "c", accidental: null, octave: 4, cents: 0, span },
            { kind: "Pitch", letter: "e", accidental: null, octave: 4, cents: 0, span },
          ],
          modifiers: [],
          annotations: [],
          span,
        },
      ],
      span,
    };
    walk(c, { Chord: fn });
    expect(fn).toHaveBeenCalledOnce();
  });

  it("visits Rest event", () => {
    const fn = vi.fn();
    const c: Composition = {
      kind: "Composition",
      body: [{ kind: "Rest", modifiers: [], annotations: [], span }],
      span,
    };
    walk(c, { Rest: fn });
    expect(fn).toHaveBeenCalledOnce();
  });

  it("passes through Sustain, Tie, Dynamic, Bar, MotifRef, Call without crashing", () => {
    const eventFn = vi.fn();
    const c: Composition = {
      kind: "Composition",
      body: [
        {
          kind: "Sustain",
          pitch: { kind: "Pitch", letter: "c", accidental: null, octave: 4, cents: 0, span },
          span,
        },
        {
          kind: "Tie",
          left: makeNote("c"),
          right: makeNote("d"),
          span,
        },
        { kind: "Dynamic", value: "\\mp", span },
        { kind: "Bar", double: false, span },
        { kind: "MotifRef", name: "arp", span },
        { kind: "Call", name: "echo", args: [], span },
      ],
      span,
    };
    walk(c, { Event: eventFn });
    expect(eventFn).toHaveBeenCalledTimes(6);
  });

  it("visits Ramp and descends into its block", () => {
    const fn = vi.fn();
    const noteFn = vi.fn();
    const c: Composition = {
      kind: "Composition",
      body: [
        {
          kind: "Ramp",
          from: "\\mp",
          to: "\\ff",
          body: { kind: "Block", body: [makeNote("c")], span },
          span,
        },
      ],
      span,
    };
    walk(c, { Ramp: fn, Note: noteFn });
    expect(fn).toHaveBeenCalledOnce();
    expect(noteFn).toHaveBeenCalledOnce();
  });

  it("visits Repeat and descends into its block", () => {
    const fn = vi.fn();
    const noteFn = vi.fn();
    const c: Composition = {
      kind: "Composition",
      body: [
        {
          kind: "Repeat",
          count: 4,
          body: { kind: "Block", body: [makeNote("d")], span },
          span,
        },
      ],
      span,
    };
    walk(c, { Repeat: fn, Note: noteFn });
    expect(fn).toHaveBeenCalledOnce();
    expect(noteFn).toHaveBeenCalledOnce();
  });

  it("visits With and descends into its block", () => {
    const fn = vi.fn();
    const c: Composition = {
      kind: "Composition",
      body: [
        {
          kind: "With",
          effects: [{ kind: "Call", name: "reverb", args: [], span }],
          body: { kind: "Block", body: [makeNote("e")], span },
          span,
        },
      ],
      span,
    };
    walk(c, { With: fn });
    expect(fn).toHaveBeenCalledOnce();
  });

  it("visits Envelope and descends into its block", () => {
    const fn = vi.fn();
    const c: Composition = {
      kind: "Composition",
      body: [
        {
          kind: "Envelope",
          call: { kind: "Call", name: "adsr", args: [], span },
          body: { kind: "Block", body: [makeNote("f")], span },
          span,
        },
      ],
      span,
    };
    walk(c, { Envelope: fn });
    expect(fn).toHaveBeenCalledOnce();
  });

  it("visits Tuplet and descends into its block", () => {
    const fn = vi.fn();
    const c: Composition = {
      kind: "Composition",
      body: [
        {
          kind: "Tuplet",
          n: 5,
          body: { kind: "Block", body: [makeNote("g")], span },
          span,
        },
      ],
      span,
    };
    walk(c, { Tuplet: fn });
    expect(fn).toHaveBeenCalledOnce();
  });

  it("visits Annotated and descends into its target event", () => {
    const annotatedFn = vi.fn();
    const noteFn = vi.fn();
    const c: Composition = {
      kind: "Composition",
      body: [
        {
          kind: "Annotated",
          annotations: [{ kind: "Annotation", name: "@cue", args: [], span }],
          target: makeNote("a"),
          span,
        },
      ],
      span,
    };
    walk(c, { Annotated: annotatedFn, Note: noteFn });
    expect(annotatedFn).toHaveBeenCalledOnce();
    expect(noteFn).toHaveBeenCalledOnce();
  });

  it("visits AnnotatedBlock and descends into its target block", () => {
    const annotatedBlockFn = vi.fn();
    const blockFn = vi.fn();
    const noteFn = vi.fn();
    const c: Composition = {
      kind: "Composition",
      body: [
        {
          kind: "AnnotatedBlock",
          annotations: [{ kind: "Annotation", name: "@section", args: [], span }],
          target: { kind: "Block", body: [makeNote("b")], span },
          span,
        },
      ],
      span,
    };
    walk(c, { AnnotatedBlock: annotatedBlockFn, Block: blockFn, Note: noteFn });
    expect(annotatedBlockFn).toHaveBeenCalledOnce();
    expect(blockFn).toHaveBeenCalledOnce();
    expect(noteFn).toHaveBeenCalledOnce();
  });
});

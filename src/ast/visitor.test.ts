import { describe, expect, it } from "vitest";
import type { Composition } from "./nodes.js";
import { walk } from "./visitor.js";

const span = { start: 0, end: 0, line: 1, column: 1 };

describe("walk", () => {
  it("visits a composition body", () => {
    const c: Composition = {
      kind: "Composition",
      body: [
        {
          kind: "Note",
          duration: { divisor: 4, dots: 0, triplet: false, raw: "4", span },
          pitch: { kind: "Pitch", letter: "c", accidental: null, octave: 4, cents: 0, span },
          modifiers: [],
          annotations: [],
          span,
        },
        {
          kind: "Note",
          pitch: { kind: "Pitch", letter: "d", accidental: null, octave: 4, cents: 0, span },
          modifiers: [],
          annotations: [],
          span,
        },
      ],
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
});

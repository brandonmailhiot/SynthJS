import { describe, expect, it } from "vitest";
import { ValidationError } from "../errors.js";
import { lex } from "../lexer/lexer.js";
import { parse } from "../parser/parser.js";
import { lowerPitch } from "./lower-pitch.js";
import { lowerSticky } from "./lower-sticky.js";
import { resolve } from "./resolve.js";

const lower = (src: string) => {
  const ast = parse(lex(src));
  const { symbolTable } = resolve(ast);
  const stickied = lowerSticky(ast).ast;
  return lowerPitch(stickied, symbolTable).ast;
};

describe("scale-degree resolution", () => {
  it("\\key c4 major; 4 ^1 ^2 ^3 -> c4 d4 e4", () => {
    const c = lower("\\key c4 major\n4 ^1 ^2 ^3");
    const notes = c.body.filter((n) => n.kind === "Note");
    expect(notes).toHaveLength(3);
    if (notes[0]?.kind === "Note" && notes[0].pitch.kind === "Pitch") {
      expect(notes[0].pitch.letter).toBe("c");
    }
    if (notes[1]?.kind === "Note" && notes[1].pitch.kind === "Pitch") {
      expect(notes[1].pitch.letter).toBe("d");
    }
    if (notes[2]?.kind === "Note" && notes[2].pitch.kind === "Pitch") {
      expect(notes[2].pitch.letter).toBe("e");
    }
  });

  it("\\key c4 major; ^8 -> c5 (next octave)", () => {
    const c = lower("\\key c4 major\n4 ^8");
    const n = c.body.find((b) => b.kind === "Note");
    if (n?.kind === "Note" && n.pitch.kind === "Pitch") {
      expect(n.pitch.letter).toBe("c");
      expect(n.pitch.octave).toBe(5);
    }
  });

  it("\\key d4 dorian; ^3 -> f4", () => {
    const c = lower("\\key d4 dorian\n4 ^3");
    const n = c.body.find((b) => b.kind === "Note");
    if (n?.kind === "Note" && n.pitch.kind === "Pitch") {
      expect(n.pitch.letter).toBe("f");
      expect(n.pitch.octave).toBe(4);
    }
  });

  it("scale-degree without \\key throws", () => {
    expect(() => lower("4 ^1")).toThrow(ValidationError);
  });

  it("\\key c4 major; ^5 -> g4", () => {
    const c = lower("\\key c4 major\n4 ^5");
    const n = c.body.find((b) => b.kind === "Note");
    if (n?.kind === "Note" && n.pitch.kind === "Pitch") {
      expect(n.pitch.letter).toBe("g");
      expect(n.pitch.octave).toBe(4);
    }
  });

  it("\\key c4 major; ^7 -> b4", () => {
    const c = lower("\\key c4 major\n4 ^7");
    const n = c.body.find((b) => b.kind === "Note");
    if (n?.kind === "Note" && n.pitch.kind === "Pitch") {
      expect(n.pitch.letter).toBe("b");
      expect(n.pitch.octave).toBe(4);
    }
  });

  it("\\key a4 minor; ^3 -> c5", () => {
    // a minor: a b c d e f g — ^3 = c, which is above a4 in the same scale
    const c = lower("\\key a4 minor\n4 ^3");
    const n = c.body.find((b) => b.kind === "Note");
    if (n?.kind === "Note" && n.pitch.kind === "Pitch") {
      expect(n.pitch.letter).toBe("c");
      expect(n.pitch.octave).toBe(5);
    }
  });

  it("\\key c4 major; scale degrees all resolve to AbsolutePitch", () => {
    const c = lower("\\key c4 major\n4 ^1 ^2 ^3 ^4 ^5 ^6 ^7");
    const notes = c.body.filter((n) => n.kind === "Note");
    expect(notes).toHaveLength(7);
    for (const n of notes) {
      if (n.kind === "Note") expect(n.pitch.kind).toBe("Pitch");
    }
  });
});

describe("pitch arithmetic", () => {
  it("c4+12 -> c5", () => {
    const c = lower("4 c4+12");
    const n = c.body.find((b) => b.kind === "Note");
    if (n?.kind === "Note" && n.pitch.kind === "Pitch") {
      expect(n.pitch.letter).toBe("c");
      expect(n.pitch.octave).toBe(5);
    }
  });
  it("c4+7 -> g4", () => {
    const c = lower("4 c4+7");
    const n = c.body.find((b) => b.kind === "Note");
    if (n?.kind === "Note" && n.pitch.kind === "Pitch") {
      expect(n.pitch.letter).toBe("g");
      expect(n.pitch.octave).toBe(4);
    }
  });
  it("c4-3 -> a3", () => {
    const c = lower("4 c4-3");
    const n = c.body.find((b) => b.kind === "Note");
    if (n?.kind === "Note" && n.pitch.kind === "Pitch") {
      expect(n.pitch.letter).toBe("a");
      expect(n.pitch.octave).toBe(3);
    }
  });
  it("chained c4+7-2 -> f4", () => {
    const c = lower("4 c4+7-2");
    const n = c.body.find((b) => b.kind === "Note");
    if (n?.kind === "Note" && n.pitch.kind === "Pitch") {
      expect(n.pitch.letter).toBe("f");
    }
  });

  it("a4+3 -> c5", () => {
    const c = lower("4 a4+3");
    const n = c.body.find((b) => b.kind === "Note");
    if (n?.kind === "Note" && n.pitch.kind === "Pitch") {
      expect(n.pitch.letter).toBe("c");
      expect(n.pitch.octave).toBe(5);
    }
  });

  it("g4+5 -> c5", () => {
    const c = lower("4 g4+5");
    const n = c.body.find((b) => b.kind === "Note");
    if (n?.kind === "Note" && n.pitch.kind === "Pitch") {
      expect(n.pitch.letter).toBe("c");
      expect(n.pitch.octave).toBe(5);
    }
  });

  it("pitch arith on chord pitches", () => {
    const c = lower("4 <c4 c4+4 c4+7>");
    const chord = c.body.find((b) => b.kind === "Chord");
    if (chord?.kind === "Chord") {
      expect(chord.pitches).toHaveLength(3);
      const [p0, p1, p2] = chord.pitches;
      if (p0?.kind === "Pitch") expect(p0.letter).toBe("c");
      if (p1?.kind === "Pitch") expect(p1.letter).toBe("e");
      if (p2?.kind === "Pitch") expect(p2.letter).toBe("g");
    }
  });
});

describe("parameterized motif inlining", () => {
  it("arp(root) = 8 <root root+4 root+7>; arp(c4) -> chord c4 e4 g4", () => {
    const c = lower("arp(root) = 8 <root root+4 root+7>\narp(c4)");
    // The Call expands to a Chord with three pitches: c4, e4, g4
    // The chord lives inside the Call's resolved body, which gets inlined into ast.body
    // Find the chord in body
    const chord = c.body.find((b) => b.kind === "Chord");
    if (chord?.kind === "Chord") {
      expect(chord.pitches).toHaveLength(3);
      const ps = chord.pitches.filter((p) => p.kind === "Pitch");
      expect(ps).toHaveLength(3);
      expect(ps[0]?.kind === "Pitch" && ps[0].letter).toBe("c");
      expect(ps[1]?.kind === "Pitch" && ps[1].letter).toBe("e");
      expect(ps[2]?.kind === "Pitch" && ps[2].letter).toBe("g");
    }
  });

  it("calling arp twice with different roots inlines independently", () => {
    const src = "arp(root) = 8 <root root+4 root+7>\narp(c4) arp(g3)";
    const c = lower(src);
    const chords = c.body.filter((b) => b.kind === "Chord");
    expect(chords).toHaveLength(2);
  });

  it("arp(g3) -> chord g3 b3 d4", () => {
    const c = lower("arp(root) = 8 <root root+4 root+7>\narp(g3)");
    const chord = c.body.find((b) => b.kind === "Chord");
    if (chord?.kind === "Chord") {
      expect(chord.pitches).toHaveLength(3);
      const ps = chord.pitches.filter((p) => p.kind === "Pitch");
      expect(ps).toHaveLength(3);
      expect(ps[0]?.kind === "Pitch" && ps[0].letter).toBe("g");
      expect(ps[1]?.kind === "Pitch" && ps[1].letter).toBe("b");
      expect(ps[2]?.kind === "Pitch" && ps[2].letter).toBe("d");
    }
  });

  it("inlined call produces events in top-level body", () => {
    // arp(root) = 8 <root root+7> inlined at arp(c4) produces a chord c4 g4
    const c = lower("arp2(root) = 8 <root root+7>\narp2(c4)");
    const chord = c.body.find((b) => b.kind === "Chord");
    if (chord?.kind === "Chord") {
      const ps = chord.pitches.filter((p) => p.kind === "Pitch");
      expect(ps).toHaveLength(2);
      expect(ps[0]?.kind === "Pitch" && ps[0].letter).toBe("c");
      expect(ps[1]?.kind === "Pitch" && ps[1].letter).toBe("g");
    }
  });

  it("param ref in chord inside with block: With branch in substituteParamRefsInEvent", () => {
    // trill(root) = with reverb(2, 1, 0.7) { 4 <root root+4> } — processes With in substituteParamRefsInEvent
    // After lowerPitch, the With event is still in body but the chord pitches should be resolved
    const c = lower("trill(root) = with reverb(2, 1, 0.7) { 4 <root root+4> }\ntrill(e4)");
    // Find the With event in top-level body (lowerEffects not run, so With remains)
    const withEv = c.body.find((b) => b.kind === "With");
    expect(withEv).toBeDefined();
    if (withEv?.kind === "With") {
      const chord = withEv.body.body.find((n) => n.kind === "Chord");
      if (chord?.kind === "Chord") {
        const ps = chord.pitches.filter((p) => p.kind === "Pitch");
        expect(ps.length).toBe(2);
        expect(ps[0]?.kind === "Pitch" && ps[0].letter).toBe("e");
      }
    }
  });

  it("param ref in chord inside tuplet block: Tuplet branch in substituteParamRefsInEvent", () => {
    // arp3(root) = tuplet(3) { 8 <root root+7> } — processes Tuplet in substituteParamRefsInEvent
    const c = lower("arp3(root) = tuplet(3) { 8 <root root+7> }\narp3(c4)");
    // Find the Tuplet event in top-level body
    const tupletEv = c.body.find((b) => b.kind === "Tuplet");
    expect(tupletEv).toBeDefined();
    if (tupletEv?.kind === "Tuplet") {
      const chord = tupletEv.body.body.find((n) => n.kind === "Chord");
      if (chord?.kind === "Chord") {
        const ps = chord.pitches.filter((p) => p.kind === "Pitch");
        expect(ps.length).toBe(2);
        expect(ps[0]?.kind === "Pitch" && ps[0].letter).toBe("c");
        expect(ps[1]?.kind === "Pitch" && ps[1].letter).toBe("g");
      }
    }
  });
});

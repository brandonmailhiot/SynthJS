import { describe, expect, it } from "vitest";
import { lex } from "../lexer/lexer.js";
import { parse } from "../parser/parser.js";
import { expandRepeats } from "./expand-repeats.js";

const expand = (src: string) => expandRepeats(parse(lex(src)));

describe("expand-repeats — group repeat", () => {
  it("repeat 3 { 4 c4 } -> three notes", () => {
    const c = expand("repeat 3 { 4 c4 }");
    const notes = c.body.filter((b) => b.kind === "Note");
    expect(notes).toHaveLength(3);
  });
  it("nested repeats: repeat 2 { repeat 3 { 4 c4 } } -> 6 notes", () => {
    const c = expand("repeat 2 { repeat 3 { 4 c4 } }");
    const notes = c.body.filter((b) => b.kind === "Note");
    expect(notes).toHaveLength(6);
  });
  it("repeat 0 -> no events (zero is valid)", () => {
    const c = expand("repeat 0 { 4 c4 }");
    expect(c.body).toHaveLength(0);
  });
});

describe("expand-repeats — event repeat", () => {
  it("4 c4 * 4 -> four notes", () => {
    const c = expand("4 c4 * 4");
    const notes = c.body.filter((b) => b.kind === "Note");
    expect(notes).toHaveLength(4);
    for (const n of notes) {
      if (n.kind === "Note") expect(n.repeat).toBeUndefined();
    }
  });
  it("4 c4 * 1 -> one note", () => {
    const c = expand("4 c4 * 1");
    const notes = c.body.filter((b) => b.kind === "Note");
    expect(notes).toHaveLength(1);
  });
});

describe("expand-repeats — combined", () => {
  it("repeat 2 { 4 c4 * 3 } -> 6 notes", () => {
    const c = expand("repeat 2 { 4 c4 * 3 }");
    const notes = c.body.filter((b) => b.kind === "Note");
    expect(notes).toHaveLength(6);
  });
  it("repeat preserves order", () => {
    const c = expand("repeat 2 { 4 c4 d4 }");
    const notes = c.body.filter((b) => b.kind === "Note");
    expect(notes).toHaveLength(4);
    if (notes[0]?.kind === "Note" && notes[0].pitch.kind === "Pitch")
      expect(notes[0].pitch.letter).toBe("c");
    if (notes[1]?.kind === "Note" && notes[1].pitch.kind === "Pitch")
      expect(notes[1].pitch.letter).toBe("d");
    if (notes[2]?.kind === "Note" && notes[2].pitch.kind === "Pitch")
      expect(notes[2].pitch.letter).toBe("c");
    if (notes[3]?.kind === "Note" && notes[3].pitch.kind === "Pitch")
      expect(notes[3].pitch.letter).toBe("d");
  });
});

describe("expand-repeats — voices", () => {
  it("repeat inside voice body", () => {
    const c = expand("voice melody { repeat 3 { 4 c4 } }");
    const v = c.body.find((b) => b.kind === "VoiceDecl");
    if (v?.kind === "VoiceDecl") {
      const notes = v.body.body.filter((b) => b.kind === "Note");
      expect(notes).toHaveLength(3);
    }
  });
});

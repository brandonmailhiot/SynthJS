import { describe, expect, it } from "vitest";
import { LexError } from "../errors.js";
import { lex } from "./lexer.js";

const kinds = (src: string) => lex(src).map((t) => t.kind);

describe("lex — empty and whitespace", () => {
  it("empty input yields just Eof", () => {
    expect(kinds("")).toEqual(["Eof"]);
  });
  it("whitespace yields just Eof", () => {
    expect(kinds("   \n  \t ")).toEqual(["Eof"]);
  });
});

describe("lex — comments and doc comments", () => {
  it("discards line comments", () => {
    expect(kinds("// hello\n4 a4")).toEqual(["IntLiteral", "Pitch", "Eof"]);
  });
  it("discards block comments", () => {
    expect(kinds("/* hi */ 4 a4")).toEqual(["IntLiteral", "Pitch", "Eof"]);
  });
  it("captures doc comments", () => {
    const tokens = lex("/// hello\n4 a4");
    expect(tokens[0]).toMatchObject({ kind: "DocComment", value: " hello" });
    expect(tokens.map((t) => t.kind)).toEqual(["DocComment", "IntLiteral", "Pitch", "Eof"]);
  });
  it("unterminated block comment throws", () => {
    expect(() => lex("/* unterminated")).toThrow(LexError);
  });
});

describe("lex — pitches", () => {
  it("c4", () => {
    expect(lex("c4")[0]).toMatchObject({ kind: "Pitch", value: "c4" });
  });
  it("c#4", () => {
    expect(lex("c#4")[0]).toMatchObject({ kind: "Pitch", value: "c#4" });
  });
  it("cb4", () => {
    expect(lex("cb4")[0]).toMatchObject({ kind: "Pitch", value: "cb4" });
  });
  it("c##4", () => {
    expect(lex("c##4")[0]).toMatchObject({ kind: "Pitch", value: "c##4" });
  });
  it("cbb4", () => {
    expect(lex("cbb4")[0]).toMatchObject({ kind: "Pitch", value: "cbb4" });
  });
  it("cn4", () => {
    expect(lex("cn4")[0]).toMatchObject({ kind: "Pitch", value: "cn4" });
  });
  it("a4+15c", () => {
    expect(lex("a4+15c")[0]).toMatchObject({ kind: "Pitch", value: "a4+15c" });
  });
  it("a4-7c", () => {
    expect(lex("a4-7c")[0]).toMatchObject({ kind: "Pitch", value: "a4-7c" });
  });
  it("c4 b4 are two separate tokens", () => {
    const tokens = lex("c4 b4");
    expect(tokens.slice(0, 2).map((t) => t.value)).toEqual(["c4", "b4"]);
  });
});

describe("lex — durations and integers", () => {
  it("integer", () => {
    expect(lex("12")[0]).toMatchObject({ kind: "IntLiteral", value: "12" });
  });
  it("float", () => {
    expect(lex("0.5")[0]).toMatchObject({ kind: "FloatLiteral", value: "0.5" });
  });
});

describe("lex — backslash commands and dynamics", () => {
  it("\\tempo is BackslashCommand", () => {
    expect(lex("\\tempo")[0]).toMatchObject({ kind: "BackslashCommand", value: "\\tempo" });
  });
  it("\\version", () => {
    expect(lex("\\version")[0]).toMatchObject({ kind: "BackslashCommand", value: "\\version" });
  });
  it("\\mf is Dynamic", () => {
    expect(lex("\\mf")[0]).toMatchObject({ kind: "Dynamic", value: "\\mf" });
  });
  it("\\ff is Dynamic", () => {
    expect(lex("\\ff")[0]).toMatchObject({ kind: "Dynamic", value: "\\ff" });
  });
  it("bare \\\\ throws", () => {
    expect(() => lex("\\")).toThrow(LexError);
  });
});

describe("lex — annotations", () => {
  it("@section", () => {
    expect(lex("@section")[0]).toMatchObject({ kind: "AnnotationName", value: "@section" });
  });
  it("@cue", () => {
    expect(lex("@cue")[0]).toMatchObject({ kind: "AnnotationName", value: "@cue" });
  });
  it("@vary with args", () => {
    expect(kinds("@vary(timing: 5)")).toEqual([
      "AnnotationName",
      "LParen",
      "Identifier",
      "Colon",
      "IntLiteral",
      "RParen",
      "Eof",
    ]);
  });
  it("bare @ throws", () => {
    expect(() => lex("@")).toThrow(LexError);
  });
});

describe("lex — strings", () => {
  it("simple string", () => {
    expect(lex('"hello"')[0]).toMatchObject({ kind: "String", value: "hello" });
  });
  it("string with escape", () => {
    expect(lex('"he said \\"hi\\""')[0]).toMatchObject({
      kind: "String",
      value: 'he said "hi"',
    });
  });
  it("unterminated string throws", () => {
    expect(() => lex('"oops')).toThrow(LexError);
  });
});

describe("lex — punctuation", () => {
  it("structural", () => {
    expect(kinds(", ; : = { } ( )")).toEqual([
      "Comma",
      "Semicolon",
      "Colon",
      "Equals",
      "LBrace",
      "RBrace",
      "LParen",
      "RParen",
      "Eof",
    ]);
  });
  it("operators", () => {
    expect(kinds("+ - * ~ . _ ^ #")).toEqual([
      "Plus",
      "Minus",
      "Star",
      "Tilde",
      "Dot",
      "Underscore",
      "Caret",
      "Hash",
      "Eof",
    ]);
  });
  it("arrow vs minus", () => {
    expect(kinds("-> -")).toEqual(["Arrow", "Minus", "Eof"]);
  });
  it("pipe vs double-pipe", () => {
    expect(kinds("| ||")).toEqual(["Pipe", "DoublePipe", "Eof"]);
  });
  it("chord delimiters", () => {
    expect(kinds("< >")).toEqual(["LAngle", "RAngle", "Eof"]);
  });
  it("slash", () => {
    expect(kinds("4 / 4")).toEqual(["IntLiteral", "Slash", "IntLiteral", "Eof"]);
  });
});

describe("lex — composite expressions", () => {
  it("simple note event", () => {
    expect(kinds("4 c4")).toEqual(["IntLiteral", "Pitch", "Eof"]);
  });
  it("chord", () => {
    expect(kinds("4 <c4 e g>")).toEqual([
      "IntLiteral",
      "LAngle",
      "Pitch",
      "Identifier",
      "Identifier",
      "RAngle",
      "Eof",
    ]);
  });
  it("slide", () => {
    expect(kinds("4 c4 -> e4")).toEqual(["IntLiteral", "Pitch", "Arrow", "Pitch", "Eof"]);
  });
  it("repeat", () => {
    expect(kinds("4 c4 * 4")).toEqual(["IntLiteral", "Pitch", "Star", "IntLiteral", "Eof"]);
  });
  it("motif binding", () => {
    expect(kinds("intro = 4 c4 d e f")).toEqual([
      "Identifier",
      "Equals",
      "IntLiteral",
      "Pitch",
      "Identifier",
      "Identifier",
      "Identifier",
      "Eof",
    ]);
  });
  it("scale degree with accidental", () => {
    expect(kinds("^4#")).toEqual(["Caret", "IntLiteral", "Hash", "Eof"]);
  });
  it("dynamic + note", () => {
    expect(kinds("\\mf 4 c4")).toEqual(["Dynamic", "IntLiteral", "Pitch", "Eof"]);
  });
  it("annotation postfix on pitch", () => {
    expect(kinds("4 c4@cue")).toEqual(["IntLiteral", "Pitch", "AnnotationName", "Eof"]);
  });
  it("time signature", () => {
    expect(kinds("\\time 4/4")).toEqual([
      "BackslashCommand",
      "IntLiteral",
      "Slash",
      "IntLiteral",
      "Eof",
    ]);
  });
});

describe("lex — identifiers vs pitches", () => {
  it("'arp' is identifier (no octave)", () => {
    expect(lex("arp")[0]).toMatchObject({ kind: "Identifier", value: "arp" });
  });
  it("'a' (no octave) is identifier", () => {
    expect(lex("a")[0]).toMatchObject({ kind: "Identifier", value: "a" });
  });
  it("'voice' is identifier", () => {
    expect(lex("voice")[0]).toMatchObject({ kind: "Identifier", value: "voice" });
  });
});

describe("lex — line/column tracking", () => {
  it("tracks newlines", () => {
    const tokens = lex("4 c4\n4 d4");
    expect(tokens[2]?.span).toMatchObject({ line: 2, column: 1 });
  });
  it("tracks columns", () => {
    const tokens = lex("4 c4");
    expect(tokens[0]?.span).toMatchObject({ line: 1, column: 1 });
    expect(tokens[1]?.span).toMatchObject({ line: 1, column: 3 });
  });
});

describe("lex — errors", () => {
  it("unknown character", () => {
    expect(() => lex("4 c4 ! 4 d4")).toThrow(LexError);
  });
});

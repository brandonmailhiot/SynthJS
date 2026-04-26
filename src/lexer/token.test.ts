import { describe, expect, it } from "vitest";
import { type Token, type TokenKind, tokenKindLabel } from "./token.js";

describe("tokenKindLabel", () => {
  it("returns labels for every kind", () => {
    const cases: [TokenKind, string][] = [
      ["BackslashCommand", "command"],
      ["Dynamic", "dynamic"],
      ["AnnotationName", "annotation"],
      ["DocComment", "doc comment"],
      ["Pitch", "pitch"],
      ["IntLiteral", "integer"],
      ["FloatLiteral", "number"],
      ["Identifier", "identifier"],
      ["String", "string"],
      ["Comma", "','"],
      ["Semicolon", "';'"],
      ["Colon", "':'"],
      ["Equals", "'='"],
      ["LBrace", "'{'"],
      ["RBrace", "'}'"],
      ["LParen", "'('"],
      ["RParen", "')'"],
      ["LAngle", "'<'"],
      ["RAngle", "'>'"],
      ["Pipe", "'|'"],
      ["DoublePipe", "'||'"],
      ["Plus", "'+'"],
      ["Minus", "'-'"],
      ["Star", "'*'"],
      ["Arrow", "'->'"],
      ["Tilde", "'~'"],
      ["Dot", "'.'"],
      ["Underscore", "'_'"],
      ["Caret", "'^'"],
      ["Hash", "'#'"],
      ["Slash", "'/'"],
      ["Eof", "end of input"],
    ];
    for (const [k, label] of cases) {
      expect(tokenKindLabel(k)).toBe(label);
    }
  });

  it("Token shape", () => {
    const t: Token = {
      kind: "Pitch",
      value: "a4",
      span: { start: 0, end: 2, line: 1, column: 1 },
    };
    expect(t.kind).toBe("Pitch");
  });
});

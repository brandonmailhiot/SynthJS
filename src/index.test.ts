import { describe, expect, it } from "vitest";
import { type Composition, LexError, ParseError, formatError, parse } from "./index.js";

describe("public parse()", () => {
  it("returns a Composition", () => {
    const c: Composition = parse("4 c4");
    expect(c.kind).toBe("Composition");
  });
  it("captures \\version", () => {
    const c = parse('\\version "2.0"\n4 c4');
    expect(c.version).toBe("2.0");
  });
  it("throws on lex error", () => {
    expect(() => parse("4 c4 ! 4 d4")).toThrow(LexError);
  });
  it("throws on parse error", () => {
    expect(() => parse("4 ,")).toThrow(ParseError);
  });
  it("formatError works", () => {
    try {
      parse("4 c4 ! 4 d4");
    } catch (e) {
      if (e instanceof LexError) {
        const msg = formatError(e, "4 c4 ! 4 d4");
        expect(msg).toContain("LexError");
      }
    }
  });
});

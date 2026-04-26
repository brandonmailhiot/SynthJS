import { describe, expect, it } from "vitest";
import {
  LexError,
  ParseError,
  ResolveError,
  type SourceSpan,
  ValidationError,
  formatError,
} from "./errors.js";

const span: SourceSpan = { start: 5, end: 8, line: 1, column: 6 };

describe("error classes", () => {
  it("LexError carries span and name", () => {
    const e = new LexError("oops", span);
    expect(e.message).toBe("oops");
    expect(e.span).toEqual(span);
    expect(e.name).toBe("LexError");
    expect(e).toBeInstanceOf(Error);
  });
  it("ParseError carries span and name", () => {
    const e = new ParseError("oops", span);
    expect(e.name).toBe("ParseError");
  });
  it("ResolveError carries span, name, and optional suggestion", () => {
    const e = new ResolveError("unknown 'rvb'", span, "reverb");
    expect(e.name).toBe("ResolveError");
    expect(e.suggestion).toBe("reverb");
  });
  it("ValidationError carries span and severity", () => {
    const e = new ValidationError("bar mismatch", span, "warning");
    expect(e.name).toBe("ValidationError");
    expect(e.severity).toBe("warning");
  });
});

describe("formatError", () => {
  it("formats a LexError with snippet", () => {
    const source = "q a4 ! q b4";
    const e = new LexError("unexpected character '!'", {
      start: 5,
      end: 6,
      line: 1,
      column: 6,
    });
    const out = formatError(e, source);
    expect(out).toContain("LexError: unexpected character '!'");
    expect(out).toContain("at line 1, col 6");
    expect(out).toContain("q a4 ! q b4");
    expect(out).toContain("^");
  });

  it("includes suggestion for ResolveError", () => {
    const source = "with rvb(2,1,0.7) {}";
    const e = new ResolveError(
      "unknown effect 'rvb'",
      {
        start: 5,
        end: 8,
        line: 1,
        column: 6,
      },
      "reverb",
    );
    const out = formatError(e, source);
    expect(out).toContain("did you mean 'reverb'?");
  });
});

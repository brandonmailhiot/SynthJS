import { describe, expect, it } from "vitest";
import { getDiagnostics } from "./diagnostics.js";

describe("getDiagnostics", () => {
  it("valid source -> no errors", () => {
    expect(getDiagnostics("4 c4")).toEqual([]);
  });

  it("LexError -> one error diagnostic", () => {
    const diags = getDiagnostics("4 c4 ! 4 d4");
    expect(diags).toHaveLength(1);
    expect(diags[0]?.severity).toBe("error");
    expect(diags[0]?.source).toBe("synthjs");
    expect(diags[0]?.message).toContain("unexpected character");
  });

  it("ParseError diagnostic has range", () => {
    const diags = getDiagnostics("4 ,");
    expect(diags).toHaveLength(1);
    expect(diags[0]?.range).toBeDefined();
    expect(diags[0]?.range.start.line).toBe(1);
  });

  it("ResolveError with suggestion preserves suggestion field", () => {
    const diags = getDiagnostics("with reveerb(2, 1, 0.7) { 4 c4 }");
    expect(diags).toHaveLength(1);
    expect(diags[0]?.suggestion).toBe("reverb");
  });

  it("compileSync warnings (bar mismatch) yield warning severity", () => {
    const src = "\\time 4/4\n4 c4 d e |";
    const diags = getDiagnostics(src);
    expect(diags.length).toBeGreaterThanOrEqual(1);
    expect(diags.some((d) => d.severity === "warning")).toBe(true);
  });

  it("ValidationError with no \\key on scale-degree", () => {
    const diags = getDiagnostics("4 ^1");
    expect(diags).toHaveLength(1);
    expect(diags[0]?.severity).toBe("error");
  });

  it("source field is always 'synthjs'", () => {
    const diags = getDiagnostics("4 c4 ! 4 d4");
    for (const d of diags) expect(d.source).toBe("synthjs");
  });

  it("diagnostic range has valid start and end positions", () => {
    const diags = getDiagnostics("4 c4 ! 4 d4");
    expect(diags[0]?.range.start).toHaveProperty("line");
    expect(diags[0]?.range.start).toHaveProperty("column");
    expect(diags[0]?.range.end).toHaveProperty("line");
    expect(diags[0]?.range.end).toHaveProperty("column");
  });

  it("ParseError severity is error", () => {
    const diags = getDiagnostics("4 ,");
    expect(diags[0]?.severity).toBe("error");
  });

  it("valid multi-note source -> no diagnostics", () => {
    expect(getDiagnostics("4 c4 d4 e4 f4")).toEqual([]);
  });
});

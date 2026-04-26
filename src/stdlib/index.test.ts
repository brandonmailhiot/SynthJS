import { describe, expect, it } from "vitest";
import { STDLIB, getStdlibSource, isStdlibPath } from "./index.js";

describe("STDLIB registry", () => {
  it("contains all stdlib modules", () => {
    expect(Object.keys(STDLIB).sort()).toEqual([
      "@stdlib/chords",
      "@stdlib/drums",
      "@stdlib/drums-sampled",
      "@stdlib/fx",
      "@stdlib/instruments",
      "@stdlib/scales",
    ]);
  });

  it("isStdlibPath accepts known paths", () => {
    expect(isStdlibPath("@stdlib/scales")).toBe(true);
    expect(isStdlibPath("@stdlib/instruments")).toBe(true);
  });

  it("isStdlibPath rejects others", () => {
    expect(isStdlibPath("./foo.synth")).toBe(false);
    expect(isStdlibPath("@stdlib/unknown")).toBe(false);
  });

  it("getStdlibSource returns content", () => {
    expect(getStdlibSource("@stdlib/scales")).toContain("major_scale");
  });

  it("getStdlibSource returns undefined for unknown", () => {
    expect(getStdlibSource("@stdlib/unknown")).toBeUndefined();
  });

  it("each stdlib source parses cleanly", async () => {
    const { lex } = await import("../lexer/lexer.js");
    const { parse } = await import("../parser/parser.js");
    for (const path of Object.keys(STDLIB)) {
      const src = getStdlibSource(path) ?? "";
      expect(src).not.toBe("");
      expect(() => parse(lex(src))).not.toThrow();
    }
  });
});

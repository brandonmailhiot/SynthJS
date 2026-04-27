import { describe, expect, it } from "vitest";
import { mergeBlocks } from "./merge.js";

describe("mergeBlocks", () => {
  it("replaces a named voice in place when the AI returns just that voice", () => {
    const cur = `voice a { 4 c4 }
voice b { 4 d4 }
voice c { 4 e4 }`;
    const ai = "voice b { 4 D4 D4 }";
    const m = mergeBlocks(cur, ai);
    expect(m.replaced).toEqual(["voice b"]);
    expect(m.added).toEqual([]);
    expect(m.text).toContain("voice a { 4 c4 }");
    expect(m.text).toContain("voice b { 4 D4 D4 }");
    expect(m.text).toContain("voice c { 4 e4 }");
  });

  it("appends a new voice when the AI introduces one not in the current source", () => {
    const cur = "voice a { 4 c4 }";
    const ai = "voice b { 4 d4 }";
    const m = mergeBlocks(cur, ai);
    expect(m.added).toEqual(["voice b"]);
    expect(m.replaced).toEqual([]);
    expect(m.text).toContain("voice a { 4 c4 }");
    expect(m.text).toContain("voice b { 4 d4 }");
  });

  it("replaces an instrument define in place", () => {
    const cur = `instrument define lead { oscillator sine }
voice a { \\instrument lead 4 c4 }`;
    const ai = "instrument define lead { oscillator sawtooth gain 0.7 }";
    const m = mergeBlocks(cur, ai);
    expect(m.replaced).toEqual(["instrument lead"]);
    expect(m.text).toContain("oscillator sawtooth gain 0.7");
    expect(m.text).not.toMatch(/oscillator sine/);
    expect(m.text).toContain("\\instrument lead 4 c4");
  });

  it("replaces a tempo directive when the AI returns just \\tempo", () => {
    const cur = "\\tempo 100\nvoice a { 4 c4 }";
    const ai = "\\tempo 128";
    const m = mergeBlocks(cur, ai);
    expect(m.text).toContain("\\tempo 128");
    expect(m.text).not.toContain("\\tempo 100");
    expect(m.text).toContain("voice a { 4 c4 }");
  });

  it("dedupes a \\use directive (same path is replaced in place)", () => {
    const cur = `\\use "@stdlib/drums"\nvoice a { 4 c4 }`;
    const ai = `\\use "@stdlib/drums"`;
    const m = mergeBlocks(cur, ai);
    expect((m.text.match(/@stdlib\/drums/g) ?? []).length).toBe(1);
  });

  it("can replace multiple distinct voices in one AI revision", () => {
    const cur = `voice a { 4 c4 }
voice b { 4 d4 }
voice c { 4 e4 }`;
    const ai = "voice a { 4 C4 }\nvoice c { 4 E4 }";
    const m = mergeBlocks(cur, ai);
    expect(m.replaced.sort()).toEqual(["voice a", "voice c"]);
    expect(m.text).toContain("voice a { 4 C4 }");
    expect(m.text).toContain("voice b { 4 d4 }");
    expect(m.text).toContain("voice c { 4 E4 }");
  });

  it("falls back to the AI output when the current source fails to parse", () => {
    const cur = "voice broken { 4 ,";
    const ai = "voice a { 4 c4 }";
    const m = mergeBlocks(cur, ai);
    expect(m.text).toBe("voice a { 4 c4 }");
  });

  it("falls back to the AI output when the AI source fails to parse", () => {
    const cur = "voice a { 4 c4 }";
    const ai = "garbage @@@";
    const m = mergeBlocks(cur, ai);
    expect(m.text).toBe("garbage @@@");
  });
});

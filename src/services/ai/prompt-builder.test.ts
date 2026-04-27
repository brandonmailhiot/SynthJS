import { describe, expect, it } from "vitest";
import {
  buildPrompt,
  extractAllDslBlocks,
  extractDslBlock,
  isTruncated,
} from "./prompt-builder.js";

describe("buildPrompt", () => {
  it("includes the grammar primer + examples + instruction", () => {
    const p = buildPrompt({ currentSource: "", instruction: "make a kick pattern" });
    expect(p).toContain("SynthJS");
    expect(p).toContain("synth");
    expect(p).toContain("Task: make a kick pattern");
  });

  it("embeds current source under a 'Current composition' heading", () => {
    const src = "voice m { 4 c4 }";
    const p = buildPrompt({ currentSource: src, instruction: "transpose up" });
    expect(p).toContain("Current composition");
    expect(p).toContain(src);
  });

  it("includes the user reference when supplied and different from current", () => {
    const p = buildPrompt({
      currentSource: "voice m { 4 c4 }",
      reference: "voice m { 4 c4 d4 }",
      instruction: "extend",
    });
    expect(p).toContain("User-provided reference");
    expect(p).toContain("4 c4 d4");
  });

  it("does not duplicate the reference when it matches the current source", () => {
    const src = "voice m { 4 c4 }";
    const p = buildPrompt({ currentSource: src, reference: src, instruction: "x" });
    const refCount = (p.match(/User-provided reference/g) ?? []).length;
    expect(refCount).toBe(0);
  });

  it("pins the AI to a specific voice when the instruction names it", () => {
    const src = "voice pluck { 4 c4 }\nvoice lead { 4 d4 }\nvoice kick { 4 c2 }";
    const p = buildPrompt({
      currentSource: src,
      instruction: "make the pluck voice more melancholic",
    });
    expect(p).toContain("STRICT SCOPE");
    expect(p).toContain("voice pluck");
    // Should NOT pull in unrelated voices
    expect(p).not.toMatch(/STRICT SCOPE.*voice lead/);
  });

  it("pins both a voice and its instrument when both are named", () => {
    const src =
      "instrument define pluck_synth { oscillator triangle }\nvoice pluck { \\instrument pluck_synth 4 c4 }";
    const p = buildPrompt({
      currentSource: src,
      instruction: "rework the pluck_synth instrument and the pluck voice",
    });
    expect(p).toContain("voice pluck");
    expect(p).toContain("instrument pluck_synth");
  });

  it("omits the strict-scope rule when the instruction matches no existing names", () => {
    const src = "voice main { 4 c4 }";
    const p = buildPrompt({
      currentSource: src,
      instruction: "make a synthwave intro",
    });
    expect(p).not.toContain("STRICT SCOPE");
  });
});

describe("extractDslBlock", () => {
  it("extracts a fenced ```synth block", () => {
    const out = "Here you go:\n```synth\nvoice m { 4 c4 }\n```\nDone.";
    expect(extractDslBlock(out)).toBe("voice m { 4 c4 }");
  });

  it("accepts an unlabeled fence", () => {
    expect(extractDslBlock("```\n4 c4\n```")).toBe("4 c4");
  });

  it("accepts a 'synthjs' tag", () => {
    expect(extractDslBlock("```synthjs\n4 c4\n```")).toBe("4 c4");
  });

  it("returns null when no fence is present", () => {
    expect(extractDslBlock("just prose")).toBeNull();
  });

  it("recovers a partial block when output truncates without a closing fence", () => {
    const truncated = "Here:\n```synth\nvoice m {\n  4 c4 d4";
    expect(extractDslBlock(truncated)).toBe("voice m {\n  4 c4 d4");
  });
});

describe("extractAllDslBlocks", () => {
  it("returns every fenced block in the order they appear", () => {
    const out = "```synth\nvoice a { 4 c4 }\n```\nthen\n```synth\nvoice b { 4 d4 }\n```";
    expect(extractAllDslBlocks(out)).toEqual(["voice a { 4 c4 }", "voice b { 4 d4 }"]);
  });

  it("appends a trailing open-ended block when the stream truncates", () => {
    const out = "```synth\nvoice a { 4 c4 }\n```\n```synth\nvoice b { 4 d4";
    expect(extractAllDslBlocks(out)).toEqual(["voice a { 4 c4 }", "voice b { 4 d4"]);
  });

  it("returns empty when no fence is present", () => {
    expect(extractAllDslBlocks("plain prose")).toEqual([]);
  });
});

describe("isTruncated", () => {
  it("flags a partial block missing its closing fence", () => {
    expect(isTruncated("```synth\nvoice m { 4 c4")).toBe(true);
  });
  it("does not flag a fully closed block", () => {
    expect(isTruncated("```synth\n4 c4\n```")).toBe(false);
  });
  it("does not flag plain prose with no fences", () => {
    expect(isTruncated("plain text")).toBe(false);
  });
});

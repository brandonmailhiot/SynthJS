import { describe, expect, it } from "vitest";
import { buildPrompt, extractDslBlock } from "./prompt-builder.js";

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
});

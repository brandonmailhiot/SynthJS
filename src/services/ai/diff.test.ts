import { describe, expect, it } from "vitest";
import { diffLines, formatDiff } from "./diff.js";

describe("diffLines", () => {
  it("returns null ranges when input is identical", () => {
    const d = diffLines("a\nb\nc", "a\nb\nc");
    expect(d.oldRange).toBeNull();
    expect(d.newRange).toBeNull();
    expect(d.segments).toEqual([{ type: "equal", lines: ["a", "b", "c"] }]);
  });

  it("detects an inserted line and reports its 1-based new range", () => {
    const d = diffLines("a\nc", "a\nb\nc");
    expect(d.newRange).toEqual([2, 2]);
    expect(d.oldRange).toBeNull();
    expect(d.segments).toContainEqual({ type: "added", lines: ["b"] });
  });

  it("detects a removed line and reports its 1-based old range", () => {
    const d = diffLines("a\nb\nc", "a\nc");
    expect(d.oldRange).toEqual([2, 2]);
    expect(d.newRange).toBeNull();
    expect(d.segments).toContainEqual({ type: "removed", lines: ["b"] });
  });

  it("detects a replaced line and reports both ranges", () => {
    const d = diffLines("a\nb\nc", "a\nB\nc");
    expect(d.oldRange).toEqual([2, 2]);
    expect(d.newRange).toEqual([2, 2]);
  });
});

describe("formatDiff", () => {
  it("renders +/-/space prefixes", () => {
    const out = formatDiff(diffLines("a\nb\nc", "a\nB\nc"));
    expect(out).toContain("- b");
    expect(out).toContain("+ B");
    expect(out).toContain("  a");
  });

  it("collapses long equal runs", () => {
    const oldText = ["a", "b", "c", "d", "e", "f"].join("\n");
    const newText = ["a", "b", "c", "d", "e", "F"].join("\n");
    const out = formatDiff(diffLines(oldText, newText), 1);
    expect(out).toContain("…");
  });
});

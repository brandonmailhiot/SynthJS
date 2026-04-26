import { describe, expect, it } from "vitest";
import { rename } from "./rename.js";

describe("rename", () => {
  it("renames a binding and all its references", () => {
    const src = "intro = 4 c4\nintro\nintro";
    const edits = rename(src, 0, "opening");
    expect(edits).not.toBeNull();
    expect(edits?.length).toBeGreaterThanOrEqual(3); // declaration + 2 refs
    for (const edit of edits ?? []) {
      expect(edit.newText).toBe("opening");
    }
  });

  it("rename from a reference renames declaration too", () => {
    const src = "intro = 4 c4\nintro";
    const refOffset = src.lastIndexOf("intro");
    const edits = rename(src, refOffset, "opening");
    expect(edits).not.toBeNull();
    expect(edits?.length).toBe(2);
  });

  it("renames parameterized motif", () => {
    const src = "arp(root) = 8 root\narp(c4)\narp(g3)";
    const edits = rename(src, 0, "arpeggio");
    expect(edits).not.toBeNull();
    expect(edits?.length).toBeGreaterThanOrEqual(3);
  });

  it("renames InstrumentDef and \\instrument references", () => {
    const src = "instrument define warm { oscillator sawtooth }\n\\instrument warm\n4 c4";
    const offset = src.indexOf("warm");
    const edits = rename(src, offset, "cool");
    expect(edits).not.toBeNull();
    expect(edits?.length).toBeGreaterThanOrEqual(2);
  });

  it("invalid identifier returns null", () => {
    const src = "intro = 4 c4";
    expect(rename(src, 0, "bad name")).toBeNull();
    expect(rename(src, 0, "1abc")).toBeNull();
  });

  it("cursor on non-renamable position returns null", () => {
    const src = "4 c4";
    expect(rename(src, 0, "x")).toBeNull();
  });

  it("malformed source returns null", () => {
    expect(rename("4 ,", 0, "x")).toBeNull();
  });

  it("each edit has a range and newText", () => {
    const src = "intro = 4 c4\nintro";
    const edits = rename(src, 0, "opening");
    for (const edit of edits ?? []) {
      expect(edit.range.start).toBeDefined();
      expect(edit.range.end).toBeDefined();
      expect(typeof edit.newText).toBe("string");
    }
  });
});

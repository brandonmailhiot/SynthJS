import { describe, expect, it } from "vitest";
import { offsetToPosition, positionToOffset, spanToRange } from "./position.js";

describe("offsetToPosition", () => {
  it("offset 0 -> line 1 col 1", () => {
    expect(offsetToPosition("hello", 0)).toEqual({ line: 1, column: 1 });
  });

  it("mid-line offset", () => {
    expect(offsetToPosition("hello world", 6)).toEqual({ line: 1, column: 7 });
  });

  it("offset past newline", () => {
    expect(offsetToPosition("foo\nbar", 4)).toEqual({ line: 2, column: 1 });
  });

  it("offset on second line", () => {
    expect(offsetToPosition("foo\nbar baz", 8)).toEqual({ line: 2, column: 5 });
  });

  it("offset beyond source clamps", () => {
    expect(offsetToPosition("foo", 100)).toEqual({ line: 1, column: 4 });
  });

  it("negative offset clamps to start", () => {
    expect(offsetToPosition("foo", -5)).toEqual({ line: 1, column: 1 });
  });

  it("empty string offset 0 -> line 1 col 1", () => {
    expect(offsetToPosition("", 0)).toEqual({ line: 1, column: 1 });
  });

  it("offset at exact source length", () => {
    expect(offsetToPosition("foo", 3)).toEqual({ line: 1, column: 4 });
  });

  it("multiple newlines", () => {
    expect(offsetToPosition("a\nb\nc", 4)).toEqual({ line: 3, column: 1 });
  });

  it("offset at newline character itself", () => {
    expect(offsetToPosition("foo\nbar", 3)).toEqual({ line: 1, column: 4 });
  });

  it("third line position", () => {
    expect(offsetToPosition("ab\ncd\nef", 6)).toEqual({ line: 3, column: 1 });
  });

  it("consecutive newlines", () => {
    expect(offsetToPosition("a\n\nb", 3)).toEqual({ line: 3, column: 1 });
  });
});

describe("positionToOffset", () => {
  it("line 1 col 1 -> 0", () => {
    expect(positionToOffset("hello", { line: 1, column: 1 })).toBe(0);
  });

  it("mid-line position", () => {
    expect(positionToOffset("hello world", { line: 1, column: 7 })).toBe(6);
  });

  it("position on second line", () => {
    expect(positionToOffset("foo\nbar", { line: 2, column: 1 })).toBe(4);
  });

  it("roundtrip via offsetToPosition", () => {
    const source = "abc\ndef\nghi";
    for (let i = 0; i <= source.length; i++) {
      const pos = offsetToPosition(source, i);
      expect(positionToOffset(source, pos)).toBe(i);
    }
  });

  it("position past end clamps to source.length", () => {
    expect(positionToOffset("foo", { line: 99, column: 99 })).toBe(3);
  });

  it("empty string -> 0", () => {
    expect(positionToOffset("", { line: 1, column: 1 })).toBe(0);
  });

  it("last character of line", () => {
    expect(positionToOffset("foo\nbar", { line: 1, column: 3 })).toBe(2);
  });
});

describe("spanToRange", () => {
  it("uses span.line/column for start, computes end via offsetToPosition", () => {
    const source = "hello world";
    const range = spanToRange(source, { start: 0, end: 5, line: 1, column: 1 });
    expect(range.start).toEqual({ line: 1, column: 1 });
    expect(range.end).toEqual({ line: 1, column: 6 });
  });

  it("multi-line span", () => {
    const source = "abc\ndef";
    const range = spanToRange(source, { start: 0, end: 7, line: 1, column: 1 });
    expect(range.end).toEqual({ line: 2, column: 4 });
  });

  it("span starting mid-line", () => {
    const source = "hello world";
    const range = spanToRange(source, { start: 6, end: 11, line: 1, column: 7 });
    expect(range.start).toEqual({ line: 1, column: 7 });
    expect(range.end).toEqual({ line: 1, column: 12 });
  });

  it("span start matches span.line and span.column directly", () => {
    const source = "foo\nbar\nbaz";
    const range = spanToRange(source, { start: 4, end: 7, line: 2, column: 1 });
    expect(range.start).toEqual({ line: 2, column: 1 });
  });
});

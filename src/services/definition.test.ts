import { describe, expect, it } from "vitest";
import { getDefinition } from "./definition.js";

describe("getDefinition", () => {
  it("MotifRef points to its binding", () => {
    const src = "intro = 4 c4\nintro";
    const offset = src.lastIndexOf("intro");
    const range = getDefinition(src, offset);
    expect(range).not.toBeNull();
    // binding's span starts at offset 0, line 1
    expect(range?.start.line).toBe(1);
    expect(range?.start.column).toBe(1);
  });

  it("Call points to parameterized binding", () => {
    const src = "arp(root) = 8 root\narp(c4)";
    const offset = src.lastIndexOf("arp");
    const range = getDefinition(src, offset);
    expect(range).not.toBeNull();
    expect(range?.start.line).toBe(1);
  });

  it("\\instrument primitive returns null", () => {
    const src = "\\instrument sawtooth\n4 c4";
    const offset = src.indexOf("sawtooth");
    expect(getDefinition(src, offset)).toBeNull();
  });

  it("\\instrument <custom> points to InstrumentDef", () => {
    const src = "instrument define warm { oscillator sawtooth }\n\\instrument warm\n4 c4";
    const offset = src.lastIndexOf("warm");
    const range = getDefinition(src, offset);
    expect(range).not.toBeNull();
    expect(range?.start.line).toBe(1);
  });

  it("cursor on whitespace returns null", () => {
    const src = "intro = 4 c4";
    expect(getDefinition(src, 6)).toBeNull(); // space before '='
  });

  it("malformed source returns null", () => {
    expect(getDefinition("4 ,", 0)).toBeNull();
  });

  it("unresolved ref returns null", () => {
    const src = "unknown_name";
    expect(getDefinition(src, 0)).toBeNull();
  });

  it("returns a Range with start and end positions", () => {
    const src = "intro = 4 c4\nintro";
    const offset = src.lastIndexOf("intro");
    const range = getDefinition(src, offset);
    expect(range).not.toBeNull();
    expect(range?.start).toBeDefined();
    expect(range?.end).toBeDefined();
    expect(typeof range?.start.line).toBe("number");
    expect(typeof range?.start.column).toBe("number");
  });
});

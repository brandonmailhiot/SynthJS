import { describe, expect, it } from "vitest";
import { getCompletions } from "./completion.js";

describe("getCompletions", () => {
  it("after \\\\ suggests directives + dynamics", () => {
    const src = "\\";
    const items = getCompletions(src, src.length);
    const labels = items.map((i) => i.label);
    expect(labels).toContain("\\tempo");
    expect(labels).toContain("\\mp");
  });

  it("after @ suggests annotation names", () => {
    const src = "4 c4@";
    const items = getCompletions(src, src.length);
    const labels = items.map((i) => i.label);
    expect(labels).toContain("@cue");
    expect(labels).toContain("@chance");
  });

  it("after 'with ' suggests effect names", () => {
    const src = "with ";
    const items = getCompletions(src, src.length);
    const labels = items.map((i) => i.label);
    expect(labels).toContain("reverb");
    expect(labels).toContain("delay");
  });

  it("after '\\instrument ' suggests primitives", () => {
    const src = "\\instrument ";
    const items = getCompletions(src, src.length);
    const labels = items.map((i) => i.label);
    expect(labels).toContain("sawtooth");
    expect(labels).toContain("sine");
  });

  it("after '\\instrument ' with custom instrument in scope suggests it", () => {
    const src = "instrument define warm { oscillator sawtooth }\n\\instrument ";
    const items = getCompletions(src, src.length);
    const labels = items.map((i) => i.label);
    expect(labels).toContain("warm");
  });

  it("after '\\key ' suggests pitches", () => {
    const src = "\\key ";
    const items = getCompletions(src, src.length);
    const labels = items.map((i) => i.label);
    expect(labels).toContain("c4");
  });

  it("after '\\key c4 ' suggests modes", () => {
    const src = "\\key c4 ";
    const items = getCompletions(src, src.length);
    const labels = items.map((i) => i.label);
    expect(labels).toContain("major");
    expect(labels).toContain("dorian");
  });

  it("default context suggests durations + pitches + bindings", () => {
    const src = "intro = 4 c4\n";
    const items = getCompletions(src, src.length);
    const labels = items.map((i) => i.label);
    expect(labels).toContain("4");
    expect(labels).toContain("c4");
    expect(labels).toContain("intro");
  });

  it("each item has a label and kind", () => {
    const items = getCompletions("4 ", 2);
    for (const item of items) {
      expect(item.label).toBeTruthy();
      expect(item.kind).toBeTruthy();
    }
  });

  it("items have details where applicable", () => {
    const items = getCompletions("with ", 5);
    const reverb = items.find((i) => i.label === "reverb");
    expect(reverb?.detail).toContain("channels");
  });

  it("annotation completions have kind 'annotation'", () => {
    const src = "4 c4@";
    const items = getCompletions(src, src.length);
    for (const item of items) {
      expect(item.kind).toBe("annotation");
    }
  });

  it("directive completions include \\version and \\use", () => {
    const src = "\\";
    const items = getCompletions(src, src.length);
    const labels = items.map((i) => i.label);
    expect(labels).toContain("\\version");
    expect(labels).toContain("\\use");
  });

  it("default context includes keywords like 'voice' and 'with'", () => {
    const src = "";
    const items = getCompletions(src, 0);
    const labels = items.map((i) => i.label);
    expect(labels).toContain("voice");
    expect(labels).toContain("with");
  });

  it("binding doc is surfaced as documentation", () => {
    const src = "/// the arp pattern\narp(root) = 4 root\n";
    const items = getCompletions(src, src.length);
    const arp = items.find((i) => i.label === "arp");
    expect(arp).toBeDefined();
    expect(arp?.documentation).toContain("arp pattern");
  });
});

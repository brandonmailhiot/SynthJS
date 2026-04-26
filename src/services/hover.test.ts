import { describe, expect, it } from "vitest";
import { getHover } from "./hover.js";

describe("getHover — pitches", () => {
  it("absolute pitch shows frequency", () => {
    const src = "4 c4";
    // c4 starts at offset 2
    const info = getHover(src, 2);
    expect(info).not.toBeNull();
    expect(info?.contents.join("\n")).toContain("c4");
    expect(info?.contents.join("\n")).toMatch(/\d+\.\d+ Hz/);
  });

  it("pitch with cents shows detune", () => {
    const src = "4 a4+15c";
    const info = getHover(src, 2);
    expect(info?.contents.join("\n")).toContain("Detune");
    expect(info?.contents.join("\n")).toContain("15");
  });

  it("pitch without cents has no detune line", () => {
    const src = "4 c4";
    const info = getHover(src, 2);
    expect(info?.contents.join("\n")).not.toContain("Detune");
  });

  it("hover returns a range with start/end", () => {
    const src = "4 c4";
    const info = getHover(src, 2);
    expect(info?.range.start).toBeDefined();
    expect(info?.range.end).toBeDefined();
  });
});

describe("getHover — motif refs", () => {
  it("resolves to binding", () => {
    const src = "/// my intro\nintro = 4 c4\nintro";
    // The trailing 'intro' is at offset around src.indexOf("intro", 25)
    const offset = src.lastIndexOf("intro");
    const info = getHover(src, offset);
    expect(info).not.toBeNull();
    expect(info?.contents.join("\n")).toContain("intro");
    expect(info?.contents.join("\n")).toContain("my intro");
  });

  it("unresolved motif ref still produces hover", () => {
    const src = "unknown";
    const info = getHover(src, 0);
    expect(info).not.toBeNull();
    expect(info?.contents.join("\n")).toContain("unresolved");
  });
});

describe("getHover — calls", () => {
  it("call to known motif", () => {
    const src = "/// arp doc\narp(root) = 8 root\narp(c4)";
    const offset = src.lastIndexOf("arp");
    const info = getHover(src, offset);
    expect(info?.contents.join("\n")).toContain("arp(root)");
  });

  it("effect call shows signature", () => {
    const src = "with reverb(2, 1, 0.7) { 4 c4 }";
    const offset = src.indexOf("reverb");
    const info = getHover(src, offset);
    expect(info?.contents.join("\n")).toContain("reverb");
    expect(info?.contents.join("\n")).toContain("channels");
  });

  it("unresolved call produces hover", () => {
    const src = "/// fn\nfoo(x) = 4 x\nfoo(c4)";
    const offset = src.lastIndexOf("foo");
    const info = getHover(src, offset);
    expect(info).not.toBeNull();
  });
});

describe("getHover — annotations", () => {
  it("known annotation shows signature", () => {
    const src = '4 c4@cue("hit")';
    const offset = src.indexOf("@cue");
    const info = getHover(src, offset);
    expect(info?.contents.join("\n")).toContain("@cue");
  });

  it("chance annotation shows signature", () => {
    const src = "4 c4@chance(0.5)";
    const offset = src.indexOf("@chance");
    const info = getHover(src, offset);
    expect(info?.contents.join("\n")).toContain("@chance");
    expect(info?.contents.join("\n")).toContain("p");
  });
});

describe("getHover — bindings", () => {
  it("binding declaration shows signature + doc", () => {
    const src = "/// docs\nintro = 4 c4";
    const offset = src.indexOf("intro");
    const info = getHover(src, offset);
    expect(info?.contents.join("\n")).toContain("intro");
  });

  it("binding with params shows full signature", () => {
    const src = "arp(root) = 4 root";
    const offset = src.indexOf("arp");
    const info = getHover(src, offset);
    expect(info?.contents.join("\n")).toContain("arp(root)");
  });
});

describe("getHover — instruments", () => {
  it("instrument def shows name", () => {
    const src = "instrument define warm { oscillator sawtooth }";
    const offset = src.indexOf("warm");
    const info = getHover(src, offset);
    expect(info).not.toBeNull();
    expect(info?.contents.join("\n")).toContain("warm");
  });
});

describe("getHover — non-hoverable position", () => {
  it("cursor on whitespace returns null or composition-level info", () => {
    const src = "4 c4";
    const info = getHover(src, 1); // space
    // Either null or composition-level — both acceptable
    if (info) {
      expect(info.contents).toBeDefined();
    }
  });

  it("malformed source returns null", () => {
    const src = "4 ,";
    expect(getHover(src, 0)).toBeNull();
  });
});

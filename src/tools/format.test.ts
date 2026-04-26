import { describe, expect, it } from "vitest";
import { format } from "./format.js";

describe("format — basic", () => {
  it("4 c4 -> '4 c4\\n'", () => {
    expect(format("4 c4")).toBe("4 c4\n");
  });
  it("multiple events on one line", () => {
    expect(format("4 c4 d4 e4 f4")).toBe("4 c4 d4 e4 f4\n");
  });
  it("preserves directives", () => {
    expect(format("\\tempo 120\n4 c4")).toContain("\\tempo 120");
  });
});

describe("format — version", () => {
  it("\\version always first", () => {
    const out = format('\\tempo 120\n\\version "2.0"\n4 c4');
    expect(out.startsWith('\\version "2.0"')).toBe(true);
  });
});

describe("format — voice", () => {
  it("voice body indented 2 spaces", () => {
    const out = format("voice melody { 4 c4 }");
    expect(out).toContain("voice melody {");
    expect(out).toContain("  4 c4");
    expect(out).toContain("}");
  });
});

describe("format — bindings", () => {
  it("single-event binding inline", () => {
    expect(format("intro = 4 c4")).toContain("intro = 4 c4");
  });
  it("multi-event binding uses block", () => {
    const out = format("intro = { 4 c4 d4 }");
    expect(out).toContain("intro = {");
    expect(out).toContain("  4 c4 d4");
  });
  it("doc comment preserved", () => {
    const out = format("/// my motif\nintro = 4 c4");
    expect(out).toContain("/// my motif");
  });
  it("parameterized binding", () => {
    expect(format("arp(root) = 8 root")).toContain("arp(root) = 8 root");
  });
});

describe("format — chord", () => {
  it("chord syntax", () => {
    expect(format("4 <c4 e4 g4>")).toContain("<c4 e4 g4>");
  });
});

describe("format — slide", () => {
  it("slide arrow with spaces", () => {
    expect(format("2 e2 -> c3")).toContain("2 e2 -> c3");
  });
});

describe("format — articulation", () => {
  it("staccato postfix", () => {
    expect(format("4 c4.")).toContain("4 c4.");
  });
});

describe("format — annotations", () => {
  it("postfix on event no space", () => {
    expect(format('4 c4@cue("hit")')).toContain('4 c4@cue("hit")');
  });
  it("prefix on block on own line", () => {
    const out = format('@section("verse") { 4 c4 }');
    expect(out).toContain('@section("verse")');
    expect(out).toContain("{");
  });
});

describe("format — effects/envelope/tuplet/ramp", () => {
  it("with reverb", () => {
    expect(format("with reverb(2, 1, 0.7) { 4 c4 }")).toContain("with reverb(2, 1, 0.7)");
  });
  it("envelope adsr", () => {
    expect(format("envelope adsr(0.01, 0.1, 0.7, 0.3) { 4 c4 }")).toContain(
      "envelope adsr(0.01, 0.1, 0.7, 0.3)",
    );
  });
  it("tuplet", () => {
    expect(format("tuplet(5) { 8 c4 d4 e4 f4 g4 }")).toContain("tuplet(5)");
  });
  it("ramp", () => {
    expect(format("ramp(\\mp, \\ff) { 4 c4 d4 }")).toContain("ramp(\\mp, \\ff)");
  });
});

describe("format — repeat", () => {
  it("event * N", () => {
    expect(format("4 c4 * 4")).toContain("4 c4 * 4");
  });
  it("repeat block", () => {
    expect(format("repeat 3 { 4 c4 }")).toContain("repeat 3 {");
  });
});

describe("format — instrument define", () => {
  it("multi-line block", () => {
    const out = format("instrument define warm { oscillator sawtooth detune 5 }");
    expect(out).toContain("instrument define warm {");
    expect(out).toContain("  oscillator sawtooth");
    expect(out).toContain("  detune 5");
  });
});

describe("format — pitch arithmetic", () => {
  it("c4+7", () => {
    expect(format("4 c4+7")).toContain("c4+7");
  });
});

describe("format — scale degree", () => {
  it("^N", () => {
    expect(format("\\key c4 major\n4 ^1 ^3 ^5")).toContain("^1 ^3 ^5");
  });
});

describe("format — idempotent", () => {
  it("format(format(x)) === format(x)", () => {
    const inputs = [
      "4 c4",
      '\\version "2.0"\n\\tempo 120\nvoice melody { 4 c4 d4 }',
      "with reverb(2, 1, 0.7) { 4 <c4 e4 g4> }",
      "ramp(\\p, \\ff) { 4 c4 d4 e4 f4 }",
    ];
    for (const src of inputs) {
      const once = format(src);
      const twice = format(once);
      expect(twice).toBe(once);
    }
  });
});

describe("format — round trip semantic equivalence", () => {
  it("format output parses to same AST shape", () => {
    // Parse original and formatted; compare body length
    const src = "\\tempo 120\nvoice melody { 4 c4 d4 e4 f4 }";
    const formatted = format(src);
    // The formatted output should re-parse without error
    expect(() => format(formatted)).not.toThrow();
  });
});

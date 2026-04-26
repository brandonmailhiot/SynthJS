import { describe, expect, it } from "vitest";
import { LexError, ParseError, ResolveError, ValidationError } from "./errors.js";
import { type CompositionIR, compile, compileSync } from "./index.js";

describe("compileSync — happy path", () => {
  it("returns a CompositionIR", () => {
    const ir: CompositionIR = compileSync('\\version "2.0"\n4 c4');
    expect(ir.voices).toHaveLength(1);
    expect(ir.voices[0]?.events).toHaveLength(1);
  });

  it("scale-degree resolution", () => {
    const ir = compileSync("\\key c4 major\n4 ^1 ^2 ^3 ^4 ^5 ^6 ^7 ^8");
    const events = ir.voices[0]?.events;
    expect(events?.[0]?.frequencies[0]).toBeCloseTo(261.626, 1); // c4
    expect(events?.[1]?.frequencies[0]).toBeCloseTo(293.665, 1); // d4
    expect(events?.[2]?.frequencies[0]).toBeCloseTo(329.628, 1); // e4
    expect(events?.[4]?.frequencies[0]).toBeCloseTo(391.995, 1); // g4
  });

  it("with reverb produces fxChain on event", () => {
    const ir = compileSync("with reverb(2, 1, 0.7) { 4 c4 }");
    const ev = ir.voices[0]?.events[0];
    expect(ev?.fxChain).toHaveLength(1);
    expect(ev?.fxChain[0]?.name).toBe("reverb");
  });

  it("repeat expands events", () => {
    const ir = compileSync("repeat 3 { 4 c4 }");
    expect(ir.voices[0]?.events).toHaveLength(3);
  });

  it("two-note chord event", () => {
    const ir = compileSync("4 <c4 e4>");
    const ev = ir.voices[0]?.events[0];
    expect(ev?.frequencies).toHaveLength(2);
  });

  it("sticky octave resolution", () => {
    const ir = compileSync("4 c4 d e f");
    const events = ir.voices[0]?.events;
    // d, e, f inherit octave 4 from c4
    expect(events?.[1]?.frequencies[0]).toBeCloseTo(293.665, 1); // d4
    expect(events?.[2]?.frequencies[0]).toBeCloseTo(329.628, 1); // e4
    expect(events?.[3]?.frequencies[0]).toBeCloseTo(349.228, 1); // f4
  });

  it("tempo is captured in IR", () => {
    const ir = compileSync("\\tempo 140\n4 c4");
    expect(ir.tempo).toBe(140);
  });

  it("time signature is captured in IR", () => {
    const ir = compileSync("\\time 3/4\n4 c4");
    expect(ir.timeSig).toEqual({ numerator: 3, denominator: 4 });
  });
});

describe("compileSync — errors", () => {
  it("LexError on bad char", () => {
    expect(() => compileSync("4 c4 ! 4 d4")).toThrow(LexError);
  });
  it("ParseError on bad syntax", () => {
    expect(() => compileSync("4 ,")).toThrow(ParseError);
  });
  it("ResolveError on unknown effect with did-you-mean", () => {
    expect(() => compileSync("with reveerb(2, 1, 0.7) { 4 c4 }")).toThrow(/did you mean 'reverb'/);
  });
  it("ValidationError on missing initial duration", () => {
    expect(() => compileSync("c4")).toThrow(ValidationError);
  });
  it("ValidationError on scale-degree without \\key", () => {
    expect(() => compileSync("4 ^1")).toThrow(ValidationError);
  });
});

describe("compile (async) — modules", () => {
  it("plain import resolves binding in voice", async () => {
    const fileResolver = async (p: string) => {
      if (p === "/main.synth") return '\\use "./shared.synth"\nvoice melody { intro }';
      if (p === "/shared.synth") return "intro = 4 c4";
      throw new Error(`unknown ${p}`);
    };
    const ir = await compile('\\use "./shared.synth"\nvoice melody { intro }', {
      fileResolver,
      entryPath: "/main.synth",
    });
    // The IR should compile without error; voices are present
    expect(ir.voices).toHaveLength(1);
    expect(ir.voices[0]?.name).toBe("melody");
  });

  it("no fileResolver falls back to compileSync", async () => {
    const ir = await compile('\\version "2.0"\n4 c4 e4');
    expect(ir.voices[0]?.events).toHaveLength(2);
  });
});

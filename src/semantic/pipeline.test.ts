import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compileSync } from "../index.js";

const fixturesDir = join(import.meta.dirname, "../../test/fixtures");

describe("e2e fixtures", () => {
  it("scale.synth compiles", () => {
    const src = readFileSync(join(fixturesDir, "scale.synth"), "utf8");
    const ir = compileSync(src);
    expect(ir.voices[0]?.name).toBe("melody");
    expect(ir.voices[0]?.events.length).toBeGreaterThan(0);
  });

  it("two-voice.synth compiles with two voices", () => {
    const src = readFileSync(join(fixturesDir, "two-voice.synth"), "utf8");
    const ir = compileSync(src);
    expect(ir.voices.map((v) => v.name).sort()).toEqual(["bass", "melody"]);
  });

  it("annotations.synth compiles", () => {
    const src = readFileSync(join(fixturesDir, "annotations.synth"), "utf8");
    const ir = compileSync(src);
    expect(ir).toBeDefined();
    // Verify @cue annotation passed through
    const allAnnotations = ir.voices.flatMap((v) => v.events.flatMap((e) => e.annotations));
    expect(allAnnotations.some((a) => a.name === "@cue")).toBe(true);
  });

  it("full-feature.synth compiles", () => {
    const src = readFileSync(join(fixturesDir, "full-feature.synth"), "utf8");
    const ir = compileSync(src);
    expect(ir).toBeDefined();
    expect(ir.voices.length).toBeGreaterThan(0);
  });

  it("key-and-degrees.synth resolves scale degrees", () => {
    const src = readFileSync(join(fixturesDir, "key-and-degrees.synth"), "utf8");
    const ir = compileSync(src);
    const events = ir.voices[0]?.events;
    expect(events).toHaveLength(8);
    // ^1 = c4 ≈ 261.6 Hz
    expect(events?.[0]?.frequencies[0]).toBeCloseTo(261.626, 1);
    // ^8 = c5 ≈ 523.25 Hz
    expect(events?.[7]?.frequencies[0]).toBeCloseTo(523.251, 1);
  });

  it("parameterized.synth inlines arp", () => {
    const src = readFileSync(join(fixturesDir, "parameterized.synth"), "utf8");
    const ir = compileSync(src);
    expect(ir).toBeDefined();
  });

  it("sticky-octave.synth resolves inherited letters", () => {
    const src = readFileSync(join(fixturesDir, "sticky-octave.synth"), "utf8");
    const ir = compileSync(src);
    const events = ir.voices[0]?.events;
    expect(events?.length).toBeGreaterThan(0);
    // First event is c4
    expect(events?.[0]?.frequencies[0]).toBeCloseTo(261.626, 1);
  });

  it("bar-mismatch.synth emits warning", () => {
    const src = readFileSync(join(fixturesDir, "bar-mismatch.synth"), "utf8");
    const ir = compileSync(src);
    expect(ir.diagnostics.length).toBeGreaterThan(0);
    expect(ir.diagnostics[0]?.severity).toBe("warning");
  });
});

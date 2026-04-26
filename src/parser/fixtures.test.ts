import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "../index.js";

const fixturesDir = join(import.meta.dirname, "../../test/fixtures");
const fixtures = ["scale", "two-voice", "annotations", "full-feature"];

describe.each(fixtures)("fixture: %s", (name) => {
  it("parses without error", () => {
    const src = readFileSync(join(fixturesDir, `${name}.synth`), "utf8");
    const ast = parse(src);
    expect(ast.kind).toBe("Composition");
    expect(ast.version).toBe("2.0");
  });
});

describe("two-voice fixture", () => {
  it("has bass and melody voices", () => {
    const src = readFileSync(join(fixturesDir, "two-voice.synth"), "utf8");
    const ast = parse(src);
    const voices = ast.body.filter((n) => n.kind === "VoiceDecl");
    expect(voices.map((v) => v.name)).toEqual(["bass", "melody"]);
  });
});

describe("full-feature fixture", () => {
  it("contains a parameterized binding with doc comment", () => {
    const src = readFileSync(join(fixturesDir, "full-feature.synth"), "utf8");
    const ast = parse(src);
    const binding = ast.body.find((n) => n.kind === "Binding" && n.name === "arp");
    expect(binding).toBeDefined();
    if (binding?.kind !== "Binding") throw new Error();
    expect(binding.doc?.toLowerCase()).toContain("arpeggio");
    expect(binding.params).toEqual(["root"]);
  });
  it("contains an instrument definition", () => {
    const src = readFileSync(join(fixturesDir, "full-feature.synth"), "utf8");
    const ast = parse(src);
    const inst = ast.body.find((n) => n.kind === "InstrumentDef");
    expect(inst).toBeDefined();
  });
});

import { describe, expect, it } from "vitest";
import { generateDocs } from "./gen-docs.js";

describe("generateDocs — binding with doc", () => {
  it("emits markdown heading and doc body for a binding with doc comment", () => {
    const source = "/// A simple intro phrase.\nintro = 4 c4 d e f";
    const result = generateDocs(source);
    expect(result).toContain("## `intro`");
    expect(result).toContain("A simple intro phrase.");
  });
});

describe("generateDocs — parameterized binding", () => {
  it("shows parameters in the heading: ## `arp(root)`", () => {
    const source = "/// An arpeggio motif.\narp(root) = 8 <root root root>";
    const result = generateDocs(source);
    expect(result).toContain("## `arp(root)`");
  });
});

describe("generateDocs — instrument definition", () => {
  it("lists instrument as '## instrument `warm_pad`'", () => {
    const source = "/// A warm pad sound.\ninstrument define warm_pad { oscillator sawtooth }";
    const result = generateDocs(source);
    expect(result).toContain("## instrument `warm_pad`");
    expect(result).toContain("A warm pad sound.");
  });
});

describe("generateDocs — voice declaration", () => {
  it("lists voice as '## voice `melody`'", () => {
    const source = "/// The main melody.\nvoice melody { 4 c4 d e f }";
    const result = generateDocs(source);
    expect(result).toContain("## voice `melody`");
    expect(result).toContain("The main melody.");
  });
});

describe("generateDocs — declaration order", () => {
  it("multiple bindings appear in declaration order", () => {
    const source = [
      "/// First motif.",
      "alpha = 4 c4",
      "/// Second motif.",
      "beta = 4 d4",
      "/// Third motif.",
      "gamma = 4 e4",
    ].join("\n");
    const result = generateDocs(source);
    const alphaPos = result.indexOf("## `alpha`");
    const betaPos = result.indexOf("## `beta`");
    const gammaPos = result.indexOf("## `gamma`");
    expect(alphaPos).toBeLessThan(betaPos);
    expect(betaPos).toBeLessThan(gammaPos);
  });
});

describe("generateDocs — title option", () => {
  it("output starts with the given title as an H1 heading", () => {
    const source = "intro = 4 c4";
    const result = generateDocs(source, { title: "My Composition" });
    expect(result.startsWith("# My Composition")).toBe(true);
    expect(result).toContain("## `intro`");
  });
});

describe("generateDocs — empty source", () => {
  it("returns empty string when there are no documented nodes", () => {
    const result = generateDocs("");
    expect(result).toBe("");
  });

  it("returns only the title when title given but no documented nodes", () => {
    const result = generateDocs("", { title: "Empty" });
    expect(result.trim()).toBe("# Empty");
  });
});

import { describe, expect, it } from "vitest";
import { didYouMean, levenshtein } from "./did-you-mean.js";

describe("levenshtein", () => {
  it("identical strings = 0", () => {
    expect(levenshtein("reverb", "reverb")).toBe(0);
  });
  it("one substitution = 1", () => {
    expect(levenshtein("reverb", "reverv")).toBe(1);
  });
  it("one insertion = 1", () => {
    expect(levenshtein("reverb", "rverb")).toBe(1);
  });
  it("transposition = 2", () => {
    expect(levenshtein("reverb", "rveerb")).toBe(2);
  });
  it("empty vs non-empty = length", () => {
    expect(levenshtein("", "abc")).toBe(3);
  });
});

describe("didYouMean", () => {
  it("returns nearest within threshold", () => {
    expect(didYouMean("rvb", ["reverb", "delay", "filter"])).toBe("reverb");
  });
  it("returns null when nothing within threshold", () => {
    expect(didYouMean("xyz", ["reverb", "delay", "filter"])).toBeNull();
  });
  it("threshold scales with target length (long words tolerate more typos)", () => {
    expect(didYouMean("instrumant", ["instrument"])).toBe("instrument");
  });
  it("returns null when input is empty", () => {
    expect(didYouMean("", ["reverb"])).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { lex } from "../lexer/lexer.js";
import { parse } from "../parser/parser.js";
import { lowerSticky } from "./lower-sticky.js";
import { validateMeter } from "./validate-meter.js";

const validate = (src: string) => {
  const ast = lowerSticky(parse(lex(src))).ast;
  return validateMeter(ast);
};

describe("validate-meter", () => {
  it("\\time 4/4 with full bar -> no warning", () => {
    expect(validate("\\time 4/4\n4 c4 d4 e4 f4 |")).toHaveLength(0);
  });
  it("\\time 4/4 with short bar -> warning", () => {
    const w = validate("\\time 4/4\n4 c4 d4 e4 |");
    expect(w).toHaveLength(1);
    expect(w[0]?.severity).toBe("warning");
  });
  it("\\time 4/4 with overlong bar -> warning", () => {
    const w = validate("\\time 4/4\n4 c4 d4 e4 f4 g4 |");
    expect(w).toHaveLength(1);
  });
  it("\\time 3/4 with three quarters -> no warning", () => {
    expect(validate("\\time 3/4\n4 c4 d4 e4 |")).toHaveLength(0);
  });
  it("\\time 6/8 honors denominator", () => {
    // 6 eighths = one bar
    expect(validate("\\time 6/8\n8 c4 d4 e4 f4 g4 a4 |")).toHaveLength(0);
  });
  it("no \\time directive -> no warnings", () => {
    expect(validate("4 c4 |")).toHaveLength(0);
  });
  it("multiple bars accumulate independently", () => {
    expect(validate("\\time 4/4\n4 c4 d4 e4 f4 | 4 c4 d4 e4 f4 |")).toHaveLength(0);
  });
  it("double bar resets too", () => {
    expect(validate("\\time 4/4\n4 c4 d4 e4 f4 ||")).toHaveLength(0);
  });
});

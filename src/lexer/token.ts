import type { SourceSpan } from "../errors.js";

export type TokenKind =
  | "BackslashCommand"
  | "Dynamic"
  | "AnnotationName"
  | "DocComment"
  | "Pitch"
  | "IntLiteral"
  | "FloatLiteral"
  | "Identifier"
  | "String"
  | "Comma"
  | "Semicolon"
  | "Colon"
  | "Equals"
  | "LBrace"
  | "RBrace"
  | "LParen"
  | "RParen"
  | "LAngle"
  | "RAngle"
  | "Pipe"
  | "DoublePipe"
  | "Plus"
  | "Minus"
  | "Star"
  | "Arrow"
  | "Tilde"
  | "Dot"
  | "Underscore"
  | "Caret"
  | "Hash"
  | "Slash"
  | "Eof";

export type Token = {
  kind: TokenKind;
  value: string;
  span: SourceSpan;
};

const LABELS: Record<TokenKind, string> = {
  BackslashCommand: "command",
  Dynamic: "dynamic",
  AnnotationName: "annotation",
  DocComment: "doc comment",
  Pitch: "pitch",
  IntLiteral: "integer",
  FloatLiteral: "number",
  Identifier: "identifier",
  String: "string",
  Comma: "','",
  Semicolon: "';'",
  Colon: "':'",
  Equals: "'='",
  LBrace: "'{'",
  RBrace: "'}'",
  LParen: "'('",
  RParen: "')'",
  LAngle: "'<'",
  RAngle: "'>'",
  Pipe: "'|'",
  DoublePipe: "'||'",
  Plus: "'+'",
  Minus: "'-'",
  Star: "'*'",
  Arrow: "'->'",
  Tilde: "'~'",
  Dot: "'.'",
  Underscore: "'_'",
  Caret: "'^'",
  Hash: "'#'",
  Slash: "'/'",
  Eof: "end of input",
};

export function tokenKindLabel(k: TokenKind): string {
  return LABELS[k];
}

export const DYNAMIC_NAMES = new Set(["\\pp", "\\p", "\\mp", "\\mf", "\\f", "\\ff", "\\fff"]);
export const COMMAND_NAMES = new Set([
  "\\version",
  "\\tempo",
  "\\time",
  "\\key",
  "\\instrument",
  "\\detune",
  "\\use",
]);

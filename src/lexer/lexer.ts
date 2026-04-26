import { LexError, type SourceSpan } from "../errors.js";
import { DYNAMIC_NAMES, type Token, type TokenKind } from "./token.js";

const PITCH_RE = /^[a-g](?:##|bb|#|b|n)?\d(?:[+-]\d+c)?/;

export function lex(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;
  let col = 1;

  const span = (start: number, end: number, sLine: number, sCol: number): SourceSpan => ({
    start,
    end,
    line: sLine,
    column: sCol,
  });

  const advance = (n = 1): void => {
    for (let k = 0; k < n; k++) {
      if (source[i] === "\n") {
        line += 1;
        col = 1;
      } else {
        col += 1;
      }
      i += 1;
    }
  };

  const peek = (offset = 0): string | undefined => source[i + offset];

  const isWs = (c: string | undefined) => c === " " || c === "\t" || c === "\n" || c === "\r";
  const isDigit = (c: string | undefined) => c !== undefined && c >= "0" && c <= "9";
  const isLower = (c: string | undefined) => c !== undefined && c >= "a" && c <= "z";
  const isUpper = (c: string | undefined) => c !== undefined && c >= "A" && c <= "Z";
  const isIdentStart = (c: string | undefined) =>
    c !== undefined && (isLower(c) || isUpper(c) || c === "_");
  const isIdentCont = (c: string | undefined) =>
    c !== undefined && (isLower(c) || isUpper(c) || isDigit(c) || c === "_");

  const single = (kind: TokenKind, value: string): void => {
    const start = i;
    const sLine = line;
    const sCol = col;
    advance();
    tokens.push({ kind, value, span: span(start, start + 1, sLine, sCol) });
  };

  while (i < source.length) {
    const c = peek();

    if (isWs(c)) {
      advance();
      continue;
    }

    // /// doc comment
    if (c === "/" && peek(1) === "/" && peek(2) === "/") {
      const start = i;
      const sLine = line;
      const sCol = col;
      advance(3);
      const textStart = i;
      while (i < source.length && peek() !== "\n") {
        advance();
      }
      const value = source.slice(textStart, i);
      tokens.push({ kind: "DocComment", value, span: span(start, i, sLine, sCol) });
      continue;
    }

    // // line comment
    if (c === "/" && peek(1) === "/") {
      while (i < source.length && peek() !== "\n") {
        advance();
      }
      continue;
    }

    // /* block comment */
    if (c === "/" && peek(1) === "*") {
      const start = i;
      const sLine = line;
      const sCol = col;
      advance(2);
      while (i < source.length && !(peek() === "*" && peek(1) === "/")) {
        advance();
      }
      if (i >= source.length) {
        throw new LexError("unterminated block comment", span(start, i, sLine, sCol));
      }
      advance(2);
      continue;
    }

    // standalone /
    if (c === "/") {
      single("Slash", "/");
      continue;
    }

    // \ commands and dynamics
    if (c === "\\") {
      const start = i;
      const sLine = line;
      const sCol = col;
      advance();
      const nameStart = i;
      while (isLower(peek())) {
        advance();
      }
      const name = `\\${source.slice(nameStart, i)}`;
      if (name.length === 1) {
        throw new LexError("expected command after '\\\\'", span(start, i, sLine, sCol));
      }
      const kind: TokenKind = DYNAMIC_NAMES.has(name) ? "Dynamic" : "BackslashCommand";
      tokens.push({ kind, value: name, span: span(start, i, sLine, sCol) });
      continue;
    }

    // @ annotations
    if (c === "@") {
      const start = i;
      const sLine = line;
      const sCol = col;
      advance();
      const nameStart = i;
      if (!isIdentStart(peek())) {
        throw new LexError("expected annotation name after '@'", span(start, i, sLine, sCol));
      }
      while (isIdentCont(peek())) {
        advance();
      }
      const name = `@${source.slice(nameStart, i)}`;
      tokens.push({ kind: "AnnotationName", value: name, span: span(start, i, sLine, sCol) });
      continue;
    }

    // strings
    if (c === '"') {
      const start = i;
      const sLine = line;
      const sCol = col;
      advance();
      let value = "";
      while (i < source.length && peek() !== '"') {
        if (peek() === "\\") {
          advance();
          const esc = peek();
          if (esc === "n") {
            value += "\n";
          } else if (esc === "t") {
            value += "\t";
          } else if (esc === "\\") {
            value += "\\";
          } else if (esc === '"') {
            value += '"';
          } else {
            value += esc ?? "";
          }
          advance();
        } else {
          value += peek() ?? "";
          advance();
        }
      }
      if (peek() !== '"') {
        throw new LexError("unterminated string", span(start, i, sLine, sCol));
      }
      advance();
      tokens.push({ kind: "String", value, span: span(start, i, sLine, sCol) });
      continue;
    }

    // structural punctuation
    if (c === ",") {
      single("Comma", ",");
      continue;
    }
    if (c === ";") {
      single("Semicolon", ";");
      continue;
    }
    if (c === ":") {
      single("Colon", ":");
      continue;
    }
    if (c === "=") {
      single("Equals", "=");
      continue;
    }
    if (c === "{") {
      single("LBrace", "{");
      continue;
    }
    if (c === "}") {
      single("RBrace", "}");
      continue;
    }
    if (c === "(") {
      single("LParen", "(");
      continue;
    }
    if (c === ")") {
      single("RParen", ")");
      continue;
    }
    if (c === "<") {
      single("LAngle", "<");
      continue;
    }
    if (c === ">") {
      single("RAngle", ">");
      continue;
    }
    if (c === "*") {
      single("Star", "*");
      continue;
    }
    if (c === "+") {
      single("Plus", "+");
      continue;
    }
    if (c === "~") {
      single("Tilde", "~");
      continue;
    }
    if (c === ".") {
      single("Dot", ".");
      continue;
    }
    if (c === "_") {
      single("Underscore", "_");
      continue;
    }
    if (c === "^") {
      single("Caret", "^");
      continue;
    }
    if (c === "#") {
      single("Hash", "#");
      continue;
    }

    if (c === "|") {
      const start = i;
      const sLine = line;
      const sCol = col;
      if (peek(1) === "|") {
        advance(2);
        tokens.push({ kind: "DoublePipe", value: "||", span: span(start, i, sLine, sCol) });
      } else {
        advance();
        tokens.push({ kind: "Pipe", value: "|", span: span(start, i, sLine, sCol) });
      }
      continue;
    }

    if (c === "-") {
      const start = i;
      const sLine = line;
      const sCol = col;
      if (peek(1) === ">") {
        advance(2);
        tokens.push({ kind: "Arrow", value: "->", span: span(start, i, sLine, sCol) });
      } else {
        advance();
        tokens.push({ kind: "Minus", value: "-", span: span(start, i, sLine, sCol) });
      }
      continue;
    }

    // numbers
    if (isDigit(c)) {
      const start = i;
      const sLine = line;
      const sCol = col;
      while (isDigit(peek())) {
        advance();
      }
      if (peek() === "." && isDigit(peek(1))) {
        advance();
        while (isDigit(peek())) {
          advance();
        }
        const value = source.slice(start, i);
        tokens.push({ kind: "FloatLiteral", value, span: span(start, i, sLine, sCol) });
      } else {
        const value = source.slice(start, i);
        tokens.push({ kind: "IntLiteral", value, span: span(start, i, sLine, sCol) });
      }
      continue;
    }

    // pitch attempt: only for letters a..g
    if (c !== undefined && c >= "a" && c <= "g") {
      const tail = source.slice(i);
      const m = PITCH_RE.exec(tail);
      if (m) {
        const value = m[0];
        const start = i;
        const sLine = line;
        const sCol = col;
        advance(value.length);
        tokens.push({ kind: "Pitch", value, span: span(start, i, sLine, sCol) });
        continue;
      }
    }

    // identifier
    if (isIdentStart(c)) {
      const start = i;
      const sLine = line;
      const sCol = col;
      while (isIdentCont(peek())) {
        advance();
      }
      const value = source.slice(start, i);
      tokens.push({ kind: "Identifier", value, span: span(start, i, sLine, sCol) });
      continue;
    }

    throw new LexError(`unexpected character '${c ?? ""}'`, span(i, i + 1, line, col));
  }

  tokens.push({ kind: "Eof", value: "", span: span(i, i, line, col) });
  return tokens;
}

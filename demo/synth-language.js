import { HighlightStyle, StreamLanguage, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

// Identifiers that act as keywords in the SynthJS grammar.
const KEYWORDS = new Set([
  "voice",
  "with",
  "envelope",
  "tuplet",
  "repeat",
  "ramp",
  "define",
  "instrument",
  "as",
]);

const MODES = new Set([
  "major",
  "minor",
  "dorian",
  "phrygian",
  "lydian",
  "mixolydian",
  "locrian",
]);

const OSCILLATORS = new Set(["sine", "square", "sawtooth", "triangle", "noise"]);
const ENVELOPE_KINDS = new Set(["adsr", "linear", "percussive"]);
const FILTER_KINDS = new Set(["lowpass", "highpass", "bandpass", "notch"]);
const DYNAMICS = new Set(["\\pp", "\\p", "\\mp", "\\mf", "\\f", "\\ff", "\\fff"]);
const FIELD_NAMES = new Set(["oscillator", "filter", "detune"]);

const PITCH_RE = /^[a-g](?:##|bb|#|b|n)?\d(?:[+-]\d+c)?/;
// Sticky-octave pitch: single note letter (a-g) with optional accidental and
// no octave digit, but only when not followed by another word character so
// identifiers like `arp`, `dorian`, `ramp` aren't mis-tokenized.
const INHERITED_PITCH_RE = /^[a-g](?:##|bb|#|b|n)?(?![a-zA-Z0-9_])/;

function startState() {
  return { inBlockComment: false };
}

function token(stream, state) {
  if (state.inBlockComment) {
    while (!stream.eol()) {
      if (stream.match("*/")) {
        state.inBlockComment = false;
        return "comment";
      }
      stream.next();
    }
    return "comment";
  }

  if (stream.eatSpace()) return null;

  if (stream.match("///")) {
    stream.skipToEnd();
    return "docComment";
  }
  if (stream.match("//")) {
    stream.skipToEnd();
    return "comment";
  }
  if (stream.match("/*")) {
    state.inBlockComment = true;
    return "comment";
  }

  // String literals
  if (stream.peek() === '"') {
    stream.next();
    while (!stream.eol()) {
      const ch = stream.next();
      if (ch === "\\") {
        stream.next();
        continue;
      }
      if (ch === '"') return "string";
    }
    return "string";
  }

  // Backslash commands and dynamics
  if (stream.peek() === "\\") {
    if (stream.match(/\\[a-z]+/)) {
      const word = stream.current();
      return DYNAMICS.has(word) ? "dynamic" : "command";
    }
    stream.next();
    return null;
  }

  // Annotations
  if (stream.peek() === "@") {
    stream.match(/@[a-zA-Z_][a-zA-Z0-9_]*/);
    return "annotation";
  }

  // Pitch tokens (greedy: letter + accidental? + digit + cent-offset?)
  if (stream.match(PITCH_RE)) {
    return "pitch";
  }

  // Sticky-octave inherited pitch (e.g. `d` after `4 c4`).
  if (stream.match(INHERITED_PITCH_RE)) {
    return "pitch";
  }

  // Numbers (float before int)
  if (stream.match(/\d+\.\d+/)) return "number";
  if (stream.match(/\d+/)) return "duration";

  // Slide arrow
  if (stream.match("->")) return "arrow";

  // Bar markers
  if (stream.match("||")) return "barDouble";
  if (stream.peek() === "|") {
    stream.next();
    return "bar";
  }

  // Identifiers
  if (/[a-zA-Z_]/.test(stream.peek() ?? "")) {
    stream.match(/[a-zA-Z_][a-zA-Z0-9_]*/);
    const word = stream.current();
    if (KEYWORDS.has(word)) return "keyword";
    if (MODES.has(word)) return "mode";
    if (OSCILLATORS.has(word)) return "oscillator";
    if (ENVELOPE_KINDS.has(word) || FILTER_KINDS.has(word)) return "envelopeKind";
    if (FIELD_NAMES.has(word)) return "fieldName";
    if (word === "r") return "rest";
    return "identifier";
  }

  // Single-character punctuation/operators (split into many categories so each
  // gets a distinct color)
  const ch = stream.next();
  if (!ch) return null;
  if (ch === "+") return "plus";
  if (ch === "-") return "minus";
  if (ch === "*") return "star";
  if (ch === "~") return "tilde";
  if (ch === "=") return "assignment";
  if (ch === ".") return "dot";
  if (ch === "_") return "underscore";
  if (ch === ">") return "rangle";
  if (ch === "<") return "langle";
  if (ch === "{" || ch === "}") return "brace";
  if (ch === "(" || ch === ")") return "paren";
  if (ch === "#") return "hash";
  if (ch === "^") return "caret";
  if (ch === ",") return "comma";
  if (ch === ";") return "semicolon";
  if (ch === ":") return "colon";
  if (ch === "/") return "slash";
  return null;
}

// Map each stream token name to a Lezer tag. StreamLanguage uses this table to
// translate the strings returned by `token()` into tags that HighlightStyle
// can target. Without an explicit tokenTable, custom token names (e.g.,
// "command", "dynamic", "pitch") are treated as raw CSS classes and are
// invisible to HighlightStyle.
const tagMap = {
  comment: t.lineComment,
  docComment: t.docComment,
  string: t.string,
  command: t.controlKeyword,
  dynamic: t.unit,
  annotation: t.meta,
  pitch: t.atom,
  rest: t.bool,
  number: t.float,
  duration: t.integer,
  keyword: t.keyword,
  mode: t.modifier,
  oscillator: t.tagName,
  envelopeKind: t.className,
  fieldName: t.propertyName,
  identifier: t.variableName,
  arrow: t.controlOperator,
  assignment: t.definitionOperator,
  plus: t.arithmeticOperator,
  minus: t.arithmeticOperator,
  star: t.updateOperator,
  tilde: t.logicOperator,
  dot: t.modifier,
  underscore: t.modifier,
  rangle: t.angleBracket,
  langle: t.angleBracket,
  brace: t.brace,
  paren: t.paren,
  hash: t.special(t.operator),
  caret: t.special(t.atom),
  comma: t.separator,
  semicolon: t.separator,
  colon: t.punctuation,
  slash: t.operator,
  bar: t.regexp,
  barDouble: t.bracket,
};

const synthStream = StreamLanguage.define({
  name: "synthjs",
  startState,
  token,
  tokenTable: tagMap,
});

// Pastel-bright palette tuned for the demo's dark background.
const highlightStyle = HighlightStyle.define([
  // Comments
  { tag: tagMap.comment, color: "#7a8c9c", fontStyle: "italic" },
  { tag: tagMap.docComment, color: "#9fe6a8", fontStyle: "italic" },

  // Literals
  { tag: tagMap.string, color: "#ffb38a" },
  { tag: tagMap.pitch, color: "#9cc8ff", fontWeight: "600" },
  { tag: tagMap.rest, color: "#c4a8ff", fontStyle: "italic" },
  { tag: tagMap.duration, color: "#a8f0c8", fontWeight: "600" },
  { tag: tagMap.number, color: "#c9f48c" },

  // State markers
  { tag: tagMap.command, color: "#ff9ec5", fontWeight: "600" },
  { tag: tagMap.dynamic, color: "#ffe48c", fontWeight: "700" },
  { tag: tagMap.annotation, color: "#ffc09f", fontWeight: "600" },

  // Keywords / structural
  { tag: tagMap.keyword, color: "#e8a8ff", fontWeight: "600" },
  { tag: tagMap.mode, color: "#fff4a8", fontStyle: "italic" },
  { tag: tagMap.oscillator, color: "#8cf0e8", fontWeight: "600" },
  { tag: tagMap.envelopeKind, color: "#a8e0e8", fontStyle: "italic" },
  { tag: tagMap.fieldName, color: "#a8e8ff" },
  { tag: tagMap.identifier, color: "#f0e7d3" },

  // Operators
  { tag: tagMap.arrow, color: "#c4a8ff", fontWeight: "700" },
  { tag: tagMap.assignment, color: "#ff8c8c", fontWeight: "700" },
  { tag: tagMap.plus, color: "#ff9ec5" },
  { tag: tagMap.star, color: "#ffe48c", fontWeight: "700" },
  { tag: tagMap.tilde, color: "#ffc09f", fontWeight: "700" },

  // Articulation modifiers (postfix on pitch)
  { tag: tagMap.dot, color: "#e8a8ff" },
  { tag: tagMap.underscore, color: "#a8f0c8" },

  // Brackets / parens / chord delimiters
  { tag: tagMap.langle, color: "#8cf0e8", fontWeight: "700" },
  { tag: tagMap.brace, color: "#c4a8ff" },
  { tag: tagMap.paren, color: "#9cd9d3" },

  // Scale-degree / accidental sigils
  { tag: tagMap.hash, color: "#ff9ec5" },
  { tag: tagMap.caret, color: "#ff9ec5", fontWeight: "700" },

  // Separators
  { tag: tagMap.comma, color: "#7a8c9c" },
  { tag: tagMap.colon, color: "#9cd9d3" },
  { tag: tagMap.slash, color: "#a8e8ff" },

  // Bar markers
  { tag: tagMap.bar, color: "#ffe48c", fontWeight: "700" },
  { tag: tagMap.barDouble, color: "#fff4a8", fontWeight: "800" },
]);

export function synthLanguage() {
  return [synthStream, syntaxHighlighting(highlightStyle)];
}

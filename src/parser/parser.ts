import type {
  AbsolutePitch,
  Annotation,
  Arg,
  ArticulationKind,
  ArticulationMark,
  BarMarker,
  Binding,
  Block,
  Call,
  CallExpr,
  ChordEvent,
  Composition,
  DetuneDirective,
  DurationToken,
  EnvelopeExpr,
  Event,
  IdentArg,
  InstrumentDef,
  InstrumentDirective,
  InstrumentField,
  KeyDirective,
  MotifRef,
  NamedArg,
  NoteEvent,
  NumberArg,
  ParamRef,
  PitchArith,
  PitchTerm,
  RampExpr,
  RepeatExpr,
  RestEvent,
  ScaleDegree,
  SlideEvent,
  StringArg,
  TempoDirective,
  TimeDirective,
  TopLevel,
  TupletExpr,
  UseDecl,
  VoiceDecl,
  WithExpr,
} from "../ast/nodes.js";
import { ParseError, type SourceSpan } from "../errors.js";
import type { Token, TokenKind } from "../lexer/token.js";
import { type Mode, isMode } from "../modes.js";
import { parsePitchString } from "../pitch.js";

// Keywords that are parsed as identifiers but treated structurally
const KEYWORDS = new Set([
  "voice",
  "instrument",
  "repeat",
  "with",
  "envelope",
  "tuplet",
  "ramp",
  "as",
  "define",
  "oscillator",
  "filter",
  "detune",
  "r",
]);

type EventList = { kind: "EventList"; events: Event[]; span: SourceSpan };

class Parser {
  private tokens: Token[];
  private pos: number;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
    this.pos = 0;
  }

  // ---- Core helpers ----

  private peek(offset = 0): Token {
    const idx = this.pos + offset;
    const last = this.tokens[this.tokens.length - 1];
    if (last === undefined)
      throw new ParseError("empty token stream", { start: 0, end: 0, line: 1, column: 1 });
    return this.tokens[idx] ?? last;
  }

  private advance(): Token {
    const tok = this.peek();
    if (tok.kind !== "Eof") this.pos++;
    return tok;
  }

  private check(kind: TokenKind, offset = 0): boolean {
    return this.peek(offset).kind === kind;
  }

  private checkValue(value: string, offset = 0): boolean {
    return this.peek(offset).value === value;
  }

  private eat(kind: TokenKind): Token | undefined {
    if (this.check(kind)) return this.advance();
    return undefined;
  }

  private expect(kind: TokenKind, message?: string): Token {
    if (this.check(kind)) return this.advance();
    const tok = this.peek();
    throw new ParseError(message ?? `expected ${kind}, got ${tok.kind} ('${tok.value}')`, tok.span);
  }

  private spanRange(start: SourceSpan, end: SourceSpan): SourceSpan {
    return { start: start.start, end: end.end, line: start.line, column: start.column };
  }

  private peekPrev(): Token {
    const idx = this.pos - 1;
    const first = this.tokens[0];
    if (first === undefined)
      throw new ParseError("empty token stream", { start: 0, end: 0, line: 1, column: 1 });
    return this.tokens[idx] ?? first;
  }

  // ---- Public entry ----

  parseComposition(): Composition {
    const startSpan = this.peek().span;
    let version: string | undefined;

    // Check for \version at very top
    if (this.check("BackslashCommand") && this.checkValue("\\version")) {
      this.advance();
      const strTok = this.expect("String", "expected string after \\version");
      version = strTok.value;
    }

    const body: TopLevel[] = [];
    while (!this.check("Eof")) {
      const item = this.parseTopLevel();
      if (item !== null) body.push(item);
    }

    const endSpan = this.peek().span;
    const span = this.spanRange(startSpan, endSpan);

    return version !== undefined
      ? { kind: "Composition", version, body, span }
      : { kind: "Composition", body, span };
  }

  // ---- Top-level ----

  private parseTopLevel(): TopLevel | null {
    // Collect doc comments
    const docParts: string[] = [];
    while (this.check("DocComment")) {
      docParts.push(this.advance().value);
    }
    const doc: string | undefined = docParts.length > 0 ? docParts.join("\n") : undefined;

    // Collect annotations
    const annotations: Annotation[] = [];
    while (this.check("AnnotationName")) {
      annotations.push(this.parseAnnotation());
    }

    const tok = this.peek();

    // \command directives
    if (tok.kind === "BackslashCommand") {
      return this.parseDirectiveOrUse();
    }

    // Dynamic marker
    if (tok.kind === "Dynamic") {
      this.advance();
      return { kind: "Dynamic", value: tok.value, span: tok.span };
    }

    // Identifier-based keywords and bindings
    if (tok.kind === "Identifier") {
      const val = tok.value;

      if (val === "voice") {
        return this.parseVoiceDecl(doc, annotations);
      }
      if (val === "instrument") {
        return this.parseInstrumentDef(doc);
      }
      if (val === "repeat") {
        return this.parseRepeat();
      }
      if (val === "with") {
        return this.parseWith();
      }
      if (val === "envelope") {
        return this.parseEnvelope();
      }
      if (val === "tuplet") {
        return this.parseTuplet();
      }
      if (val === "ramp") {
        return this.parseRamp();
      }

      // Check if it's a binding: ident ('(' params ')')? '='
      if (this.isBindingStart()) {
        return this.parseBinding(doc);
      }

      // Otherwise treat as event (motif ref or call)
      const ev = this.parseEvent();
      if (annotations.length > 0) {
        return { kind: "Annotated", annotations, target: ev, span: ev.span };
      }
      return ev;
    }

    // Annotations prefix on block
    if (annotations.length > 0 && this.check("LBrace")) {
      const block = this.parseBlock();
      return { kind: "AnnotatedBlock", annotations, target: block, span: block.span };
    }

    // Annotations prefix on an event
    if (annotations.length > 0) {
      const ev = this.parseEvent();
      return { kind: "Annotated", annotations, target: ev, span: ev.span };
    }

    // Events
    return this.parseEvent();
  }

  private isBindingStart(): boolean {
    // ident '=' ...
    if (this.check("Identifier", 0) && this.check("Equals", 1)) return true;
    // ident '(' ... ')' '='
    if (this.check("Identifier", 0) && this.check("LParen", 1)) {
      let depth = 0;
      let i = 1;
      while (true) {
        const k = this.peek(i).kind;
        if (k === "Eof") return false;
        if (k === "LParen") depth++;
        if (k === "RParen") {
          depth--;
          if (depth === 0) {
            return this.peek(i + 1).kind === "Equals";
          }
        }
        i++;
        if (i > 100) return false;
      }
    }
    return false;
  }

  // ---- Directives & use ----

  private parseDirectiveOrUse(): TopLevel {
    const tok = this.peek();
    const val = tok.value;

    if (val === "\\use") return this.parseUseDecl();
    if (val === "\\version") {
      this.advance();
      const strTok = this.expect("String", "expected string after \\version");
      return {
        kind: "Version",
        version: strTok.value,
        span: this.spanRange(tok.span, strTok.span),
      };
    }
    return this.parseDirective();
  }

  private parseDirective(): TopLevel {
    const tok = this.advance();
    const val = tok.value;

    if (val === "\\tempo") {
      const n = this.parseNumber();
      return { kind: "Tempo", value: n, span: tok.span } as TempoDirective;
    }

    if (val === "\\time") {
      const num = this.parseInt();
      this.expect("Slash", "expected '/' in \\time");
      const den = this.parseInt();
      return { kind: "Time", numerator: num, denominator: den, span: tok.span } as TimeDirective;
    }

    if (val === "\\key") {
      const pitchTok = this.expect("Pitch", "expected pitch after \\key");
      const spec = parsePitchString(pitchTok.value);
      if (!spec) throw new ParseError(`invalid pitch '${pitchTok.value}'`, pitchTok.span);
      const tonic: AbsolutePitch = {
        kind: "Pitch",
        letter: spec.letter,
        accidental: spec.accidental !== null ? spec.accidental : null,
        octave: spec.octave,
        cents: spec.cents,
        span: pitchTok.span,
      };
      let mode: Mode = "major";
      if (this.check("Identifier") && isMode(this.peek().value)) {
        mode = this.advance().value as Mode;
      }
      return { kind: "Key", tonic, mode, span: tok.span } as KeyDirective;
    }

    if (val === "\\instrument") {
      const nameTok = this.expect("Identifier", "expected instrument name");
      return {
        kind: "Instrument",
        name: nameTok.value,
        span: this.spanRange(tok.span, nameTok.span),
      } as InstrumentDirective;
    }

    if (val === "\\detune") {
      const cents = this.parseSignedNumber();
      return { kind: "Detune", cents, span: tok.span } as DetuneDirective;
    }

    throw new ParseError(`unknown command '${val}'`, tok.span);
  }

  private parseUseDecl(): UseDecl {
    const start = this.peek().span;
    this.advance(); // consume \use
    const pathTok = this.expect("String", "expected path string after \\use");
    const path = pathTok.value;

    // Check for 'as ident'
    if (this.check("Identifier") && this.checkValue("as")) {
      this.advance(); // consume 'as'
      const aliasTok = this.expect("Identifier", "expected alias name after 'as'");
      return {
        kind: "UseDecl",
        path,
        alias: aliasTok.value,
        span: this.spanRange(start, aliasTok.span),
      };
    }

    // Check for '(' ident_list ')'
    if (this.check("LParen")) {
      this.advance(); // consume '('
      const selected: string[] = [];
      while (!this.check("RParen") && !this.check("Eof")) {
        const id = this.expect("Identifier", "expected identifier in import list");
        selected.push(id.value);
        this.eat("Comma");
      }
      const close = this.expect("RParen", "expected ')' after import list");
      return {
        kind: "UseDecl",
        path,
        selected,
        span: this.spanRange(start, close.span),
      };
    }

    return { kind: "UseDecl", path, span: this.spanRange(start, pathTok.span) };
  }

  // ---- Bindings ----

  private parseBinding(doc?: string): Binding {
    const startSpan = this.peek().span;
    const nameTok = this.advance(); // consume ident
    const name = nameTok.value;

    let params: string[] | undefined;
    if (this.check("LParen")) {
      this.advance(); // consume '('
      params = [];
      while (!this.check("RParen") && !this.check("Eof")) {
        const p = this.expect("Identifier", "expected parameter name");
        params.push(p.value);
        this.eat("Comma");
      }
      this.expect("RParen", "expected ')' after param list");
    }

    this.expect("Equals", "expected '=' in binding");

    const body = this.parseExpr();
    const span = this.spanRange(startSpan, this.peek().span);

    // Build object conditionally to avoid exact optional property violations
    return {
      kind: "Binding",
      name,
      body,
      span,
      ...(doc !== undefined && { doc }),
      ...(params !== undefined && { params }),
    } as Binding;
  }

  private parseExpr(): Block | EventList {
    if (this.check("LBrace")) {
      return this.parseBlock();
    }
    return this.parseEventList();
  }

  private parseEventList(): EventList {
    const startSpan = this.peek().span;
    const events: Event[] = [];
    while (!this.check("Eof") && !this.check("RBrace")) {
      if (this.isTopLevelStart()) break;
      const ev = this.parseEvent();
      events.push(ev);
    }
    const endSpan = events.length > 0 ? (events[events.length - 1]?.span ?? startSpan) : startSpan;
    return { kind: "EventList", events, span: this.spanRange(startSpan, endSpan) };
  }

  private isTopLevelStart(): boolean {
    const tok = this.peek();
    if (tok.kind === "BackslashCommand") return true;
    if (tok.kind === "DocComment") return true;
    if (tok.kind === "Identifier") {
      const val = tok.value;
      if (val === "voice" || val === "instrument") return true;
      if (this.isBindingStart()) return true;
    }
    return false;
  }

  // ---- Voice declaration ----

  private parseVoiceDecl(doc?: string, annotations: Annotation[] = []): VoiceDecl {
    const startSpan = this.peek().span;
    this.advance(); // consume 'voice'
    const nameTok = this.expect("Identifier", "expected voice name");
    const block = this.parseBlock();
    const span = this.spanRange(startSpan, block.span);

    return {
      kind: "VoiceDecl",
      annotations,
      name: nameTok.value,
      body: block,
      span,
      ...(doc !== undefined && { doc }),
    } as VoiceDecl;
  }

  // ---- Instrument definition ----

  private parseInstrumentDef(doc?: string): InstrumentDef {
    const startSpan = this.peek().span;
    this.advance(); // consume 'instrument'
    const next = this.peek();
    if (next.kind !== "Identifier" || next.value !== "define") {
      throw new ParseError("expected 'define' after 'instrument'", next.span);
    }
    this.advance(); // consume 'define'
    const nameTok = this.expect("Identifier", "expected instrument name");
    this.expect("LBrace", "expected '{' in instrument definition");

    const fields: InstrumentField[] = [];
    while (!this.check("RBrace") && !this.check("Eof")) {
      fields.push(this.parseInstrumentField());
    }
    const close = this.expect("RBrace", "expected '}' in instrument definition");
    const span = this.spanRange(startSpan, close.span);

    return {
      kind: "InstrumentDef",
      name: nameTok.value,
      fields,
      span,
      ...(doc !== undefined && { doc }),
    } as InstrumentDef;
  }

  private parseInstrumentField(): InstrumentField {
    const tok = this.peek();
    if (tok.kind !== "Identifier") {
      throw new ParseError("expected instrument field", tok.span);
    }
    const val = tok.value;

    if (val === "oscillator") {
      this.advance();
      const kindTok = this.expect("Identifier", "expected oscillator kind");
      return {
        kind: "Oscillator",
        value: kindTok.value,
        span: this.spanRange(tok.span, kindTok.span),
      };
    }
    if (val === "envelope") {
      this.advance();
      const call = this.parseCall();
      return { kind: "EnvelopeField", call, span: this.spanRange(tok.span, call.span) };
    }
    if (val === "filter") {
      this.advance();
      const call = this.parseCall();
      return { kind: "FilterField", call, span: this.spanRange(tok.span, call.span) };
    }
    if (val === "detune") {
      this.advance();
      const cents = this.parseSignedNumber();
      return { kind: "DetuneField", cents, span: tok.span };
    }
    throw new ParseError(`unknown instrument field '${val}'`, tok.span);
  }

  // ---- Block ----

  parseBlock(): Block {
    const start = this.expect("LBrace", "expected '{'").span;
    const body: TopLevel[] = [];
    while (!this.check("RBrace") && !this.check("Eof")) {
      const item = this.parseTopLevel();
      if (item !== null) body.push(item);
    }
    const close = this.expect("RBrace", "expected '}'");
    return { kind: "Block", body, span: this.spanRange(start, close.span) };
  }

  // ---- Events ----

  parseEvent(): Event {
    const tok = this.peek();

    // Bar markers
    if (tok.kind === "Pipe") {
      this.advance();
      return { kind: "Bar", double: false, span: tok.span } as BarMarker;
    }
    if (tok.kind === "DoublePipe") {
      this.advance();
      return { kind: "Bar", double: true, span: tok.span } as BarMarker;
    }

    // Dynamic
    if (tok.kind === "Dynamic") {
      this.advance();
      return { kind: "Dynamic", value: tok.value, span: tok.span };
    }

    // Tilde = sustain event: ~ pitch
    if (tok.kind === "Tilde") {
      this.advance();
      const pitch = this.parsePitchTerm();
      return { kind: "Sustain", pitch, span: this.spanRange(tok.span, pitch.span) };
    }

    // Keyword-based events
    if (tok.kind === "Identifier") {
      if (tok.value === "repeat") return this.parseRepeat();
      if (tok.value === "with") return this.parseWith();
      if (tok.value === "envelope") return this.parseEnvelope();
      if (tok.value === "tuplet") return this.parseTuplet();
      if (tok.value === "ramp") return this.parseRamp();
      if (tok.value === "r") return this.parseRest(undefined);
      return this.parseCallOrRef();
    }

    // Duration-prefixed events (IntLiteral = potential duration)
    if (tok.kind === "IntLiteral") {
      const duration = this.tryParseDuration();
      if (duration !== undefined) {
        return this.parsePitchEvent(duration);
      }
      throw new ParseError(`unexpected integer '${tok.value}'`, tok.span);
    }

    // Pitch tokens (no duration)
    if (tok.kind === "Pitch") {
      return this.parsePitchEvent(undefined);
    }

    // LAngle = chord
    if (tok.kind === "LAngle") {
      return this.parseChord(undefined);
    }

    // Scale degree (caret)
    if (tok.kind === "Caret") {
      return this.parsePitchEvent(undefined);
    }

    throw new ParseError(`unexpected token '${tok.value}' (${tok.kind})`, tok.span);
  }

  // Try to parse a duration token (int dot* triplet?)
  private tryParseDuration(): DurationToken | undefined {
    const tok = this.peek();
    if (tok.kind !== "IntLiteral") return undefined;

    const divisor = Number.parseInt(tok.value, 10);
    const validDivisors = new Set([1, 2, 4, 8, 16, 32, 64]);
    if (!validDivisors.has(divisor)) return undefined;

    const startSpan = tok.span;
    this.advance(); // consume int

    let dots = 0;
    while (this.check("Dot")) {
      this.advance();
      dots++;
    }

    // Triplet: the lexer emits 't' as Identifier
    let triplet = false;
    if (this.check("Identifier") && this.checkValue("t")) {
      this.advance();
      triplet = true;
    }

    const raw = tok.value + ".".repeat(dots) + (triplet ? "t" : "");
    const endSpan = this.peekPrev().span;

    return { divisor, dots, triplet, raw, span: this.spanRange(startSpan, endSpan) };
  }

  private parsePitchEvent(duration: DurationToken | undefined): Event {
    const startSpan = duration?.span ?? this.peek().span;

    // Rest?
    if (this.check("Identifier") && this.checkValue("r")) {
      return this.parseRest(duration);
    }

    // Chord?
    if (this.check("LAngle")) {
      return this.parseChord(duration);
    }

    // Note (or slide)
    const pitchTerm = this.parsePitchTerm();

    // Check for slide: ->
    if (this.check("Arrow")) {
      this.advance(); // consume ->
      const destDuration = this.tryParseDuration();
      const destPitch = this.parsePitchTerm();
      const destMods = this.parseModifiers();
      const destAnnotations = this.parseAnnotations();

      const source: NoteEvent = {
        kind: "Note",
        pitch: pitchTerm,
        modifiers: [],
        annotations: [],
        span: this.spanRange(startSpan, pitchTerm.span),
        ...(duration !== undefined && { duration }),
      } as NoteEvent;

      const destination: NoteEvent = {
        kind: "Note",
        pitch: destPitch,
        modifiers: destMods,
        annotations: destAnnotations,
        span: this.spanRange(destPitch.span, this.peekPrev().span),
        ...(destDuration !== undefined && { duration: destDuration }),
      } as NoteEvent;

      return {
        kind: "Slide",
        source,
        destination,
        span: this.spanRange(startSpan, destination.span),
      } as SlideEvent;
    }

    // Modifiers (articulation marks after pitch)
    const modifiers = this.parseModifiers();
    // Annotations (postfix)
    const annotations = this.parseAnnotations();

    // Repeat tail
    let repeat: number | undefined;
    if (this.check("Star")) {
      this.advance();
      repeat = this.parseInt();
    }

    const endSpan = this.peekPrev().span;
    return {
      kind: "Note",
      pitch: pitchTerm,
      modifiers,
      annotations,
      span: this.spanRange(startSpan, endSpan),
      ...(duration !== undefined && { duration }),
      ...(repeat !== undefined && { repeat }),
    } as NoteEvent;
  }

  private parseRest(duration: DurationToken | undefined): RestEvent {
    const startSpan = duration?.span ?? this.peek().span;
    const rTok = this.expect("Identifier", "expected 'r' for rest");
    if (rTok.value !== "r") {
      throw new ParseError(`expected 'r' for rest, got '${rTok.value}'`, rTok.span);
    }
    const modifiers = this.parseModifiers();
    const annotations = this.parseAnnotations();
    return {
      kind: "Rest",
      modifiers,
      annotations,
      span: this.spanRange(startSpan, rTok.span),
      ...(duration !== undefined && { duration }),
    } as RestEvent;
  }

  private parseChord(duration: DurationToken | undefined): ChordEvent {
    const startSpan = duration?.span ?? this.peek().span;
    const openTok = this.expect("LAngle", "expected '<' for chord");
    if (!openTok) throw new ParseError("expected '<' for chord", this.peek().span);

    const pitches: PitchTerm[] = [];
    while (!this.check("RAngle") && !this.check("Eof")) {
      pitches.push(this.parsePitchTerm());
    }
    if (!this.check("RAngle")) {
      throw new ParseError("expected '>' to close chord", this.peek().span);
    }
    if (pitches.length < 2) {
      throw new ParseError("chord must have at least 2 pitches", this.peek().span);
    }
    this.expect("RAngle", "expected '>' to close chord");

    const modifiers = this.parseModifiers();
    const annotations = this.parseAnnotations();

    let repeat: number | undefined;
    if (this.check("Star")) {
      this.advance();
      repeat = this.parseInt();
    }

    const endSpan = this.peekPrev().span;
    return {
      kind: "Chord",
      pitches,
      modifiers,
      annotations,
      span: this.spanRange(startSpan, endSpan),
      ...(duration !== undefined && { duration }),
      ...(repeat !== undefined && { repeat }),
    } as ChordEvent;
  }

  // Parse articulation modifiers: '.', '_', '^', '>'
  private parseModifiers(): ArticulationMark[] {
    const marks: ArticulationMark[] = [];
    while (true) {
      const tok = this.peek();
      let mark: ArticulationKind | null = null;
      if (tok.kind === "Dot") mark = ".";
      else if (tok.kind === "Underscore") mark = "_";
      else if (tok.kind === "Caret") mark = "^";
      else if (tok.kind === "RAngle") mark = ">";
      else break;

      this.advance();
      marks.push({ kind: "Articulation", mark, span: tok.span });
    }
    return marks;
  }

  // Parse postfix annotations
  private parseAnnotations(): Annotation[] {
    const annotations: Annotation[] = [];
    while (this.check("AnnotationName")) {
      annotations.push(this.parseAnnotation());
    }
    return annotations;
  }

  private parseAnnotation(): Annotation {
    const nameTok = this.expect("AnnotationName", "expected annotation name");
    const name = nameTok.value;
    let args: Arg[] = [];

    if (this.check("LParen")) {
      this.advance();
      args = this.parseArgList();
      this.expect("RParen", "expected ')' after annotation args");
    }

    const endSpan = this.peekPrev().span;
    return { kind: "Annotation", name, args, span: this.spanRange(nameTok.span, endSpan) };
  }

  // ---- Pitch terms ----

  parsePitchTerm(): PitchTerm {
    // Scale degree: ^ signed_int accidental?
    if (this.check("Caret")) {
      return this.parseScaleDegree();
    }

    // Identifier = param ref (not a keyword)
    if (this.check("Identifier") && !KEYWORDS.has(this.peek().value)) {
      const tok = this.advance();
      const base: ParamRef = { kind: "ParamRef", name: tok.value, span: tok.span };
      return this.parseArithTail(base);
    }

    // Absolute pitch
    if (this.check("Pitch")) {
      const pitch = this.parsePitch();
      return this.parseArithTail(pitch);
    }

    throw new ParseError(`expected pitch term, got ${this.peek().kind}`, this.peek().span);
  }

  private parsePitch(): AbsolutePitch {
    const tok = this.expect("Pitch", "expected pitch");
    const spec = parsePitchString(tok.value);
    if (!spec) throw new ParseError(`invalid pitch '${tok.value}'`, tok.span);
    return {
      kind: "Pitch",
      letter: spec.letter,
      accidental: spec.accidental,
      octave: spec.octave,
      cents: spec.cents,
      span: tok.span,
    };
  }

  private parseScaleDegree(): ScaleDegree {
    const startSpan = this.peek().span;
    this.expect("Caret", "expected '^' for scale degree");
    const negative = this.check("Minus");
    if (negative) this.advance();
    const intTok = this.expect("IntLiteral", "expected degree number after '^'");
    const degree = (negative ? -1 : 1) * Number.parseInt(intTok.value, 10);
    const endSpan = intTok.span;
    return { kind: "ScaleDegree", degree, span: this.spanRange(startSpan, endSpan) };
  }

  private parseArithTail(base: PitchTerm): PitchTerm {
    let current = base;
    while (true) {
      if (this.check("Plus")) {
        this.advance();
        const n = this.parseInt();
        current = {
          kind: "PitchArith",
          base: current,
          semitones: n,
          span: this.spanRange(current.span, this.peekPrev().span),
        } as PitchArith;
      } else if (this.check("Minus")) {
        this.advance();
        const n = this.parseInt();
        current = {
          kind: "PitchArith",
          base: current,
          semitones: -n,
          span: this.spanRange(current.span, this.peekPrev().span),
        } as PitchArith;
      } else {
        break;
      }
    }
    return current;
  }

  // ---- Repeat ----

  private parseRepeat(): RepeatExpr {
    const startSpan = this.peek().span;
    this.advance(); // consume 'repeat'
    const count = this.parseInt();
    const block = this.parseBlock();
    return { kind: "Repeat", count, body: block, span: this.spanRange(startSpan, block.span) };
  }

  // ---- With, Envelope, Tuplet, Ramp ----

  private parseWith(): WithExpr {
    const startSpan = this.peek().span;
    this.advance(); // consume 'with'
    const effects: Call[] = [];
    effects.push(this.parseCall());
    while (this.check("Comma")) {
      this.advance();
      effects.push(this.parseCall());
    }
    const block = this.parseBlock();
    return { kind: "With", effects, body: block, span: this.spanRange(startSpan, block.span) };
  }

  private parseEnvelope(): EnvelopeExpr {
    const startSpan = this.peek().span;
    this.advance(); // consume 'envelope'
    const call = this.parseCall();
    const block = this.parseBlock();
    return { kind: "Envelope", call, body: block, span: this.spanRange(startSpan, block.span) };
  }

  private parseTuplet(): TupletExpr {
    const startSpan = this.peek().span;
    this.advance(); // consume 'tuplet'
    this.expect("LParen", "expected '(' after tuplet");
    const n = this.parseInt();
    let m: number | undefined;
    if (this.check("Comma")) {
      this.advance();
      m = this.parseInt();
    }
    this.expect("RParen", "expected ')' after tuplet spec");
    const block = this.parseBlock();
    const span = this.spanRange(startSpan, block.span);
    return m !== undefined
      ? { kind: "Tuplet", n, m, body: block, span }
      : { kind: "Tuplet", n, body: block, span };
  }

  private parseRamp(): RampExpr {
    const startSpan = this.peek().span;
    this.advance(); // consume 'ramp'
    this.expect("LParen", "expected '(' after ramp");
    const fromTok = this.peek();
    if (fromTok.kind !== "Dynamic") {
      throw new ParseError("expected dynamic in ramp", fromTok.span);
    }
    const from = fromTok.value;
    this.advance();
    this.expect("Comma", "expected ',' in ramp");
    const toTok = this.peek();
    if (toTok.kind !== "Dynamic") {
      throw new ParseError("expected dynamic in ramp", toTok.span);
    }
    const to = toTok.value;
    this.advance();
    this.expect("RParen", "expected ')' after ramp");
    const block = this.parseBlock();
    return { kind: "Ramp", from, to, body: block, span: this.spanRange(startSpan, block.span) };
  }

  // ---- Call / MotifRef ----

  private parseCallOrRef(): MotifRef | CallExpr {
    const tok = this.advance(); // consume ident
    const name = tok.value;

    if (this.check("LParen")) {
      this.advance();
      const args = this.parseArgList();
      const close = this.expect("RParen", "expected ')' after call args");
      return { kind: "Call", name, args, span: this.spanRange(tok.span, close.span) } as CallExpr;
    }

    return { kind: "MotifRef", name, span: tok.span };
  }

  // Parse a named call: ident '(' arg_list? ')'
  private parseCall(): Call {
    const nameTok = this.expect("Identifier", "expected function name");
    const name = nameTok.value;
    this.expect("LParen", `expected '(' after '${name}'`);
    const args = this.parseArgList();
    const close = this.expect("RParen", "expected ')' after args");
    return { kind: "Call", name, args, span: this.spanRange(nameTok.span, close.span) };
  }

  // ---- Args ----

  private parseArgList(): Arg[] {
    const args: Arg[] = [];
    while (!this.check("RParen") && !this.check("Eof")) {
      args.push(this.parseArg());
      this.eat("Comma");
    }
    return args;
  }

  private parseArg(): Arg {
    const tok = this.peek();

    // Named arg: ident ':' value
    if (tok.kind === "Identifier" && this.check("Colon", 1)) {
      const nameTok = this.advance();
      this.advance(); // consume ':'
      const val = this.parseArgValue();
      return {
        kind: "NamedArg",
        name: nameTok.value,
        value: val,
        span: this.spanRange(nameTok.span, val.span),
      } as NamedArg;
    }

    return this.parseArgValue();
  }

  private parseArgValue(): Arg {
    const tok = this.peek();

    if (tok.kind === "FloatLiteral" || tok.kind === "IntLiteral") {
      this.advance();
      return { kind: "NumberArg", value: Number(tok.value), span: tok.span } as NumberArg;
    }

    if (tok.kind === "Minus") {
      this.advance();
      const numTok = this.peek();
      if (numTok.kind !== "IntLiteral" && numTok.kind !== "FloatLiteral") {
        throw new ParseError("expected number after '-'", numTok.span);
      }
      this.advance();
      return {
        kind: "NumberArg",
        value: -Number(numTok.value),
        span: this.spanRange(tok.span, numTok.span),
      } as NumberArg;
    }

    if (tok.kind === "String") {
      this.advance();
      return { kind: "StringArg", value: tok.value, span: tok.span } as StringArg;
    }

    if (tok.kind === "Pitch") {
      const pitch = this.parsePitch();
      return { kind: "PitchArg", value: pitch, span: pitch.span };
    }

    if (tok.kind === "Identifier") {
      this.advance();
      return { kind: "IdentArg", name: tok.value, span: tok.span } as IdentArg;
    }

    throw new ParseError(`unexpected token in arg: ${tok.kind} '${tok.value}'`, tok.span);
  }

  // ---- Number helpers ----

  private parseNumber(): number {
    const tok = this.peek();
    if (tok.kind === "FloatLiteral" || tok.kind === "IntLiteral") {
      this.advance();
      return Number(tok.value);
    }
    throw new ParseError(`expected number, got ${tok.kind}`, tok.span);
  }

  private parseInt(): number {
    const tok = this.expect("IntLiteral", "expected integer");
    return Number.parseInt(tok.value, 10);
  }

  private parseSignedNumber(): number {
    if (this.check("Minus")) {
      this.advance();
      return -this.parseNumber();
    }
    if (this.check("Plus")) {
      this.advance();
    }
    return this.parseNumber();
  }
}

export function parse(tokens: Token[]): Composition {
  const parser = new Parser(tokens);
  return parser.parseComposition();
}

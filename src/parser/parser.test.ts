import { describe, expect, it } from "vitest";
import { ParseError } from "../errors.js";
import { lex } from "../lexer/lexer.js";
import { parse } from "./parser.js";

describe("parse — directives", () => {
  it("\\tempo 120", () => {
    const c = parse(lex("\\tempo 120"));
    expect(c.body[0]).toMatchObject({ kind: "Tempo", value: 120 });
  });
  it("\\time 4/4", () => {
    const c = parse(lex("\\time 4/4"));
    expect(c.body[0]).toMatchObject({ kind: "Time", numerator: 4, denominator: 4 });
  });
  it("\\key c4 major", () => {
    const c = parse(lex("\\key c4 major"));
    const k = c.body[0];
    if (k?.kind !== "Key") throw new Error("expected Key");
    expect(k.tonic.letter).toBe("c");
    expect(k.tonic.octave).toBe(4);
    expect(k.mode).toBe("major");
  });
  it("\\key f#3 minor", () => {
    const c = parse(lex("\\key f#3 minor"));
    const k = c.body[0];
    if (k?.kind !== "Key") throw new Error("expected Key");
    expect(k.tonic.accidental).toBe("#");
    expect(k.mode).toBe("minor");
  });
  it("\\instrument sawtooth", () => {
    const c = parse(lex("\\instrument sawtooth"));
    expect(c.body[0]).toMatchObject({ kind: "Instrument", name: "sawtooth" });
  });
  it("\\detune -8", () => {
    const c = parse(lex("\\detune -8"));
    expect(c.body[0]).toMatchObject({ kind: "Detune", cents: -8 });
  });
  it('\\version "2.0"', () => {
    const c = parse(lex('\\version "2.0"'));
    expect(c.version).toBe("2.0");
  });
});

describe("parse — single events", () => {
  it("4 c4", () => {
    const c = parse(lex("4 c4"));
    const n = c.body[0];
    if (n?.kind !== "Note") throw new Error("expected Note");
    expect(n.duration?.divisor).toBe(4);
    if (n.pitch.kind !== "Pitch") throw new Error("expected absolute pitch");
    expect(n.pitch.letter).toBe("c");
    expect(n.pitch.octave).toBe(4);
  });
  it("dotted quarter", () => {
    const c = parse(lex("4. c4"));
    const n = c.body[0];
    if (n?.kind !== "Note") throw new Error("expected Note");
    expect(n.duration?.dots).toBe(1);
  });
  it("triplet", () => {
    const c = parse(lex("4t c4"));
    const n = c.body[0];
    if (n?.kind !== "Note") throw new Error("expected Note");
    expect(n.duration?.triplet).toBe(true);
  });
  it("sticky duration", () => {
    const c = parse(lex("4 c4 d4"));
    expect(c.body).toHaveLength(2);
    const n2 = c.body[1];
    if (n2?.kind !== "Note") throw new Error("expected Note");
    expect(n2.duration).toBeUndefined();
  });
});

describe("parse — chord", () => {
  it("4 <c4 e4 g4>", () => {
    const c = parse(lex("4 <c4 e4 g4>"));
    const ch = c.body[0];
    if (ch?.kind !== "Chord") throw new Error("expected Chord");
    expect(ch.pitches).toHaveLength(3);
  });
});

describe("parse — slide", () => {
  it("2 e2 -> c3", () => {
    const c = parse(lex("2 e2 -> c3"));
    const s = c.body[0];
    if (s?.kind !== "Slide") throw new Error("expected Slide");
    if (s.source.pitch.kind !== "Pitch") throw new Error();
    expect(s.source.pitch.letter).toBe("e");
    if (s.destination.pitch.kind !== "Pitch") throw new Error();
    expect(s.destination.pitch.letter).toBe("c");
  });
});

describe("parse — rest and articulation", () => {
  it("4 r", () => {
    const c = parse(lex("4 r"));
    expect(c.body[0]).toMatchObject({ kind: "Rest" });
  });
  it("4 c4.", () => {
    const c = parse(lex("4 c4."));
    const n = c.body[0];
    if (n?.kind !== "Note") throw new Error();
    expect(n.modifiers).toHaveLength(1);
    expect(n.modifiers[0]?.mark).toBe(".");
  });
  it("4 c4>", () => {
    const c = parse(lex("4 c4>"));
    const n = c.body[0];
    if (n?.kind !== "Note") throw new Error();
    expect(n.modifiers[0]?.mark).toBe(">");
  });
});

describe("parse — repetition", () => {
  it("event * N", () => {
    const c = parse(lex("4 c4 * 4"));
    const n = c.body[0];
    if (n?.kind !== "Note") throw new Error();
    expect(n.repeat).toBe(4);
  });
  it("repeat N { ... }", () => {
    const c = parse(lex("repeat 3 { 4 c4 d e }"));
    const r = c.body[0];
    if (r?.kind !== "Repeat") throw new Error();
    expect(r.count).toBe(3);
  });
});

describe("parse — bindings and voices", () => {
  it("simple binding", () => {
    const c = parse(lex("intro = 4 c4 d e f"));
    const b = c.body[0];
    if (b?.kind !== "Binding") throw new Error();
    expect(b.name).toBe("intro");
  });
  it("doc comment binding", () => {
    const c = parse(lex("/// docs\nintro = 4 c4"));
    const b = c.body[0];
    if (b?.kind !== "Binding") throw new Error();
    expect(b.doc?.trim()).toBe("docs");
  });
  it("parameterized binding", () => {
    const c = parse(lex("arp(root) = 8 <root root root>"));
    const b = c.body[0];
    if (b?.kind !== "Binding") throw new Error();
    expect(b.params).toEqual(["root"]);
  });
  it("voice declaration", () => {
    const c = parse(lex("voice melody { 4 c4 d e f }"));
    const v = c.body[0];
    if (v?.kind !== "VoiceDecl") throw new Error();
    expect(v.name).toBe("melody");
  });
});

describe("parse — effects, envelope, tuplet, ramp", () => {
  it("with reverb", () => {
    const c = parse(lex("with reverb(2, 1, 0.7) { 4 c4 }"));
    const w = c.body[0];
    if (w?.kind !== "With") throw new Error();
    expect(w.effects[0]?.name).toBe("reverb");
  });
  it("envelope", () => {
    const c = parse(lex("envelope adsr(0.01, 0.1, 0.7, 0.3) { 4 c4 }"));
    const e = c.body[0];
    if (e?.kind !== "Envelope") throw new Error();
    expect(e.call.name).toBe("adsr");
  });
  it("tuplet(5)", () => {
    const c = parse(lex("tuplet(5) { 8 c4 d e f g }"));
    const t = c.body[0];
    if (t?.kind !== "Tuplet") throw new Error();
    expect(t.n).toBe(5);
  });
  it("ramp(\\mp, \\ff)", () => {
    const c = parse(lex("ramp(\\mp, \\ff) { 4 c4 d }"));
    const r = c.body[0];
    if (r?.kind !== "Ramp") throw new Error();
    expect(r.from).toBe("\\mp");
    expect(r.to).toBe("\\ff");
  });
});

describe("parse — annotations", () => {
  it("postfix on event", () => {
    const c = parse(lex('4 c4@cue("hit")'));
    const n = c.body[0];
    if (n?.kind !== "Note") throw new Error();
    expect(n.annotations).toHaveLength(1);
    expect(n.annotations[0]?.name).toBe("@cue");
  });
  it("prefix on block", () => {
    const c = parse(lex('@section("verse") { 4 c4 d }'));
    const a = c.body[0];
    if (a?.kind !== "AnnotatedBlock") throw new Error();
    expect(a.annotations[0]?.name).toBe("@section");
  });
});

describe("parse — use", () => {
  it("simple", () => {
    const c = parse(lex('\\use "./shared.synth"'));
    const u = c.body[0];
    if (u?.kind !== "UseDecl") throw new Error();
    expect(u.path).toBe("./shared.synth");
  });
  it("alias", () => {
    const c = parse(lex('\\use "./shared.synth" as s'));
    const u = c.body[0];
    if (u?.kind !== "UseDecl") throw new Error();
    expect(u.alias).toBe("s");
  });
  it("selective", () => {
    const c = parse(lex('\\use "./shared.synth" (a, b)'));
    const u = c.body[0];
    if (u?.kind !== "UseDecl") throw new Error();
    expect(u.selected).toEqual(["a", "b"]);
  });
});

describe("parse — dynamics", () => {
  it("\\mp before notes", () => {
    const c = parse(lex("\\mp 4 c4 d4"));
    expect(c.body[0]).toMatchObject({ kind: "Dynamic", value: "\\mp" });
  });
});

describe("parse — bars", () => {
  it("single", () => {
    const c = parse(lex("4 c4 | 4 d4"));
    expect(c.body.find((e) => e.kind === "Bar")).toBeDefined();
  });
  it("double", () => {
    const c = parse(lex("4 c4 || 4 d4"));
    expect(c.body.find((e) => e.kind === "Bar" && e.double)).toBeDefined();
  });
});

describe("parse — instrument define", () => {
  it("full", () => {
    const c = parse(
      lex(
        "instrument define warm { oscillator sawtooth envelope adsr(0.1, 0.1, 0.7, 0.3) detune 5 }",
      ),
    );
    const i = c.body[0];
    if (i?.kind !== "InstrumentDef") throw new Error();
    expect(i.name).toBe("warm");
    expect(i.fields).toHaveLength(3);
  });
});

describe("parse — errors", () => {
  it("missing pitch after duration", () => {
    expect(() => parse(lex("4 ,"))).toThrow(ParseError);
  });
  it("unclosed chord", () => {
    expect(() => parse(lex("4 <c4 e4"))).toThrow(ParseError);
  });
  it("missing rbrace", () => {
    expect(() => parse(lex("voice m { 4 c4"))).toThrow(ParseError);
  });
});

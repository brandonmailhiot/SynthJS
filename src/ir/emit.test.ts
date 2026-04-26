import { describe, expect, it } from "vitest";
import { lex } from "../lexer/lexer.js";
import { parse } from "../parser/parser.js";
import { expandRepeats } from "../semantic/expand-repeats.js";
import { lowerEffects } from "../semantic/lower-effects.js";
import { lowerPitch } from "../semantic/lower-pitch.js";
import { lowerSticky } from "../semantic/lower-sticky.js";
import { resolve } from "../semantic/resolve.js";
import { validateMeter } from "../semantic/validate-meter.js";
import { emitIR } from "./emit.js";

const compile = (src: string) => {
  const ast = parse(lex(src));
  const { symbolTable } = resolve(ast);
  let lowered = lowerSticky(ast).ast;
  lowered = lowerPitch(lowered, symbolTable).ast;
  lowered = expandRepeats(lowered);
  lowered = lowerEffects(lowered);
  const warnings = validateMeter(lowered);
  return emitIR(lowered, symbolTable, warnings);
};

describe("emit IR — basic", () => {
  it("4 c4 -> one main voice, one event, freq ~261.6, duration 0.25", () => {
    const ir = compile("4 c4");
    expect(ir.voices).toHaveLength(1);
    expect(ir.voices[0]?.name).toBe("main");
    const events = ir.voices[0]?.events;
    expect(events).toHaveLength(1);
    expect(events?.[0]?.frequencies[0]).toBeCloseTo(261.626, 1);
    expect(events?.[0]?.durationBeats).toBeCloseTo(0.25);
    expect(events?.[0]?.startBeat).toBe(0);
  });

  it("4 c4 d4 e4 f4 -> increasing startBeat", () => {
    const ir = compile("4 c4 d4 e4 f4");
    const events = ir.voices[0]?.events;
    expect(events).toHaveLength(4);
    expect(events?.[0]?.startBeat).toBe(0);
    expect(events?.[1]?.startBeat).toBeCloseTo(0.25);
    expect(events?.[2]?.startBeat).toBeCloseTo(0.5);
    expect(events?.[3]?.startBeat).toBeCloseTo(0.75);
  });

  it("\\tempo and \\time captured", () => {
    const ir = compile("\\tempo 120\n\\time 3/4\n4 c4");
    expect(ir.tempo).toBe(120);
    expect(ir.timeSig).toEqual({ numerator: 3, denominator: 4 });
  });

  it("default tempo=60 and time=4/4", () => {
    const ir = compile("4 c4");
    expect(ir.tempo).toBe(60);
    expect(ir.timeSig).toEqual({ numerator: 4, denominator: 4 });
  });
});

describe("emit IR — chord", () => {
  it("4 <c4 e4 g4> -> one event, three frequencies", () => {
    const ir = compile("4 <c4 e4 g4>");
    const ev = ir.voices[0]?.events[0];
    expect(ev?.frequencies).toHaveLength(3);
  });

  it("chord frequencies are in Hz", () => {
    const ir = compile("4 <c4 e4 g4>");
    const ev = ir.voices[0]?.events[0];
    expect(ev?.frequencies[0]).toBeCloseTo(261.626, 1); // c4
    expect(ev?.frequencies[1]).toBeCloseTo(329.628, 1); // e4
    expect(ev?.frequencies[2]).toBeCloseTo(391.995, 1); // g4
  });
});

describe("emit IR — voices", () => {
  it("two voices independent timelines", () => {
    const src = "voice bass { 4 c2 } voice melody { 4 c5 }";
    const ir = compile(src);
    expect(ir.voices).toHaveLength(2);
    expect(ir.voices.map((v) => v.name).sort()).toEqual(["bass", "melody"]);
  });

  it("main voice plus explicit voice", () => {
    const src = "4 c4\nvoice bass { 4 c2 }";
    const ir = compile(src);
    expect(ir.voices.map((v) => v.name).sort()).toEqual(["bass", "main"]);
  });

  it("each voice has its own independent startBeat sequence", () => {
    const src = "voice bass { 4 c2 4 d2 } voice melody { 4 c5 }";
    const ir = compile(src);
    const bass = ir.voices.find((v) => v.name === "bass");
    const melody = ir.voices.find((v) => v.name === "melody");
    expect(bass?.events[0]?.startBeat).toBe(0);
    expect(bass?.events[1]?.startBeat).toBeCloseTo(0.25);
    expect(melody?.events[0]?.startBeat).toBe(0);
  });
});

describe("emit IR — rest", () => {
  it("4 c4 4 r 4 d4 -> middle event has no frequencies", () => {
    const ir = compile("4 c4 4 r 4 d4");
    const events = ir.voices[0]?.events;
    expect(events?.[1]?.frequencies).toEqual([]);
  });

  it("rest still advances startBeat", () => {
    const ir = compile("4 c4 4 r 4 d4");
    const events = ir.voices[0]?.events;
    expect(events?.[2]?.startBeat).toBeCloseTo(0.5);
  });
});

describe("emit IR — slide", () => {
  it("2 e2 -> c3 emits source with slideTo", () => {
    const ir = compile("2 e2 -> c3");
    const events = ir.voices[0]?.events;
    expect(events?.[0]?.slideTo).toBeDefined();
    expect(events?.[0]?.slideTo).toHaveLength(1);
  });

  it("slide source has source pitch frequency", () => {
    const ir = compile("2 e2 -> c3");
    const events = ir.voices[0]?.events;
    expect(events?.[0]?.frequencies).toHaveLength(1);
    expect(events?.[0]?.frequencies[0]).toBeCloseTo(82.407, 1); // e2
  });
});

describe("emit IR — dynamics", () => {
  it("\\ff applies to following notes", () => {
    const ir = compile("\\ff 4 c4 d4");
    const events = ir.voices[0]?.events;
    expect(events?.[0]?.gain).toBeCloseTo(1.0);
    expect(events?.[1]?.gain).toBeCloseTo(1.0);
  });

  it("default gain is 0.65 (\\mf)", () => {
    const ir = compile("4 c4");
    const events = ir.voices[0]?.events;
    expect(events?.[0]?.gain).toBeCloseTo(0.65);
  });

  it("\\pp gives low gain", () => {
    const ir = compile("\\pp 4 c4");
    const events = ir.voices[0]?.events;
    expect(events?.[0]?.gain).toBeCloseTo(0.2);
  });
});

describe("emit IR — fx chain", () => {
  it("with reverb tags fx chain on event", () => {
    const ir = compile("with reverb(2, 1, 0.7) { 4 c4 }");
    const ev = ir.voices[0]?.events[0];
    expect(ev?.fxChain).toHaveLength(1);
    expect(ev?.fxChain[0]?.name).toBe("reverb");
    expect(ev?.fxChain[0]?.args.positional).toEqual([2, 1, 0.7]);
  });

  it("events without effects have empty fxChain", () => {
    const ir = compile("4 c4");
    const ev = ir.voices[0]?.events[0];
    expect(ev?.fxChain).toEqual([]);
  });
});

describe("emit IR — annotations", () => {
  it("@cue passes through to annotations", () => {
    const ir = compile('4 c4@cue("hit")');
    const ev = ir.voices[0]?.events[0];
    expect(ev?.annotations).toHaveLength(1);
    expect(ev?.annotations[0]?.name).toBe("@cue");
    expect(ev?.annotations[0]?.args).toEqual(["hit"]);
  });
});

describe("emit IR — instrument", () => {
  it("primitive oscillator", () => {
    const ir = compile("\\instrument sawtooth\n4 c4");
    const ev = ir.voices[0]?.events[0];
    expect(ev?.instrument.oscillators).toEqual([{ kind: "sawtooth" }]);
  });
  it("custom instrument expanded from definition", () => {
    const src =
      "instrument define warm { oscillator sawtooth envelope adsr(0.3, 0.4, 0.7, 1.2) detune 5 }\n\\instrument warm\n4 c4";
    const ir = compile(src);
    const ev = ir.voices[0]?.events[0];
    expect(ev?.instrument.oscillators).toEqual([{ kind: "sawtooth" }]);
    expect(ev?.instrument.detune).toBe(5);
    expect(ev?.instrument.envelope?.kind).toBe("adsr");
  });

  it("default instrument is sine", () => {
    const ir = compile("4 c4");
    const ev = ir.voices[0]?.events[0];
    expect(ev?.instrument.oscillators).toEqual([{ kind: "sine" }]);
  });

  it("multi-layer instrument with per-layer detune", () => {
    const src =
      "instrument define stack { oscillator sawtooth -7 oscillator sawtooth oscillator sawtooth 7 }\n\\instrument stack\n4 c4";
    const ir = compile(src);
    const ev = ir.voices[0]?.events[0];
    expect(ev?.instrument.oscillators).toEqual([
      { kind: "sawtooth", detune: -7 },
      { kind: "sawtooth" },
      { kind: "sawtooth", detune: 7 },
    ]);
  });

  it("pitch_sweep field captured in IR", () => {
    const src =
      "instrument define kick { oscillator sine pitch_sweep 12 0.05 envelope percussive(0.005, 0.4) }\n\\instrument kick\n4 c2";
    const ir = compile(src);
    const ev = ir.voices[0]?.events[0];
    expect(ev?.instrument.pitchSweep).toEqual({ semitones: 12, duration: 0.05 });
  });

  it("pitch_sweep with negative semitones (rising sweep)", () => {
    const src =
      "instrument define rise { oscillator sawtooth pitch_sweep -7 0.1 }\n\\instrument rise\n4 c4";
    const ir = compile(src);
    const ev = ir.voices[0]?.events[0];
    expect(ev?.instrument.pitchSweep).toEqual({ semitones: -7, duration: 0.1 });
  });

  it("sample oscillator captured in layer", () => {
    const src =
      'instrument define real_kick { oscillator sample("kick.wav") root c2 envelope percussive(0.001, 0.5) }\n\\instrument real_kick\n4 c2';
    const ir = compile(src);
    const ev = ir.voices[0]?.events[0];
    expect(ev?.instrument.oscillators[0]?.kind).toBe("sample");
    expect(ev?.instrument.oscillators[0]?.samplePath).toBe("kick.wav");
    expect(ev?.instrument.oscillators[0]?.rootHz).toBeCloseTo(65.406, 1); // c2
  });

  it("sample without root has undefined rootHz", () => {
    const src = 'instrument define hit { oscillator sample("crash.wav") }\n\\instrument hit\n4 c4';
    const ir = compile(src);
    const ev = ir.voices[0]?.events[0];
    expect(ev?.instrument.oscillators[0]?.kind).toBe("sample");
    expect(ev?.instrument.oscillators[0]?.rootHz).toBeUndefined();
  });

  it("gain field captured in IR", () => {
    const src = "instrument define loud { oscillator sine gain 2.5 }\n\\instrument loud\n4 c4";
    const ir = compile(src);
    const ev = ir.voices[0]?.events[0];
    expect(ev?.instrument.gain).toBe(2.5);
  });

  it("per-layer envelope captured into layer", () => {
    const src =
      "instrument define snare { oscillator triangle { envelope percussive(0.001, 0.05) } oscillator noise { envelope percussive(0.001, 0.005) } }\n\\instrument snare\n4 c4";
    const ir = compile(src);
    const ev = ir.voices[0]?.events[0];
    expect(ev?.instrument.oscillators).toEqual([
      { kind: "triangle", envelope: { kind: "percussive", args: [0.001, 0.05] } },
      { kind: "noise", envelope: { kind: "percussive", args: [0.001, 0.005] } },
    ]);
  });

  it("multi-filter instrument cascades in declared order", () => {
    const src =
      "instrument define chain { oscillator noise filter highpass(500, 0.7) filter bandpass(2000, 1.0) filter lowpass(8000, 0.7) }\n\\instrument chain\n4 c4";
    const ir = compile(src);
    const ev = ir.voices[0]?.events[0];
    expect(ev?.instrument.filters).toEqual([
      { type: "highpass", cutoff: 500, q: 0.7 },
      { type: "bandpass", cutoff: 2000, q: 1.0 },
      { type: "lowpass", cutoff: 8000, q: 0.7 },
    ]);
  });
});

describe("emit IR — diagnostics", () => {
  it("bar mismatch warning flows into diagnostics", () => {
    // 4/4 time but only 2 quarter notes before bar
    const ir = compile("\\time 4/4\n4 c4 d4 |");
    expect(ir.diagnostics.length).toBeGreaterThan(0);
    expect(ir.diagnostics[0]?.severity).toBe("warning");
  });

  it("no warnings for valid meter", () => {
    const ir = compile("\\time 4/4\n4 c4 d4 e4 f4 |");
    expect(ir.diagnostics).toHaveLength(0);
  });
});

describe("emit IR — annotated block", () => {
  it("@section block events emitted into voice timeline", () => {
    const ir = compile('@section("chorus") { 4 c4 d4 e4 }');
    const events = ir.voices[0]?.events;
    expect(events).toHaveLength(3);
  });

  it("annotated block startBeat is contiguous", () => {
    const ir = compile('@section("v") { 4 c4 d4 }');
    const events = ir.voices[0]?.events;
    expect(events).toHaveLength(2);
    expect(events?.[0]?.startBeat).toBe(0);
    expect(events?.[1]?.startBeat).toBeCloseTo(0.25);
  });
});

describe("emit IR — slide with destination duration", () => {
  it("slide with destination duration emits two events", () => {
    // When slide has duration on both source and destination: 4 c4 -> 4 d4
    const ir = compile("4 c4 -> 4 d4");
    const events = ir.voices[0]?.events;
    // Source event + destination event
    expect(events).toHaveLength(2);
    if (events?.[0]) expect(events[0].slideTo).toBeDefined();
    if (events?.[1]) expect(events[1].frequencies[0]).toBeCloseTo(293.664, 1); // d4
  });
});

describe("emit IR — fx named args", () => {
  it("named args in effect invocation are captured", () => {
    // delay with named args: delay(seconds: 0.3, feedback: 0.5)
    const ir = compile("with delay(seconds: 0.3, feedback: 0.5) { 4 c4 }");
    const ev = ir.voices[0]?.events[0];
    expect(ev?.fxChain[0]?.args.named).toBeDefined();
    expect(ev?.fxChain[0]?.args.named?.seconds).toBeCloseTo(0.3);
  });
});

import { describe, expect, it } from "vitest";
import type { CompositionIR, InstrumentSpec, TimelineEvent } from "../ir/nodes.js";
import { exportJson } from "./export-json.js";

const span = { start: 0, end: 0, line: 1, column: 1 };
const sineInstrument: InstrumentSpec = { name: "sine", oscillator: "sine" };

const noteEvent = (over: Partial<TimelineEvent> = {}): TimelineEvent => ({
  startBeat: 0,
  durationBeats: 0.25,
  frequencies: [440],
  gain: 0.65,
  articulation: [],
  fxChain: [],
  instrument: sineInstrument,
  annotations: [],
  span,
  ...over,
});

const emptyIR = (): CompositionIR => ({
  tempo: 120,
  timeSig: { numerator: 4, denominator: 4 },
  voices: [],
  diagnostics: [],
});

const irWithVoice = (): CompositionIR => ({
  tempo: 120,
  timeSig: { numerator: 4, denominator: 4 },
  voices: [{ name: "main", events: [noteEvent()] }],
  diagnostics: [],
});

describe("exportJson — empty IR", () => {
  it("serializes an empty IR (no voices)", () => {
    const result = exportJson(emptyIR());
    const parsed = JSON.parse(result) as CompositionIR;
    expect(parsed.tempo).toBe(120);
    expect(parsed.voices).toEqual([]);
    expect(parsed.diagnostics).toEqual([]);
  });
});

describe("exportJson — voice with events", () => {
  it("serializes IR with one voice including frequencies and gain", () => {
    const result = exportJson(irWithVoice());
    const parsed = JSON.parse(result) as CompositionIR;
    expect(parsed.voices).toHaveLength(1);
    const voice = parsed.voices[0];
    expect(voice).toBeDefined();
    expect(voice?.name).toBe("main");
    expect(voice?.events).toHaveLength(1);
    const event = voice?.events[0];
    expect(event).toBeDefined();
    expect(event?.frequencies).toEqual([440]);
    expect(event?.gain).toBe(0.65);
  });
});

describe("exportJson — spans", () => {
  it("omits spans by default", () => {
    const result = exportJson(irWithVoice());
    const parsed = JSON.parse(result) as Record<string, unknown>;
    const voices = parsed.voices as Array<{ events: Array<Record<string, unknown>> }>;
    const event = (voices[0]?.events ?? [])[0] as Record<string, unknown> | undefined;
    expect(event?.span).toBeUndefined();
  });

  it("preserves spans when includeSpans: true", () => {
    const result = exportJson(irWithVoice(), { includeSpans: true });
    const parsed = JSON.parse(result) as Record<string, unknown>;
    const voices = parsed.voices as Array<{ events: Array<Record<string, unknown>> }>;
    const event = (voices[0]?.events ?? [])[0] as Record<string, unknown> | undefined;
    expect(event?.span).toBeDefined();
  });
});

describe("exportJson — number precision", () => {
  it("rounds numbers to precision 6 by default (0.30000000000001 → 0.3)", () => {
    const ir = irWithVoice();
    const firstEvent = ir.voices[0]?.events[0];
    if (firstEvent) firstEvent.gain = 0.30000000000001;
    const result = exportJson(ir);
    const parsed = JSON.parse(result) as CompositionIR;
    expect(parsed.voices[0]?.events[0]?.gain).toBe(0.3);
  });
});

describe("exportJson — formatting", () => {
  it("pretty output has newlines and indentation (default pretty: true)", () => {
    const result = exportJson(emptyIR());
    expect(result).toContain("\n");
    expect(result).toContain("  ");
  });

  it("compact output with pretty: false has no newlines", () => {
    const result = exportJson(emptyIR(), { pretty: false });
    expect(result).not.toContain("\n");
  });
});

describe("exportJson — determinism", () => {
  it("produces identical output across multiple calls with the same input", () => {
    const ir = irWithVoice();
    const first = exportJson(ir);
    const second = exportJson(ir);
    const third = exportJson(ir);
    expect(first).toBe(second);
    expect(second).toBe(third);
  });
});

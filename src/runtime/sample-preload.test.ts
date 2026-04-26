import { describe, expect, it, vi } from "vitest";
import type { CompositionIR } from "../ir/nodes.js";
import { MockAudioContext } from "./mock-audio-context.js";
import { collectSamplePaths, preloadSamples } from "./sample-preload.js";

const span = { start: 0, end: 0, line: 1, column: 1 };

const irWith = (paths: (string | undefined)[]): CompositionIR => ({
  tempo: 60,
  timeSig: { numerator: 4, denominator: 4 },
  diagnostics: [],
  voices: [
    {
      name: "main",
      events: paths.map((p) => ({
        startBeat: 0,
        durationBeats: 0.25,
        frequencies: [440],
        gain: 0.65,
        articulation: [],
        fxChain: [],
        instrument: {
          name: "i",
          oscillators: [
            p === undefined
              ? { kind: "sine" as const }
              : { kind: "sample" as const, samplePath: p },
          ],
          filters: [],
        },
        annotations: [],
        span,
      })),
    },
  ],
});

describe("collectSamplePaths", () => {
  it("returns empty when no sample layers", () => {
    expect(collectSamplePaths(irWith([undefined, undefined]))).toEqual([]);
  });

  it("dedupes paths used multiple times", () => {
    expect(collectSamplePaths(irWith(["kick.wav", "snare.wav", "kick.wav"]))).toEqual([
      "kick.wav",
      "snare.wav",
    ]);
  });
});

describe("preloadSamples", () => {
  it("calls fetcher once per unique path and decodes each", async () => {
    const ctx = new MockAudioContext();
    const decodeSpy = vi.spyOn(ctx, "decodeAudioData");
    const fetcher = vi.fn(async (p: string) => new ArrayBuffer(8 + p.length));
    const buffers = await preloadSamples(
      irWith(["kick.wav", "snare.wav", "kick.wav"]),
      ctx,
      fetcher,
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(decodeSpy).toHaveBeenCalledTimes(2);
    expect(buffers.size).toBe(2);
    expect(buffers.has("kick.wav")).toBe(true);
    expect(buffers.has("snare.wav")).toBe(true);
  });

  it("returns empty map when IR has no sample layers", async () => {
    const ctx = new MockAudioContext();
    const fetcher = vi.fn();
    const buffers = await preloadSamples(irWith([undefined]), ctx, fetcher);
    expect(fetcher).not.toHaveBeenCalled();
    expect(buffers.size).toBe(0);
  });
});

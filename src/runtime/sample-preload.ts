import type { CompositionIR, OscillatorLayer } from "../ir/nodes.js";
import type { AudioBufferLike, AudioContextLike } from "./audio-context.js";

export type SampleBuffers = Map<string, AudioBufferLike>;

/** Walk the IR and collect every unique sample path referenced by any layer. */
export function collectSamplePaths(ir: CompositionIR): string[] {
  const paths = new Set<string>();
  for (const voice of ir.voices) {
    for (const event of voice.events) {
      for (const layer of event.instrument.oscillators) {
        if (layer.kind === "sample" && layer.samplePath !== undefined) {
          paths.add(layer.samplePath);
        }
      }
    }
  }
  return [...paths];
}

/** Fetcher signature: maps a sample path to the raw audio bytes. */
export type SampleFetcher = (path: string) => Promise<ArrayBuffer>;

/**
 * Default fetcher: uses the global `fetch` to resolve a path/URL to an
 * ArrayBuffer. Suitable for the browser; CLI/Node callers should pass their
 * own fetcher (e.g., one that reads from disk).
 */
export const defaultSampleFetcher: SampleFetcher = async (path) => {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to fetch sample '${path}': HTTP ${res.status}`);
  return await res.arrayBuffer();
};

/**
 * Resolve every sample path referenced by the IR into a decoded AudioBuffer.
 * Each path is fetched and decoded at most once. Returns an empty map when
 * the IR contains no sample layers (zero network/decode cost).
 */
export async function preloadSamples(
  ir: CompositionIR,
  ctx: AudioContextLike,
  fetcher: SampleFetcher = defaultSampleFetcher,
): Promise<SampleBuffers> {
  const paths = collectSamplePaths(ir);
  const buffers: SampleBuffers = new Map();
  await Promise.all(
    paths.map(async (path) => {
      const bytes = await fetcher(path);
      const buf = await ctx.decodeAudioData(bytes);
      buffers.set(path, buf);
    }),
  );
  return buffers;
}

// Re-exported for callers that want the type without importing the runtime.
export type { OscillatorLayer };

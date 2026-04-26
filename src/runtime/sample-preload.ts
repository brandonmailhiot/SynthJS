import type { CompositionIR, OscillatorLayer } from "../ir/nodes.js";
import { STDLIB_SAMPLES } from "../stdlib/samples-data.js";
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

const STDLIB_PREFIX = "@stdlib/samples/";

function decodeBase64DataUrl(url: string): ArrayBuffer {
  const comma = url.indexOf(",");
  if (comma < 0) throw new Error("malformed data URL");
  const b64 = url.slice(comma + 1);
  // Use Buffer in Node, atob in browsers — both are widely supported.
  if (typeof Buffer !== "undefined") {
    return Buffer.from(b64, "base64").buffer.slice(0);
  }
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/**
 * Default fetcher. Resolves `@stdlib/samples/<name>` virtual paths against
 * the bundled sample registry; falls back to global `fetch` for any other
 * URL or path. Browser callers get this for free; CLI/Node callers can pass
 * their own fetcher (e.g., one that reads from disk).
 */
export const defaultSampleFetcher: SampleFetcher = async (path) => {
  if (path.startsWith(STDLIB_PREFIX)) {
    const name = path.slice(STDLIB_PREFIX.length);
    const dataUrl = STDLIB_SAMPLES[name];
    if (dataUrl === undefined) {
      throw new Error(`Unknown stdlib sample '${name}'`);
    }
    return decodeBase64DataUrl(dataUrl);
  }
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

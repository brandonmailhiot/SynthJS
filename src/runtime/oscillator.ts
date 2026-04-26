import type { InstrumentSpec, OscillatorLayer } from "../ir/nodes.js";
import type {
  AudioBufferLike,
  AudioBufferSourceNodeLike,
  AudioContextLike,
  AudioNodeLike,
  AudioParamLike,
  GainNodeLike,
  OscillatorNodeLike,
} from "./audio-context.js";
import { buildEnvelope } from "./envelope.js";

/**
 * The runtime treats noise as a sound source that quacks like an oscillator
 * for start/stop purposes but ignores frequency. Stacked instruments may sum
 * multiple layers (any mix of pitched + noise) into a single rig. To keep the
 * rest of the runtime simple, we expose a unified `Sourceish` shape with
 * `start` and `stop` that fans out to every underlying node.
 */
export type Sourceish = {
  start(when?: number): void;
  stop(when?: number): void;
};

export type OscillatorRig = {
  source: Sourceish;
  output: AudioNodeLike;
  /** True when every layer is a noise source (slides become no-ops). */
  isNoise: boolean;
  /** Frequency params of all tonal layers. Empty when all-noise. */
  frequencies: AudioParamLike[];
};

// Cache the noise buffer per AudioContext so we don't regenerate 1 second of
// random samples for every note.
const noiseBufferCache = new WeakMap<AudioContextLike, AudioBufferLike>();

function getNoiseBuffer(ctx: AudioContextLike): AudioBufferLike {
  const cached = noiseBufferCache.get(ctx);
  if (cached) return cached;
  const length = Math.floor(ctx.sampleRate * 1.0); // 1 second of noise, looped
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  noiseBufferCache.set(ctx, buffer);
  return buffer;
}

type LayerNode = {
  source: Sourceish;
  output: AudioNodeLike;
  frequencyParam: AudioParamLike | null; // null for noise
};

/** Map from sample path -> decoded AudioBuffer. Populated by preloadSamples. */
export type SampleBuffers = Map<string, AudioBufferLike>;

function buildLayer(
  ctx: AudioContextLike,
  layer: OscillatorLayer,
  frequency: number,
  instrumentDetune: number,
  sampleBuffers: SampleBuffers,
): LayerNode {
  const totalDetune = instrumentDetune + (layer.detune ?? 0);
  if (layer.kind === "noise") {
    const node: AudioBufferSourceNodeLike = ctx.createBufferSource();
    node.buffer = getNoiseBuffer(ctx);
    node.loop = true;
    if (totalDetune !== 0) node.detune.setValueAtTime(totalDetune, 0);
    return { source: node, output: node, frequencyParam: null };
  }
  if (layer.kind === "sample") {
    const node: AudioBufferSourceNodeLike = ctx.createBufferSource();
    if (layer.samplePath !== undefined) {
      const buf = sampleBuffers.get(layer.samplePath);
      if (buf !== undefined) node.buffer = buf;
    }
    // playbackRate ratio = freq / rootHz; 1.0 if no root specified (drum-style)
    const rate = layer.rootHz !== undefined ? frequency / layer.rootHz : 1.0;
    node.playbackRate.value = rate;
    if (totalDetune !== 0) node.detune.setValueAtTime(totalDetune, 0);
    return { source: node, output: node, frequencyParam: null };
  }
  const osc: OscillatorNodeLike = ctx.createOscillator();
  osc.type = layer.kind;
  osc.frequency.value = frequency;
  if (totalDetune !== 0) osc.detune.setValueAtTime(totalDetune, 0);
  return { source: osc, output: osc, frequencyParam: osc.frequency };
}

export function buildOscillator(
  ctx: AudioContextLike,
  instrument: InstrumentSpec,
  frequency: number,
  audioStart = 0,
  playDuration = 1,
  sampleBuffers: SampleBuffers = new Map(),
): OscillatorRig {
  const layers = instrument.oscillators;
  const instrumentDetune = instrument.detune ?? 0;

  // Build each layer and sum into a single GainNode. Equal-power normalization
  // (1/sqrt(N)) keeps total amplitude roughly constant as users add layers.
  const summing: GainNodeLike = ctx.createGain();
  summing.gain.value = 1 / Math.sqrt(layers.length);

  const sources: Sourceish[] = [];
  const frequencies: AudioParamLike[] = [];
  for (const layer of layers) {
    const ln = buildLayer(ctx, layer, frequency, instrumentDetune, sampleBuffers);
    // Per-layer envelope wraps just this layer with peakGain=1.0 so the master
    // envelope (applied in voice-player) handles final amplitude. Multiplicative
    // when both are present.
    let layerOutput: AudioNodeLike = ln.output;
    if (layer.envelope !== undefined) {
      const env = buildEnvelope(ctx, layer.envelope, audioStart, playDuration, 1.0);
      layerOutput.connect(env.input);
      layerOutput = env.output;
    }
    layerOutput.connect(summing);
    sources.push(ln.source);
    if (ln.frequencyParam) frequencies.push(ln.frequencyParam);
  }

  const aggregate: Sourceish = {
    start: (when) => {
      for (const s of sources) s.start(when);
    },
    stop: (when) => {
      for (const s of sources) s.stop(when);
    },
  };

  const output = applyFilterChain(ctx, instrument, summing);
  // "isNoise" historically means: no tonal layer (slides become no-ops).
  // Sample layers also have no frequency param, so treat them the same.
  const isNoise = layers.every((l) => l.kind === "noise" || l.kind === "sample");
  return { source: aggregate, output, isNoise, frequencies };
}

function applyFilterChain(
  ctx: AudioContextLike,
  instrument: InstrumentSpec,
  source: AudioNodeLike,
): AudioNodeLike {
  let node = source;
  for (const spec of instrument.filters) {
    const filter = ctx.createBiquadFilter();
    if (
      spec.type === "lowpass" ||
      spec.type === "highpass" ||
      spec.type === "bandpass" ||
      spec.type === "notch"
    ) {
      filter.type = spec.type;
    }
    filter.frequency.value = spec.cutoff;
    filter.Q.value = spec.q;
    node.connect(filter);
    node = filter;
  }
  return node;
}

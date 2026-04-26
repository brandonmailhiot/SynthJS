import type { InstrumentSpec } from "../ir/nodes.js";
import type {
  AudioBufferLike,
  AudioBufferSourceNodeLike,
  AudioContextLike,
  AudioNodeLike,
  OscillatorNodeLike,
} from "./audio-context.js";

/**
 * The runtime treats noise as a sound source that quacks like an oscillator
 * for start/stop purposes but ignores frequency. To keep the rest of the
 * runtime simple, we expose a unified `SoundSource` shape with `start` and
 * `stop` methods. For sine/square/sawtooth/triangle, `source` is a real
 * `OscillatorNodeLike`. For noise, `source` is a `Sourceish` shim wrapping an
 * `AudioBufferSourceNode` so voice-player's start/stop dispatch is uniform.
 */
export type Sourceish = {
  start(when?: number): void;
  stop(when?: number): void;
};

export type OscillatorRig = {
  source: Sourceish;
  output: AudioNodeLike;
  /** True when this rig is a noise source (frequency setting is meaningless). */
  isNoise: boolean;
  /** The oscillator's frequency param for slides; null for noise. */
  frequency: OscillatorNodeLike["frequency"] | null;
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

export function buildOscillator(
  ctx: AudioContextLike,
  instrument: InstrumentSpec,
  frequency: number,
): OscillatorRig {
  if (instrument.oscillator === "noise") {
    return buildNoiseSource(ctx, instrument);
  }

  const osc = ctx.createOscillator();
  osc.type = instrument.oscillator;
  osc.frequency.value = frequency;
  if (instrument.detune !== undefined && instrument.detune !== 0) {
    osc.detune.setValueAtTime(instrument.detune, 0);
  }
  const output = applyInstrumentFilter(ctx, instrument, osc);
  return { source: osc, output, isNoise: false, frequency: osc.frequency };
}

function buildNoiseSource(ctx: AudioContextLike, instrument: InstrumentSpec): OscillatorRig {
  const node: AudioBufferSourceNodeLike = ctx.createBufferSource();
  node.buffer = getNoiseBuffer(ctx);
  node.loop = true;
  if (instrument.detune !== undefined && instrument.detune !== 0) {
    node.detune.setValueAtTime(instrument.detune, 0);
  }
  const output = applyInstrumentFilter(ctx, instrument, node);
  return { source: node, output, isNoise: true, frequency: null };
}

function applyInstrumentFilter(
  ctx: AudioContextLike,
  instrument: InstrumentSpec,
  source: AudioNodeLike,
): AudioNodeLike {
  if (!instrument.filter) return source;
  const filter = ctx.createBiquadFilter();
  const filterType = instrument.filter.type;
  if (
    filterType === "lowpass" ||
    filterType === "highpass" ||
    filterType === "bandpass" ||
    filterType === "notch"
  ) {
    filter.type = filterType;
  }
  filter.frequency.value = instrument.filter.cutoff;
  filter.Q.value = instrument.filter.q;
  source.connect(filter);
  return filter;
}

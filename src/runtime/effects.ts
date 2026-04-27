import type { EffectInvocation } from "../ir/nodes.js";
import type { AudioBufferLike, AudioContextLike, AudioNodeLike } from "./audio-context.js";

export const DEFAULT_EFFECT_ARGS = {
  gain: { level: 1.0 },
  reverb: { channels: 1, seconds: 1.0, decay: 0.5 },
  delay: { seconds: 0.25, feedback: 0.3 },
  filter: { type: "lowpass", cutoff: 1000, q: 1.0 },
  distortion: { amount: 0, oversample: "none" },
  chorus: { rate: 0.5, depth: 0.002, mix: 0.5 },
  compressor: { threshold: -24, ratio: 12, attack: 0.003, release: 0.25 },
} as const;

export type EffectNode = {
  input: AudioNodeLike;
  output: AudioNodeLike;
};

export function buildEffect(ctx: AudioContextLike, effect: EffectInvocation): EffectNode {
  switch (effect.name) {
    case "gain":
      return buildGain(ctx, effect);
    case "reverb":
      return buildReverb(ctx, effect);
    case "delay":
      return buildDelay(ctx, effect);
    case "filter":
      return buildFilter(ctx, effect);
    case "distortion":
      return buildDistortion(ctx, effect);
    case "chorus":
      return buildChorus(ctx, effect);
    case "compressor":
      return buildCompressor(ctx, effect);
    default:
      throw new Error(`unknown effect '${effect.name}' (should have been caught by Phase 2)`);
  }
}

function simpleNode(node: AudioNodeLike): EffectNode {
  return { input: node, output: node };
}

function arg(effect: EffectInvocation, idx: number, name: string): number | string | undefined {
  return effect.args.named?.[name] ?? effect.args.positional[idx];
}

function numArg(effect: EffectInvocation, idx: number, name: string, fallback: number): number {
  const a = arg(effect, idx, name);
  return typeof a === "number" ? a : fallback;
}

function strArg(effect: EffectInvocation, idx: number, name: string, fallback: string): string {
  const a = arg(effect, idx, name);
  return typeof a === "string" ? a : fallback;
}

function buildGain(ctx: AudioContextLike, e: EffectInvocation): EffectNode {
  const gain = ctx.createGain();
  gain.gain.value = numArg(e, 0, "level", DEFAULT_EFFECT_ARGS.gain.level);
  return simpleNode(gain);
}

// Cache reverb impulse responses per (ctx, channels, seconds, decay). Per-event
// `with reverb(...)` would otherwise regenerate the random IR for every note,
// blocking the main thread on busy compositions and starving the scheduler.
const reverbBufferCache = new WeakMap<AudioContextLike, Map<string, AudioBufferLike>>();

function getReverbBuffer(
  ctx: AudioContextLike,
  channels: number,
  seconds: number,
  decay: number,
): AudioBufferLike {
  let perCtx = reverbBufferCache.get(ctx);
  if (!perCtx) {
    perCtx = new Map();
    reverbBufferCache.set(ctx, perCtx);
  }
  const key = `${channels}|${seconds}|${decay}`;
  const cached = perCtx.get(key);
  if (cached) return cached;
  const buffer = createReverbBuffer(ctx, channels, seconds, decay);
  perCtx.set(key, buffer);
  return buffer;
}

function buildReverb(ctx: AudioContextLike, e: EffectInvocation): EffectNode {
  const channels = numArg(e, 0, "channels", DEFAULT_EFFECT_ARGS.reverb.channels);
  const seconds = numArg(e, 1, "seconds", DEFAULT_EFFECT_ARGS.reverb.seconds);
  const decay = numArg(e, 2, "decay", DEFAULT_EFFECT_ARGS.reverb.decay);
  const conv = ctx.createConvolver();
  conv.buffer = getReverbBuffer(ctx, channels, seconds, decay);
  return simpleNode(conv);
}

export function createReverbBuffer(
  ctx: AudioContextLike,
  channels: number,
  seconds: number,
  decay: number,
): AudioBufferLike {
  const rate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(rate * seconds));
  const buffer = ctx.createBuffer(channels, length, rate);
  const fadeIn = Math.min(Math.floor(rate * 0.005), Math.floor(length * 0.01));
  const safeDecay = Math.max(0.1, Math.min(10, decay));
  for (let c = 0; c < channels; c++) {
    const data = buffer.getChannelData(c);
    let prev = 0;
    for (let i = 0; i < length; i++) {
      const raw = Math.random() * 2 - 1;
      const sample = prev * 0.3 + raw * 0.7;
      prev = sample;
      const fade = i < fadeIn && fadeIn > 0 ? i / fadeIn : 1;
      const env = Math.exp((-safeDecay * i) / length);
      data[i] = sample * env * fade;
    }
  }
  return buffer;
}

function buildDelay(ctx: AudioContextLike, e: EffectInvocation): EffectNode {
  const seconds = numArg(e, 0, "seconds", DEFAULT_EFFECT_ARGS.delay.seconds);
  const feedback = numArg(e, 1, "feedback", DEFAULT_EFFECT_ARGS.delay.feedback);
  const delay = ctx.createDelay(Math.max(2, seconds + 0.1));
  delay.delayTime.value = seconds;
  // Feedback loop: delay.output → fb gain → delay.input
  const fb = ctx.createGain();
  fb.gain.value = feedback;
  delay.connect(fb);
  fb.connect(delay);
  return simpleNode(delay);
}

function buildFilter(ctx: AudioContextLike, e: EffectInvocation): EffectNode {
  const type = strArg(e, 0, "type", DEFAULT_EFFECT_ARGS.filter.type);
  const cutoff = numArg(e, 1, "cutoff", DEFAULT_EFFECT_ARGS.filter.cutoff);
  const q = numArg(e, 2, "q", DEFAULT_EFFECT_ARGS.filter.q);
  const filter = ctx.createBiquadFilter();
  if (type === "lowpass" || type === "highpass" || type === "bandpass" || type === "notch") {
    filter.type = type;
  }
  filter.frequency.value = cutoff;
  filter.Q.value = q;
  return simpleNode(filter);
}

function buildDistortion(ctx: AudioContextLike, e: EffectInvocation): EffectNode {
  const amount = numArg(e, 0, "amount", DEFAULT_EFFECT_ARGS.distortion.amount);
  const oversample = strArg(e, 1, "oversample", DEFAULT_EFFECT_ARGS.distortion.oversample);
  const ws = ctx.createWaveShaper();
  ws.curve = makeDistortionCurve(amount, ctx.sampleRate);
  if (oversample === "none" || oversample === "2x" || oversample === "4x") {
    ws.oversample = oversample;
  }
  return simpleNode(ws);
}

export function makeDistortionCurve(amount: number, samples = 44100): Float32Array {
  const n = Math.max(256, Math.floor(samples));
  const curve = new Float32Array(n);
  const deg = Math.PI / 180;
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}

function buildChorus(ctx: AudioContextLike, e: EffectInvocation): EffectNode {
  const rate = numArg(e, 0, "rate", DEFAULT_EFFECT_ARGS.chorus.rate);
  const depth = numArg(e, 1, "depth", DEFAULT_EFFECT_ARGS.chorus.depth);
  const mix = numArg(e, 2, "mix", DEFAULT_EFFECT_ARGS.chorus.mix);

  const input = ctx.createGain();
  const output = ctx.createGain();
  const dry = ctx.createGain();
  const wet = ctx.createGain();
  const delay = ctx.createDelay(0.05);
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();

  delay.delayTime.value = depth;
  lfo.frequency.value = rate;
  lfoGain.gain.value = depth;
  dry.gain.value = 1 - mix;
  wet.gain.value = mix;
  output.gain.value = 1;

  // input → dry → output
  input.connect(dry);
  dry.connect(output);
  // input → delay → wet → output
  input.connect(delay);
  delay.connect(wet);
  wet.connect(output);
  // LFO modulates delay
  lfo.connect(lfoGain);
  lfoGain.connect(delay);
  lfo.start(0);

  return { input, output };
}

function buildCompressor(ctx: AudioContextLike, e: EffectInvocation): EffectNode {
  const threshold = numArg(e, 0, "threshold", DEFAULT_EFFECT_ARGS.compressor.threshold);
  const ratio = numArg(e, 1, "ratio", DEFAULT_EFFECT_ARGS.compressor.ratio);
  const attack = numArg(e, 2, "attack", DEFAULT_EFFECT_ARGS.compressor.attack);
  const release = numArg(e, 3, "release", DEFAULT_EFFECT_ARGS.compressor.release);
  const c = ctx.createDynamicsCompressor();
  c.threshold.value = threshold;
  c.ratio.value = ratio;
  c.attack.value = attack;
  c.release.value = release;
  return simpleNode(c);
}

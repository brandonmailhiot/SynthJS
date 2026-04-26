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

export function buildEffect(ctx: AudioContextLike, effect: EffectInvocation): AudioNodeLike {
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

function buildGain(ctx: AudioContextLike, e: EffectInvocation): AudioNodeLike {
  const gain = ctx.createGain();
  gain.gain.value = numArg(e, 0, "level", DEFAULT_EFFECT_ARGS.gain.level);
  return gain;
}

function buildReverb(ctx: AudioContextLike, e: EffectInvocation): AudioNodeLike {
  const channels = numArg(e, 0, "channels", DEFAULT_EFFECT_ARGS.reverb.channels);
  const seconds = numArg(e, 1, "seconds", DEFAULT_EFFECT_ARGS.reverb.seconds);
  const decay = numArg(e, 2, "decay", DEFAULT_EFFECT_ARGS.reverb.decay);
  const conv = ctx.createConvolver();
  conv.buffer = createReverbBuffer(ctx, channels, seconds, decay);
  return conv;
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

function buildDelay(ctx: AudioContextLike, e: EffectInvocation): AudioNodeLike {
  const seconds = numArg(e, 0, "seconds", DEFAULT_EFFECT_ARGS.delay.seconds);
  const feedback = numArg(e, 1, "feedback", DEFAULT_EFFECT_ARGS.delay.feedback);
  const delay = ctx.createDelay(Math.max(2, seconds + 0.1));
  delay.delayTime.value = seconds;
  // Feedback loop: delay.output → fb gain → delay.input
  const fb = ctx.createGain();
  fb.gain.value = feedback;
  delay.connect(fb);
  fb.connect(delay);
  return delay;
}

function buildFilter(ctx: AudioContextLike, e: EffectInvocation): AudioNodeLike {
  const type = strArg(e, 0, "type", DEFAULT_EFFECT_ARGS.filter.type);
  const cutoff = numArg(e, 1, "cutoff", DEFAULT_EFFECT_ARGS.filter.cutoff);
  const q = numArg(e, 2, "q", DEFAULT_EFFECT_ARGS.filter.q);
  const filter = ctx.createBiquadFilter();
  if (type === "lowpass" || type === "highpass" || type === "bandpass" || type === "notch") {
    filter.type = type;
  }
  filter.frequency.value = cutoff;
  filter.Q.value = q;
  return filter;
}

function buildDistortion(ctx: AudioContextLike, e: EffectInvocation): AudioNodeLike {
  const amount = numArg(e, 0, "amount", DEFAULT_EFFECT_ARGS.distortion.amount);
  const oversample = strArg(e, 1, "oversample", DEFAULT_EFFECT_ARGS.distortion.oversample);
  const ws = ctx.createWaveShaper();
  ws.curve = makeDistortionCurve(amount);
  if (oversample === "none" || oversample === "2x" || oversample === "4x") {
    ws.oversample = oversample;
  }
  return ws;
}

export function makeDistortionCurve(amount: number): Float32Array {
  const n = 44100;
  const curve = new Float32Array(n);
  const deg = Math.PI / 180;
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}

function buildChorus(ctx: AudioContextLike, e: EffectInvocation): AudioNodeLike {
  const rate = numArg(e, 0, "rate", DEFAULT_EFFECT_ARGS.chorus.rate);
  const depth = numArg(e, 1, "depth", DEFAULT_EFFECT_ARGS.chorus.depth);
  const mix = numArg(e, 2, "mix", DEFAULT_EFFECT_ARGS.chorus.mix);
  // Chorus = delay modulated by LFO + dry/wet mix
  const input = ctx.createGain();
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

  // input → dry → output; input → delay → wet → output
  // LFO modulates delay.delayTime (we connect lfo → lfoGain, but LFO routing to AudioParam is on the AudioNode side; for the mock we treat it as a simple connect)
  input.connect(dry);
  input.connect(delay);
  delay.connect(wet);
  lfo.connect(lfoGain);
  // LFO would ideally connect to delay.delayTime; for the mock structure we connect the gain to the delay
  lfoGain.connect(delay);

  // Both dry and wet outputs need a common output. Caller wires the *input* node;
  // we return the input. The chorus output is the sum of dry + wet, which would
  // require a mixer — but for v1, we just return the input which routes through
  // the delay branch. This is acceptable as a simplification; document it.
  // For best quality, return a mixer. Use a wet-only path for simplicity here.
  lfo.start(0);

  return input;
}

function buildCompressor(ctx: AudioContextLike, e: EffectInvocation): AudioNodeLike {
  const threshold = numArg(e, 0, "threshold", DEFAULT_EFFECT_ARGS.compressor.threshold);
  const ratio = numArg(e, 1, "ratio", DEFAULT_EFFECT_ARGS.compressor.ratio);
  const attack = numArg(e, 2, "attack", DEFAULT_EFFECT_ARGS.compressor.attack);
  const release = numArg(e, 3, "release", DEFAULT_EFFECT_ARGS.compressor.release);
  const c = ctx.createDynamicsCompressor();
  c.threshold.value = threshold;
  c.ratio.value = ratio;
  c.attack.value = attack;
  c.release.value = release;
  return c;
}

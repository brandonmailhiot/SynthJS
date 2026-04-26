#!/usr/bin/env tsx
/**
 * Procedurally render the SynthJS 808-style drum kit to mono 44.1kHz WAV files
 * in `assets/samples/`. The output is original synthesis, owned by this
 * repository (effectively CC0). To swap in real recordings later, overwrite
 * the WAV files with audio of the same names — the encode step will pick up
 * whatever is on disk.
 *
 *   pnpm tsx scripts/render-default-samples.ts
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, "..", "assets", "samples");

const SR = 44100;
const TWO_PI = Math.PI * 2;

// ---------- DSP primitives ----------

function makeBuffer(seconds: number): Float32Array {
  return new Float32Array(Math.floor(SR * seconds));
}

function expDecay(t: number, tau: number): number {
  return Math.exp(-t / Math.max(1e-6, tau));
}

function pitchSweep(startHz: number, endHz: number, tau: number, t: number): number {
  // Exponential sweep from start to end; at t = ∞, value approaches end
  return endHz + (startHz - endHz) * expDecay(t, tau);
}

function whiteNoise(): number {
  return Math.random() * 2 - 1;
}

// One-pole highpass: y[n] = a*(y[n-1] + x[n] - x[n-1]); a = exp(-2*pi*fc/sr)
function makeHighpass(cutoffHz: number) {
  const a = Math.exp((-TWO_PI * cutoffHz) / SR);
  let xPrev = 0;
  let yPrev = 0;
  return (x: number) => {
    const y = a * (yPrev + x - xPrev);
    xPrev = x;
    yPrev = y;
    return y;
  };
}

// One-pole lowpass: y[n] = a*x[n] + (1-a)*y[n-1]; a depends on cutoff
function makeLowpass(cutoffHz: number) {
  const a = 1 - Math.exp((-TWO_PI * cutoffHz) / SR);
  let yPrev = 0;
  return (x: number) => {
    const y = a * x + (1 - a) * yPrev;
    yPrev = y;
    return y;
  };
}

// Direct-form biquad bandpass (constant skirt, peak gain = Q)
function makeBandpass(centerHz: number, q: number) {
  const w0 = (TWO_PI * centerHz) / SR;
  const cosw = Math.cos(w0);
  const sinw = Math.sin(w0);
  const alpha = sinw / (2 * q);
  const b0 = alpha;
  const b1 = 0;
  const b2 = -alpha;
  const a0 = 1 + alpha;
  const a1 = -2 * cosw;
  const a2 = 1 - alpha;
  const norm = 1 / a0;
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  return (x: number) => {
    const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) * norm;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    return y;
  };
}

function normalize(buf: Float32Array, peakDbfs = -3): void {
  let peak = 0;
  for (const s of buf) {
    const a = Math.abs(s);
    if (a > peak) peak = a;
  }
  if (peak === 0) return;
  const targetPeak = 10 ** (peakDbfs / 20);
  const gain = targetPeak / peak;
  for (let i = 0; i < buf.length; i++) buf[i] *= gain;
}

// ---------- Drum voice renderers ----------

function renderKick(): Float32Array {
  const buf = makeBuffer(0.6);
  const lp = makeLowpass(180);
  for (let i = 0; i < buf.length; i++) {
    const t = i / SR;
    const freq = pitchSweep(120, 50, 0.04, t);
    const phase = TWO_PI * freq * t;
    const env = expDecay(t, 0.18);
    const click = i < 80 ? whiteNoise() * 0.4 * (1 - i / 80) : 0;
    buf[i] = lp(Math.sin(phase) * env + click);
  }
  normalize(buf, -3);
  return buf;
}

function renderSnare(): Float32Array {
  const buf = makeBuffer(0.3);
  const bp = makeBandpass(1500, 1.0);
  for (let i = 0; i < buf.length; i++) {
    const t = i / SR;
    const body = Math.sin(TWO_PI * pitchSweep(220, 180, 0.02, t) * t);
    const wires = whiteNoise();
    const env = expDecay(t, 0.12);
    const sample = bp(body * 0.4 + wires * 0.6) * env;
    buf[i] = sample;
  }
  normalize(buf, -3);
  return buf;
}

function renderClap(): Float32Array {
  // Four staggered noise bursts, all bandpassed, last one with longer tail.
  const buf = makeBuffer(0.25);
  const bp = makeBandpass(1500, 2.0);
  const offsets = [0, 0.012, 0.024, 0.036];
  const decays = [0.005, 0.005, 0.005, 0.05];
  for (let i = 0; i < buf.length; i++) {
    const t = i / SR;
    let s = 0;
    for (let k = 0; k < 4; k++) {
      const offset = offsets[k] ?? 0;
      const decay = decays[k] ?? 0.005;
      const localT = t - offset;
      if (localT < 0) continue;
      s += whiteNoise() * expDecay(localT, decay);
    }
    buf[i] = bp(s);
  }
  normalize(buf, -3);
  return buf;
}

function renderHatClosed(): Float32Array {
  const buf = makeBuffer(0.04);
  const bp = makeBandpass(11000, 6);
  for (let i = 0; i < buf.length; i++) {
    const t = i / SR;
    const env = expDecay(t, 0.012);
    buf[i] = bp(whiteNoise()) * env;
  }
  normalize(buf, -3);
  return buf;
}

function renderHatOpen(): Float32Array {
  const buf = makeBuffer(0.4);
  const bp = makeBandpass(11000, 6);
  for (let i = 0; i < buf.length; i++) {
    const t = i / SR;
    const env = expDecay(t, 0.18);
    buf[i] = bp(whiteNoise()) * env;
  }
  normalize(buf, -3);
  return buf;
}

function renderTom(startHz: number, endHz: number, tau: number, len = 0.5): Float32Array {
  const buf = makeBuffer(len);
  const lp = makeLowpass(900);
  for (let i = 0; i < buf.length; i++) {
    const t = i / SR;
    const phase = TWO_PI * pitchSweep(startHz, endHz, tau, t) * t;
    const env = expDecay(t, 0.18);
    buf[i] = lp(Math.sin(phase) * env);
  }
  normalize(buf, -3);
  return buf;
}

function renderCowbell(): Float32Array {
  const buf = makeBuffer(0.4);
  const bp = makeBandpass(800, 2.0);
  // Two squares at canonical 540/800 Hz
  for (let i = 0; i < buf.length; i++) {
    const t = i / SR;
    const a = Math.sign(Math.sin(TWO_PI * 540 * t));
    const b = Math.sign(Math.sin(TWO_PI * 800 * t));
    const env = expDecay(t, 0.18);
    buf[i] = bp((a + b) * 0.5) * env;
  }
  normalize(buf, -3);
  return buf;
}

// ---------- WAV writer ----------

function writeWav(path: string, samples: Float32Array): void {
  const numSamples = samples.length;
  const dataBytes = numSamples * 2;
  const fileBytes = 44 + dataBytes;
  const buf = new ArrayBuffer(fileBytes);
  const view = new DataView(buf);
  let p = 0;
  const writeStr = (s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(p++, s.charCodeAt(i));
  };
  const writeU32 = (n: number) => {
    view.setUint32(p, n, true);
    p += 4;
  };
  const writeU16 = (n: number) => {
    view.setUint16(p, n, true);
    p += 2;
  };
  writeStr("RIFF");
  writeU32(fileBytes - 8);
  writeStr("WAVE");
  writeStr("fmt ");
  writeU32(16); // PCM chunk size
  writeU16(1); // PCM format
  writeU16(1); // mono
  writeU32(SR);
  writeU32(SR * 2); // byte rate (1ch * 2 bytes)
  writeU16(2); // block align
  writeU16(16); // bits per sample
  writeStr("data");
  writeU32(dataBytes);
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(p, Math.round(s * 32767), true);
    p += 2;
  }
  writeFileSync(path, Buffer.from(buf));
}

// ---------- Main ----------

const SAMPLES: Record<string, () => Float32Array> = {
  kick: renderKick,
  snare: renderSnare,
  clap: renderClap,
  hat_closed: renderHatClosed,
  hat_open: renderHatOpen,
  tom_low: () => renderTom(110, 60, 0.06, 0.55),
  tom_mid: () => renderTom(180, 90, 0.06, 0.45),
  tom_high: () => renderTom(260, 130, 0.05, 0.4),
  cowbell: renderCowbell,
};

mkdirSync(OUT_DIR, { recursive: true });

for (const [name, render] of Object.entries(SAMPLES)) {
  const samples = render();
  const path = resolve(OUT_DIR, `${name}.wav`);
  writeWav(path, samples);
  console.log(`wrote ${path} (${samples.length} samples / ${(samples.length / SR).toFixed(3)}s)`);
}

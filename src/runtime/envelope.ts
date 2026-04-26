import type { EnvelopeSpec } from "../ir/nodes.js";
import type { AudioContextLike, GainNodeLike } from "./audio-context.js";

export type EnvelopeRig = {
  input: GainNodeLike;
  output: GainNodeLike;
};

const DEFAULT_ADSR: EnvelopeSpec = {
  kind: "adsr",
  args: [0.005, 0.05, 1.0, 0.05],
};

export function buildEnvelope(
  ctx: AudioContextLike,
  envelope: EnvelopeSpec | undefined,
  startTime: number,
  durationSeconds: number,
  peakGain: number,
): EnvelopeRig {
  const gain = ctx.createGain();
  const spec = envelope ?? DEFAULT_ADSR;

  gain.gain.value = 0;
  gain.gain.setValueAtTime(0, startTime);

  if (spec.kind === "adsr") {
    const [attack, decay, sustain, release] = spec.args;
    const safeAttack = attack ?? 0.005;
    const safeDecay = decay ?? 0.05;
    const safeSustain = sustain ?? 1.0;
    const safeRelease = release ?? 0.05;
    const sustainGain = peakGain * safeSustain;

    // Attack ramps to peak; clip to durationSeconds if needed
    const attackEnd = Math.min(startTime + safeAttack, startTime + durationSeconds);
    gain.gain.linearRampToValueAtTime(peakGain, attackEnd);

    // Decay ramps to sustain level (only if attack didn't consume the whole duration)
    if (safeAttack < durationSeconds) {
      const decayEnd = Math.min(startTime + safeAttack + safeDecay, startTime + durationSeconds);
      gain.gain.linearRampToValueAtTime(sustainGain, decayEnd);
    }

    // Release
    const releaseStart = Math.max(startTime + durationSeconds - safeRelease, startTime);
    gain.gain.setValueAtTime(sustainGain, releaseStart);
    gain.gain.linearRampToValueAtTime(0, startTime + durationSeconds);
  } else if (spec.kind === "linear") {
    const [attack, release] = spec.args;
    const safeAttack = attack ?? 0.05;
    const safeRelease = release ?? 0.05;
    const attackEnd = Math.min(startTime + safeAttack, startTime + durationSeconds);
    gain.gain.linearRampToValueAtTime(peakGain, attackEnd);
    const releaseStart = Math.max(
      startTime + durationSeconds - safeRelease,
      startTime + safeAttack,
    );
    gain.gain.setValueAtTime(peakGain, releaseStart);
    gain.gain.linearRampToValueAtTime(0, startTime + durationSeconds);
  } else if (spec.kind === "percussive") {
    const [attack, decay] = spec.args;
    const safeAttack = attack ?? 0.005;
    const safeDecay = decay ?? 0.1;
    const attackEnd = Math.min(startTime + safeAttack, startTime + durationSeconds);
    gain.gain.linearRampToValueAtTime(peakGain, attackEnd);
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      Math.min(startTime + safeAttack + safeDecay, startTime + durationSeconds),
    );
    gain.gain.setValueAtTime(0, startTime + durationSeconds);
  }

  return { input: gain, output: gain };
}

import type { InstrumentSpec, TimelineEvent, VoiceTimeline } from "../ir/nodes.js";
import { applyArticulation } from "./articulation.js";
import type { AudioContextLike, AudioNodeLike } from "./audio-context.js";
import { buildEnvelope } from "./envelope.js";
import { buildFxChainNodes } from "./fx-chain.js";
import { type SampleBuffers, type Sourceish, buildOscillator } from "./oscillator.js";
import type { LookaheadScheduler } from "./scheduler.js";
import { applySlide } from "./slide.js";
import { beatsToSeconds } from "./time.js";

// Per-oscillator-type loudness compensation. Different waveforms have very
// different RMS / perceived loudness at the same peak amplitude:
//   sine     — pure tone, lowest energy
//   triangle — small odd harmonics, ~95% of sine
//   sawtooth — full harmonic series, much brighter and louder
//   square   — strongest odd harmonics, loudest of the four
//   noise    — full-spectrum random; very loud unless tightly band-limited
// These factors normalize the apparent volume so swapping `\instrument`
// doesn't change overall level.
const OSC_LOUDNESS: Record<string, number> = {
  sine: 1.0,
  triangle: 0.95,
  sawtooth: 0.55,
  square: 0.45,
  noise: 0.3,
};

// For stacked instruments: equal-power summing is already handled by the
// 1/sqrt(N) gain on the summing node in buildOscillator, so total perceived
// loudness ≈ loudness of a single layer of the dominant kind. We use the
// first layer's kind as the loudness reference.
function oscillatorLoudness(spec: InstrumentSpec): number {
  const first = spec.oscillators[0];
  if (!first) return 1.0;
  return OSC_LOUDNESS[first.kind] ?? 1.0;
}

export type VoicePlayerOptions = {
  ctx: AudioContextLike;
  voice: VoiceTimeline;
  tempo: number;
  voiceStartTime: number;
  voiceOutput: AudioNodeLike;
  scheduler: LookaheadScheduler;
  sampleBuffers?: SampleBuffers; // preloaded sample buffers keyed by path
  onCue?: (cue: { name: string; audioTime: number; event: TimelineEvent }) => void;
  random?: () => number; // injectable for tests; defaults to Math.random
};

export class VoicePlayer {
  private activeOscillators: Sourceish[] = [];
  private scheduledFlag = false;
  private eventTimeline: { audioStart: number; audioEnd: number; event: TimelineEvent }[] = [];

  constructor(private readonly opts: VoicePlayerOptions) {}

  schedule(): void {
    if (this.scheduledFlag) return;
    this.scheduledFlag = true;

    const { ctx, voice, tempo, voiceStartTime, voiceOutput, scheduler, onCue, random } = this.opts;
    const rng = random ?? Math.random;
    const sampleBuffers = this.opts.sampleBuffers;
    // Per-voice fxChain cache — events that share an identical fx spec route
    // through the same convolver/delay/etc. Without this, each event would
    // build a fresh ConvolverNode and impulse response, exploding node counts
    // on busy compositions and starving the audio thread.
    const fxChainCache = new Map<string, AudioNodeLike>();
    const getFxInput = (event: TimelineEvent): AudioNodeLike => {
      if (event.fxChain.length === 0) return voiceOutput;
      const key = JSON.stringify(event.fxChain);
      const cached = fxChainCache.get(key);
      if (cached) return cached;
      const built = buildFxChainNodes(ctx, event.fxChain);
      if (!built) return voiceOutput;
      built.output.connect(voiceOutput);
      fxChainCache.set(key, built.input);
      return built.input;
    };

    for (const event of voice.events) {
      // Apply @chance gate
      const chanceAnno = event.annotations.find((a) => a.name === "@chance");
      if (chanceAnno) {
        const p = chanceAnno.args[0];
        if (typeof p === "number" && rng() > p) continue;
      }

      const audioStart = voiceStartTime + beatsToSeconds(event.startBeat, tempo);
      const baseSeconds = beatsToSeconds(event.durationBeats, tempo);
      const { playDuration, gainBoost } = applyArticulation(event.articulation, baseSeconds);
      // Equal-power normalization across chord pitches so an N-note chord
      // doesn't sum to N× amplitude. 1-note event = no scaling. 4-note chord
      // = 0.5× per pitch.
      const pitchCount = Math.max(1, event.frequencies.length);
      const polyScale = 1 / Math.sqrt(pitchCount);
      const oscScale = oscillatorLoudness(event.instrument);
      // Per-instrument gain multiplier — lets users compensate for heavy
      // filtering or mix balance. Default 1.0. Applied AFTER the dynamics
      // clamp so values >1 can deliberately push past nominal headroom; the
      // master limiter on Composition catches any clipping.
      const userGain = event.instrument.gain ?? 1.0;
      const peakGain = Math.min(1.0, event.gain * gainBoost) * polyScale * oscScale * userGain;

      // Schedule oscillators (one per frequency). For noise sources we still
      // build one node per frequency entry so polyphony scaling is consistent;
      // frequency setting and slides are skipped since noise has no pitch.
      const oscillators: Sourceish[] = [];
      for (let i = 0; i < event.frequencies.length; i++) {
        const freq = event.frequencies[i];
        if (typeof freq !== "number") continue;
        const oscRig = buildOscillator(
          ctx,
          event.instrument,
          freq,
          audioStart,
          playDuration,
          sampleBuffers,
        );
        const envRig = buildEnvelope(ctx, event.envelope, audioStart, playDuration, peakGain);
        oscRig.output.connect(envRig.input);
        envRig.output.connect(getFxInput(event));
        // Slide? Only meaningful for tonal oscillators. With stacks, every
        // tonal layer slides in lockstep so detune offsets are preserved.
        const slideTarget = event.slideTo?.[i];
        if (slideTarget !== undefined) {
          for (const freqParam of oscRig.frequencies) {
            applySlide(freqParam, freq, slideTarget, audioStart, playDuration);
          }
        } else if (event.instrument.pitchSweep !== undefined) {
          // Pitch envelope: exponential sweep from start offset to nominal
          // pitch over `duration` seconds, on every tonal layer.
          const sweep = event.instrument.pitchSweep;
          const startFreq = freq * 2 ** (sweep.semitones / 12);
          const sweepEnd = Math.min(playDuration, sweep.duration);
          for (const freqParam of oscRig.frequencies) {
            freqParam.setValueAtTime(startFreq, audioStart);
            freqParam.exponentialRampToValueAtTime(freq, audioStart + sweepEnd);
          }
        }
        oscillators.push(oscRig.source);
      }

      // Track active oscillators for stop()
      this.activeOscillators.push(...oscillators);

      // Build timeline entry for currentEvent lookup
      this.eventTimeline.push({
        audioStart,
        audioEnd: audioStart + playDuration,
        event,
      });

      // Schedule start/stop via scheduler. Tail of 5 ms past play duration so
      // the envelope's release ramp finishes before the oscillator hard-stops
      // (prevents clicks at note boundaries).
      scheduler.enqueue({
        audioTime: audioStart,
        dispatch: (when) => {
          for (const osc of oscillators) {
            osc.start(when);
            osc.stop(when + playDuration + 0.005);
          }
        },
      });

      // @cue annotations: fire callback at audioStart
      const cueAnnos = event.annotations.filter((a) => a.name === "@cue");
      for (const cueAnno of cueAnnos) {
        const cueName = cueAnno.args[0];
        if (typeof cueName !== "string") continue;
        scheduler.enqueue({
          audioTime: audioStart,
          dispatch: (when) => {
            onCue?.({ name: cueName, audioTime: when, event });
          },
        });
      }
    }
  }

  stop(): void {
    for (const osc of this.activeOscillators) {
      try {
        osc.stop(this.opts.ctx.currentTime);
      } catch {
        // already stopped
      }
    }
    this.activeOscillators = [];
    this.eventTimeline = [];
  }

  get currentEvent(): TimelineEvent | null {
    const now = this.opts.ctx.currentTime;
    for (const entry of this.eventTimeline) {
      if (entry.audioStart <= now && now < entry.audioEnd) {
        return entry.event;
      }
    }
    return null;
  }
}

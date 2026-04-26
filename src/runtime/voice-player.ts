import type { TimelineEvent, VoiceTimeline } from "../ir/nodes.js";
import { applyArticulation } from "./articulation.js";
import type { AudioContextLike, AudioNodeLike, OscillatorNodeLike } from "./audio-context.js";
import { buildEnvelope } from "./envelope.js";
import { buildFxChain } from "./fx-chain.js";
import { buildOscillator } from "./oscillator.js";
import type { LookaheadScheduler } from "./scheduler.js";
import { applySlide } from "./slide.js";
import { beatsToSeconds } from "./time.js";

export type VoicePlayerOptions = {
  ctx: AudioContextLike;
  voice: VoiceTimeline;
  tempo: number;
  voiceStartTime: number;
  voiceOutput: AudioNodeLike;
  scheduler: LookaheadScheduler;
  onCue?: (cue: { name: string; audioTime: number; event: TimelineEvent }) => void;
  random?: () => number; // injectable for tests; defaults to Math.random
};

export class VoicePlayer {
  private activeOscillators: OscillatorNodeLike[] = [];
  private scheduledFlag = false;
  private currentEventRef: TimelineEvent | null = null;

  constructor(private readonly opts: VoicePlayerOptions) {}

  schedule(): void {
    if (this.scheduledFlag) return;
    this.scheduledFlag = true;

    const { ctx, voice, tempo, voiceStartTime, voiceOutput, scheduler, onCue, random } = this.opts;
    const rng = random ?? Math.random;

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
      const peakGain = Math.min(1.0, event.gain * gainBoost);

      // Schedule oscillators (one per frequency)
      const oscillators: OscillatorNodeLike[] = [];
      for (let i = 0; i < event.frequencies.length; i++) {
        const freq = event.frequencies[i];
        if (typeof freq !== "number") continue;
        const oscRig = buildOscillator(ctx, event.instrument, freq);
        const envRig = buildEnvelope(ctx, event.envelope, audioStart, playDuration, peakGain);
        oscRig.output.connect(envRig.input);
        const fxOut = buildFxChain(ctx, event.fxChain, envRig.output);
        fxOut.connect(voiceOutput);
        // Slide?
        const slideTarget = event.slideTo?.[i];
        if (slideTarget !== undefined) {
          applySlide(oscRig.source.frequency, freq, slideTarget, audioStart, playDuration);
        }
        oscillators.push(oscRig.source);
      }

      // Track active oscillators for stop()
      this.activeOscillators.push(...oscillators);

      // Schedule start/stop via scheduler
      scheduler.enqueue({
        audioTime: audioStart,
        dispatch: (when) => {
          for (const osc of oscillators) {
            osc.start(when);
            osc.stop(when + playDuration);
          }
          this.currentEventRef = event;
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
  }

  get currentEvent(): TimelineEvent | null {
    return this.currentEventRef;
  }
}

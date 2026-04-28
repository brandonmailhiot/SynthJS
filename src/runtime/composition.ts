import type { CompositionIR, Diagnostic, TimelineEvent } from "../ir/nodes.js";
import type { AudioContextLike, AudioNodeLike, GainNodeLike } from "./audio-context.js";
import { type SampleBuffers, type SampleFetcher, preloadSamples } from "./sample-preload.js";
import { LookaheadScheduler, type SchedulerOptions } from "./scheduler.js";
import { beatsToSeconds } from "./time.js";
import { VoicePlayer } from "./voice-player.js";

export type CompositionOptions = {
  audioContext?: AudioContextLike;
  scheduler?: SchedulerOptions;
  onCue?: (cue: { name: string; audioTime: number; event: TimelineEvent }) => void;
  random?: () => number;
  setTimeout?: (cb: () => void, ms: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
  sampleFetcher?: SampleFetcher; // override default fetch-based sample loader
};

export type CompositionState = "idle" | "playing" | "paused" | "stopped";

export class Composition {
  private readonly ctx: AudioContextLike;
  private readonly ownsContext: boolean;
  private readonly scheduler: LookaheadScheduler;
  private readonly players: VoicePlayer[] = [];
  private _state: CompositionState = "idle";
  private loopHandles: unknown[] = [];
  private readonly setTimeoutFn: (cb: () => void, ms: number) => unknown;
  private readonly clearTimeoutFn: (handle: unknown) => void;
  private endedListeners: ((info: { totalDurationSec: number }) => void)[] = [];
  private playStartTime = 0;
  private masterInput: AudioNodeLike | null = null;
  private sampleBuffers: SampleBuffers = new Map();
  private samplesLoaded = false;
  // Per-voice mute gates — a GainNode sits between every voice's output and
  // the master bus, so mute/solo flips a single param value with sample
  // accuracy. No IR swap, no schedule clear, no loop restart needed.
  private voiceGates: Map<string, GainNodeLike> = new Map();
  private voiceMuted: Set<string> = new Set();
  private voiceTrim: Map<string, number> = new Map();

  constructor(
    private readonly ir: CompositionIR,
    private readonly opts: CompositionOptions = {},
  ) {
    if (opts.audioContext) {
      this.ctx = opts.audioContext;
      this.ownsContext = false;
    } else {
      const Ctor = (globalThis as unknown as { AudioContext?: new () => AudioContextLike })
        .AudioContext;
      if (!Ctor) {
        throw new Error("No AudioContext available; pass one via CompositionOptions.audioContext");
      }
      this.ctx = new Ctor();
      this.ownsContext = true;
    }
    this.scheduler = new LookaheadScheduler(this.ctx, opts.scheduler);
    // Wrap globalThis.setTimeout/clearTimeout in arrow functions so call site
    // doesn't depend on `this` binding (browsers throw "Illegal invocation"
    // when invoked as detached methods).
    this.setTimeoutFn = opts.setTimeout ?? ((cb, ms) => globalThis.setTimeout(cb, ms));
    this.clearTimeoutFn = opts.clearTimeout ?? ((h) => globalThis.clearTimeout(h as number));
  }

  private computeCompositionDuration(): number {
    const tempo = this.ir.tempo;
    let max = 0;
    for (const voice of this.ir.voices) {
      for (const event of voice.events) {
        const end = beatsToSeconds(event.startBeat + event.durationBeats, tempo);
        if (end > max) max = end;
      }
    }
    return max;
  }

  /**
   * Build a per-Composition master output chain: headroom gain → soft limiter →
   * destination. Prevents inter-voice / inter-event clipping when many notes
   * sum at once. Created lazily and reused across loop iterations.
   *
   *   voice → masterInput (headroom 0.7) → compressor → destination
   */
  private getMasterInput(): AudioNodeLike {
    if (this.masterInput) return this.masterInput;
    const headroom = this.ctx.createGain();
    headroom.gain.value = 0.5;
    const limiter = this.ctx.createDynamicsCompressor();
    limiter.threshold.value = -6; // dB; engages well below 0 dBFS for smoother transients
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003; // 3 ms — fast enough to catch peaks, slow enough to avoid pumping
    limiter.release.value = 0.15;
    headroom.connect(limiter);
    limiter.connect(this.ctx.destination);
    this.masterInput = headroom;
    return headroom;
  }

  /**
   * Get or create the per-voice mute gate. Each voice routes through a
   * dedicated GainNode whose value is 1.0 when active and 0.0 when muted —
   * flipping `setVoiceMuted` is sample-accurate and never needs to
   * reschedule events.
   */
  private getVoiceGate(name: string): GainNodeLike {
    let gate = this.voiceGates.get(name);
    if (gate) return gate;
    gate = this.ctx.createGain();
    const initial = this.voiceMuted.has(name) ? 0 : (this.voiceTrim.get(name) ?? 1);
    gate.gain.value = initial;
    gate.connect(this.getMasterInput());
    this.voiceGates.set(name, gate);
    return gate;
  }

  private scheduleIteration(iterStartTime: number, fromBeat = 0): void {
    for (const voice of this.ir.voices) {
      const filteredVoice = {
        ...voice,
        events: voice.events.filter((e) => e.startBeat >= fromBeat),
      };
      const voiceOutput = this.ctx.createGain();
      voiceOutput.connect(this.getVoiceGate(voice.name));
      const player = new VoicePlayer({
        ctx: this.ctx,
        voice: filteredVoice,
        tempo: this.ir.tempo,
        voiceStartTime: iterStartTime,
        voiceOutput,
        scheduler: this.scheduler,
        sampleBuffers: this.sampleBuffers,
        ...(this.opts.onCue ? { onCue: this.opts.onCue } : {}),
        ...(this.opts.random ? { random: this.opts.random } : {}),
      });
      player.schedule();
      this.players.push(player);
    }
  }

  /**
   * Mute or unmute a voice in real time. Sample-accurate via the per-voice
   * gain gate; events keep firing on schedule but produce silence while the
   * gate is closed. Soloing in callers is "mute every voice that isn't in
   * the solo set" — implement at the call site.
   */
  setVoiceMuted(name: string, muted: boolean): void {
    if (muted) this.voiceMuted.add(name);
    else this.voiceMuted.delete(name);
    const gate = this.voiceGates.get(name);
    if (!gate) return; // nothing scheduled yet — gate will be created lazily
    const t = this.ctx.currentTime;
    gate.gain.cancelScheduledValues(t);
    const target = muted ? 0 : (this.voiceTrim.get(name) ?? 1);
    gate.gain.setValueAtTime(target, t);
  }

  /**
   * Continuous per-voice volume trim (0..1+). Combines with mute: while
   * muted, the gate stays at 0 even if trim changes. Stored separately so
   * unmute restores to the user's last trim value.
   */
  setVoiceVolume(name: string, volume: number): void {
    const v = Math.max(0, volume);
    this.voiceTrim.set(name, v);
    if (this.voiceMuted.has(name)) return;
    const gate = this.voiceGates.get(name);
    if (!gate) return;
    const t = this.ctx.currentTime;
    gate.gain.cancelScheduledValues(t);
    gate.gain.setValueAtTime(v, t);
  }

  /**
   * Convenience: pass a set of voice names that should remain audible.
   * When the set is empty, every voice is unmuted. Resolves all known
   * voices (those that have ever scheduled) plus any in `this.ir.voices`.
   */
  setSolo(soloNames: Set<string>): void {
    const allNames = new Set<string>([
      ...this.voiceGates.keys(),
      ...this.ir.voices.map((v) => v.name),
    ]);
    if (soloNames.size === 0) {
      for (const name of allNames) this.setVoiceMuted(name, false);
      return;
    }
    for (const name of allNames) {
      this.setVoiceMuted(name, !soloNames.has(name));
    }
  }

  async play(opts: { from?: number; loop?: boolean } = {}): Promise<void> {
    if (this._state === "playing") return;
    this._state = "playing";

    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }

    // Preload sample buffers on first play. Cached for the life of the
    // Composition so subsequent loops/replays don't re-fetch.
    if (!this.samplesLoaded) {
      this.sampleBuffers = await preloadSamples(this.ir, this.ctx, this.opts.sampleFetcher);
      this.samplesLoaded = true;
    }

    const startOffset = 0.05; // small lead time for setup
    const voiceStartTime = this.ctx.currentTime + startOffset;
    this.playStartTime = voiceStartTime;
    const fromBeat = opts.from ?? 0;

    this.scheduleIteration(voiceStartTime, fromBeat);
    this.scheduler.start();

    const duration = this.computeCompositionDuration();

    if (opts.loop) {
      let iter = 1;
      const armNext = () => {
        if (this._state !== "playing") return;
        this.scheduleIteration(voiceStartTime + iter * duration, 0);
        iter++;
        const handle = this.setTimeoutFn(armNext, Math.max(50, duration * 1000 - 100));
        this.loopHandles.push(handle);
      };
      // Arm the first re-schedule near the end of iteration 0
      const firstHandle = this.setTimeoutFn(armNext, Math.max(50, duration * 1000 - 100));
      this.loopHandles.push(firstHandle);
    } else {
      // Emit ended after the composition finishes
      const handle = this.setTimeoutFn(
        () => {
          if (this._state === "playing") {
            this._state = "stopped";
            this.emitEnded(duration);
          }
        },
        duration * 1000 + 50,
      );
      this.loopHandles.push(handle);
    }
  }

  async pause(): Promise<void> {
    if (this._state !== "playing") return;
    await this.ctx.suspend();
    this._state = "paused";
  }

  async resume(): Promise<void> {
    if (this._state !== "paused") return;
    await this.ctx.resume();
    this._state = "playing";
  }

  stop(): void {
    if (this._state !== "playing" && this._state !== "paused") return;
    for (const h of this.loopHandles) this.clearTimeoutFn(h);
    this.loopHandles = [];
    this.scheduler.stop();
    for (const player of this.players) player.stop();
    this.players.length = 0;
    this._state = "stopped";
  }

  async update(newIR: CompositionIR): Promise<void> {
    if (this._state !== "playing" && this._state !== "paused") {
      // Just swap; no need to reschedule
      (this as unknown as { ir: CompositionIR }).ir = newIR;
      return;
    }
    // Compute current beat from elapsed audio time
    const elapsedSec = this.ctx.currentTime - this.playStartTime;
    const tempo = this.ir.tempo;
    const currentBeat = elapsedSec / (4 * (60 / tempo));
    // Stop active players
    for (const player of this.players) player.stop();
    this.players.length = 0;
    // Swap IR (use unknown cast to bypass readonly)
    (this as unknown as { ir: CompositionIR }).ir = newIR;
    // Re-anchor: reschedule from the *new* IR starting at the current beat
    // (events with startBeat < currentBeat are skipped by scheduleIteration's filter)
    this.scheduleIteration(this.ctx.currentTime + 0.05, currentBeat);
  }

  onEnded(listener: (info: { totalDurationSec: number }) => void): () => void {
    this.endedListeners.push(listener);
    return () => {
      this.endedListeners = this.endedListeners.filter((l) => l !== listener);
    };
  }

  private emitEnded(totalDurationSec: number): void {
    for (const l of this.endedListeners) l({ totalDurationSec });
  }

  async destroy(): Promise<void> {
    this.stop();
    if (this.ownsContext) {
      await this.ctx.close();
    }
  }

  get state(): CompositionState {
    return this._state;
  }

  get diagnostics(): Diagnostic[] {
    return this.ir.diagnostics;
  }

  get currentEvent(): TimelineEvent | null {
    // Return the most recent active event from the main voice (or first voice)
    const main = this.players.find((p) => p.currentEvent !== null);
    return main ? main.currentEvent : null;
  }
}

import type { CompositionIR, Diagnostic, TimelineEvent } from "../ir/nodes.js";
import type { AudioContextLike } from "./audio-context.js";
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
    this.setTimeoutFn =
      opts.setTimeout ?? (globalThis.setTimeout as (cb: () => void, ms: number) => unknown);
    this.clearTimeoutFn =
      opts.clearTimeout ?? (globalThis.clearTimeout as (handle: unknown) => void);
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

  private scheduleIteration(iterStartTime: number, fromBeat = 0): void {
    const voiceOutput = this.ctx.createGain();
    voiceOutput.connect(this.ctx.destination);
    for (const voice of this.ir.voices) {
      const filteredVoice = {
        ...voice,
        events: voice.events.filter((e) => e.startBeat >= fromBeat),
      };
      const player = new VoicePlayer({
        ctx: this.ctx,
        voice: filteredVoice,
        tempo: this.ir.tempo,
        voiceStartTime: iterStartTime,
        voiceOutput,
        scheduler: this.scheduler,
        ...(this.opts.onCue ? { onCue: this.opts.onCue } : {}),
        ...(this.opts.random ? { random: this.opts.random } : {}),
      });
      player.schedule();
      this.players.push(player);
    }
  }

  async play(opts: { from?: number; loop?: boolean } = {}): Promise<void> {
    if (this._state === "playing") return;
    this._state = "playing";

    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }

    const startOffset = 0.05; // small lead time for setup
    const voiceStartTime = this.ctx.currentTime + startOffset;
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

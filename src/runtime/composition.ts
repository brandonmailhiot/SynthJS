import type { CompositionIR, Diagnostic, TimelineEvent } from "../ir/nodes.js";
import type { AudioContextLike } from "./audio-context.js";
import { LookaheadScheduler, type SchedulerOptions } from "./scheduler.js";
import { VoicePlayer } from "./voice-player.js";

export type CompositionOptions = {
  audioContext?: AudioContextLike;
  scheduler?: SchedulerOptions;
  onCue?: (cue: { name: string; audioTime: number; event: TimelineEvent }) => void;
  random?: () => number;
};

export type CompositionState = "idle" | "playing" | "stopped";

export class Composition {
  private readonly ctx: AudioContextLike;
  private readonly ownsContext: boolean;
  private readonly scheduler: LookaheadScheduler;
  private readonly players: VoicePlayer[] = [];
  private _state: CompositionState = "idle";

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

    const voiceOutput = this.ctx.createGain();
    voiceOutput.connect(this.ctx.destination);

    for (const voice of this.ir.voices) {
      // Filter events by `from`
      const filteredVoice = {
        ...voice,
        events: voice.events.filter((e) => e.startBeat >= fromBeat),
      };
      const player = new VoicePlayer({
        ctx: this.ctx,
        voice: filteredVoice,
        tempo: this.ir.tempo,
        voiceStartTime,
        voiceOutput,
        scheduler: this.scheduler,
        ...(this.opts.onCue ? { onCue: this.opts.onCue } : {}),
        ...(this.opts.random ? { random: this.opts.random } : {}),
      });
      player.schedule();
      this.players.push(player);
    }

    this.scheduler.start();
    // Loop and end-tracking are best-effort; the basic implementation simply
    // returns. A real `play()` could await all voices ending. For Phase 3 we
    // resolve immediately since lookahead scheduling is fire-and-forget.
  }

  stop(): void {
    if (this._state !== "playing") return;
    this.scheduler.stop();
    for (const player of this.players) player.stop();
    this.players.length = 0;
    this._state = "stopped";
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

import type { AudioContextLike } from "./audio-context.js";

export type SchedulerOptions = {
  lookaheadSeconds?: number; // default 0.025
  intervalMs?: number; // default 100
  setInterval?: (cb: () => void, ms: number) => unknown;
  clearInterval?: (handle: unknown) => void;
};

export type ScheduledEvent = {
  audioTime: number;
  dispatch: (audioTime: number) => void;
};

export class LookaheadScheduler {
  private queue: ScheduledEvent[] = [];
  private handle: unknown = null;
  private readonly lookahead: number;
  private readonly interval: number;
  private readonly setIntervalFn: (cb: () => void, ms: number) => unknown;
  private readonly clearIntervalFn: (handle: unknown) => void;

  constructor(
    private readonly ctx: AudioContextLike,
    opts: SchedulerOptions = {},
  ) {
    this.lookahead = opts.lookaheadSeconds ?? 0.025;
    this.interval = opts.intervalMs ?? 100;
    // Wrap globalThis.setInterval/clearInterval in arrow functions so the call
    // site doesn't depend on `this` binding (browsers throw "Illegal invocation"
    // when these are invoked as detached methods).
    this.setIntervalFn = opts.setInterval ?? ((cb, ms) => globalThis.setInterval(cb, ms));
    this.clearIntervalFn = opts.clearInterval ?? ((h) => globalThis.clearInterval(h as number));
  }

  enqueue(event: ScheduledEvent): void {
    // Insertion-sorted by audioTime
    const idx = this.queue.findIndex((e) => e.audioTime > event.audioTime);
    if (idx === -1) this.queue.push(event);
    else this.queue.splice(idx, 0, event);
  }

  start(): void {
    if (this.handle !== null) return;
    this.flush(this.ctx.currentTime);
    this.handle = this.setIntervalFn(() => this.flush(this.ctx.currentTime), this.interval);
  }

  stop(): void {
    if (this.handle !== null) {
      this.clearIntervalFn(this.handle);
      this.handle = null;
    }
  }

  /** Dispatch any events whose audioTime ≤ now + lookahead. Returns number dispatched. */
  flush(now: number): number {
    let dispatched = 0;
    while (this.queue.length > 0) {
      const next = this.queue[0];
      if (!next || next.audioTime > now + this.lookahead) break;
      this.queue.shift();
      next.dispatch(next.audioTime);
      dispatched += 1;
    }
    return dispatched;
  }

  get pendingCount(): number {
    return this.queue.length;
  }
}

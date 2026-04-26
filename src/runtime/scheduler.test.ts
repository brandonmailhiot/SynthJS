import { describe, expect, it, vi } from "vitest";
import { MockAudioContext } from "./mock-audio-context.js";
import { LookaheadScheduler } from "./scheduler.js";

describe("LookaheadScheduler", () => {
  it("dispatches events within lookahead window", () => {
    const ctx = new MockAudioContext();
    const sched = new LookaheadScheduler(ctx, { lookaheadSeconds: 0.05 });
    const fired: number[] = [];
    sched.enqueue({ audioTime: 0.01, dispatch: (t) => fired.push(t) });
    sched.enqueue({ audioTime: 0.04, dispatch: (t) => fired.push(t) });
    expect(sched.flush(0)).toBe(2);
    expect(fired).toEqual([0.01, 0.04]);
  });

  it("leaves events beyond lookahead", () => {
    const ctx = new MockAudioContext();
    const sched = new LookaheadScheduler(ctx, { lookaheadSeconds: 0.025 });
    sched.enqueue({ audioTime: 0.5, dispatch: () => {} });
    expect(sched.flush(0)).toBe(0);
    expect(sched.pendingCount).toBe(1);
  });

  it("dispatches as time advances across multiple flushes", () => {
    const ctx = new MockAudioContext();
    const sched = new LookaheadScheduler(ctx, { lookaheadSeconds: 0.025 });
    const fired: number[] = [];
    sched.enqueue({ audioTime: 0.01, dispatch: (t) => fired.push(t) });
    sched.enqueue({ audioTime: 0.5, dispatch: (t) => fired.push(t) });
    sched.enqueue({ audioTime: 1.0, dispatch: (t) => fired.push(t) });
    expect(sched.flush(0)).toBe(1);
    expect(sched.flush(0.49)).toBe(1);
    expect(sched.flush(1.0)).toBe(1);
    expect(fired).toEqual([0.01, 0.5, 1.0]);
  });

  it("preserves FIFO order at same audioTime", () => {
    const ctx = new MockAudioContext();
    const sched = new LookaheadScheduler(ctx, { lookaheadSeconds: 1 });
    const order: string[] = [];
    sched.enqueue({ audioTime: 0.5, dispatch: () => order.push("a") });
    sched.enqueue({ audioTime: 0.5, dispatch: () => order.push("b") });
    sched.enqueue({ audioTime: 0.5, dispatch: () => order.push("c") });
    sched.flush(1);
    expect(order).toEqual(["a", "b", "c"]);
  });

  it("enqueue maintains sort by audioTime", () => {
    const ctx = new MockAudioContext();
    const sched = new LookaheadScheduler(ctx, { lookaheadSeconds: 10 });
    const order: number[] = [];
    sched.enqueue({ audioTime: 0.5, dispatch: (t) => order.push(t) });
    sched.enqueue({ audioTime: 0.1, dispatch: (t) => order.push(t) });
    sched.enqueue({ audioTime: 0.3, dispatch: (t) => order.push(t) });
    sched.flush(10);
    expect(order).toEqual([0.1, 0.3, 0.5]);
  });

  it("start kicks off interval that flushes", () => {
    const ctx = new MockAudioContext();
    let intervalCb: (() => void) | null = null;
    const sched = new LookaheadScheduler(ctx, {
      lookaheadSeconds: 0.025,
      setInterval: (cb) => {
        intervalCb = cb;
        return 1;
      },
      clearInterval: () => {},
    });
    const fired: number[] = [];
    sched.enqueue({ audioTime: 0.01, dispatch: (t) => fired.push(t) });
    sched.start();
    expect(fired).toEqual([0.01]);
    ctx.currentTime = 0.5;
    sched.enqueue({ audioTime: 0.5, dispatch: (t) => fired.push(t) });
    (intervalCb as (() => void) | null)?.();
    expect(fired).toEqual([0.01, 0.5]);
  });

  it("stop halts interval", () => {
    const ctx = new MockAudioContext();
    const cleared = vi.fn();
    const sched = new LookaheadScheduler(ctx, {
      setInterval: () => 42,
      clearInterval: cleared,
    });
    sched.start();
    sched.stop();
    expect(cleared).toHaveBeenCalledWith(42);
  });

  it("stop is idempotent (clearInterval not double-called)", () => {
    const ctx = new MockAudioContext();
    const cleared = vi.fn();
    const sched = new LookaheadScheduler(ctx, {
      setInterval: () => 42,
      clearInterval: cleared,
    });
    sched.start();
    sched.stop();
    sched.stop();
    expect(cleared).toHaveBeenCalledTimes(1);
  });
});

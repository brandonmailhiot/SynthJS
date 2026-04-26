import type { CompositionIR, TimelineEvent, VoiceTimeline } from "../ir/nodes.js";

export type IsolateOptions = {
  /** Keep only voices whose name appears in this list. Omit to keep all. */
  voices?: string[];
  /** Inclusive [fromLine, toLine] range. Events whose span.line falls outside
   *  are dropped. Surviving events are rebased so the earliest startBeat is 0
   *  (so a soloed snippet plays immediately rather than at its original
   *  position in the composition). */
  lineRange?: [number, number];
};

/**
 * Return a new `CompositionIR` containing only the voices/events selected by
 * `opts`. Useful for debugging — solo a voice, isolate a few lines, etc.
 *
 * The original `ir` is not mutated.
 */
export function isolateIR(ir: CompositionIR, opts: IsolateOptions = {}): CompositionIR {
  let voices = ir.voices;

  if (opts.voices) {
    const wanted = new Set(opts.voices);
    voices = voices.filter((v) => wanted.has(v.name));
  }

  if (opts.lineRange) {
    const [fromLine, toLine] = opts.lineRange;
    voices = voices
      .map((v): VoiceTimeline => {
        const events = v.events.filter((e) => e.span.line >= fromLine && e.span.line <= toLine);
        if (events.length === 0) return { ...v, events: [] };
        let minStart = Number.POSITIVE_INFINITY;
        for (const e of events) {
          if (e.startBeat < minStart) minStart = e.startBeat;
        }
        const rebased: TimelineEvent[] = events.map((e) => ({
          ...e,
          startBeat: e.startBeat - minStart,
        }));
        return { ...v, events: rebased };
      })
      .filter((v) => v.events.length > 0);
  }

  return { ...ir, voices };
}

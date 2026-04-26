import type {
  Block,
  Call,
  ChordEvent,
  Composition,
  Event,
  NoteEvent,
  RestEvent,
  SlideEvent,
  TopLevel,
} from "../ast/nodes.js";

// ---- Dynamic mapping ----

const DYNAMIC_GAIN: Record<string, number> = {
  "\\pp": 0.2,
  "\\p": 0.35,
  "\\mp": 0.5,
  "\\mf": 0.65,
  "\\f": 0.8,
  "\\ff": 1.0,
  "\\fff": 1.0,
};

// ---- Lowering context ----

type LowerContext = {
  /** Effects chain: inner effects at index 0, outer effects at the end. */
  fxChain: Call[];
  /** Current envelope (inner overrides outer). */
  envelope: Call | undefined;
  /** Multiplicative duration scale (product of nested tuplet scales). */
  durationScale: number;
  /** Override effectiveDynamic for the current event (set by ramp). */
  dynamicOverride: number | undefined;
};

function emptyContext(): LowerContext {
  return {
    fxChain: [],
    envelope: undefined,
    durationScale: 1.0,
    dynamicOverride: undefined,
  };
}

// ---- Public API ----

/**
 * Lower scoped effect/envelope/tuplet/ramp blocks to per-event metadata.
 *
 * After this pass:
 * - WithExpr, EnvelopeExpr, TupletExpr, RampExpr nodes are removed.
 * - Their inner events bubble up to the parent block, tagged with metadata.
 *
 * Pure AST→AST transform. Returns a new Composition.
 */
export function lowerEffects(ast: Composition): Composition {
  const ctx = emptyContext();
  return {
    ...ast,
    body: lowerTopLevelList(ast.body, ctx),
  };
}

// ---- Top-level list walker ----

function lowerTopLevelList(body: TopLevel[], ctx: LowerContext): TopLevel[] {
  const result: TopLevel[] = [];
  for (const node of body) {
    result.push(...lowerTopLevel(node, ctx));
  }
  return result;
}

function lowerTopLevel(node: TopLevel, ctx: LowerContext): TopLevel[] {
  switch (node.kind) {
    case "VoiceDecl":
      return [
        {
          ...node,
          body: lowerBlock(node.body, ctx),
        },
      ];

    case "Binding":
      if (node.body.kind === "Block") {
        return [{ ...node, body: lowerBlock(node.body, ctx) }];
      }
      // EventList body: lower events in list
      return [
        {
          ...node,
          body: {
            ...node.body,
            events: lowerEventListFlat(node.body.events, ctx),
          },
        },
      ];

    default:
      if (isEvent(node)) {
        return lowerEvent(node as Event, ctx);
      }
      return [node];
  }
}

// ---- Block ----

function lowerBlock(block: Block, ctx: LowerContext): Block {
  return {
    ...block,
    body: lowerTopLevelList(block.body, ctx),
  };
}

// ---- Event list (flat splice) ----

function lowerEventListFlat(events: Event[], ctx: LowerContext): Event[] {
  const result: Event[] = [];
  for (const ev of events) {
    result.push(...lowerEvent(ev, ctx));
  }
  return result;
}

// ---- Single event ----

function lowerEvent(event: Event, ctx: LowerContext): Event[] {
  switch (event.kind) {
    // ---- Wrapper nodes: flatten into parent ----

    case "With": {
      // inner effects prepend (closer to oscillator), outer effects follow
      const newFxChain: Call[] = [...event.effects, ...ctx.fxChain];
      const innerCtx: LowerContext = { ...ctx, fxChain: newFxChain };
      return lowerTopLevelList(event.body.body, innerCtx) as Event[];
    }

    case "Envelope": {
      // inner envelope overrides outer
      const innerCtx: LowerContext = { ...ctx, envelope: event.call };
      return lowerTopLevelList(event.body.body, innerCtx) as Event[];
    }

    case "Tuplet": {
      // scale = M / N (default M = N - 1 for standard tuplet)
      const n = event.n;
      const m = event.m ?? n - 1;
      const scale = m / n;
      const innerCtx: LowerContext = { ...ctx, durationScale: ctx.durationScale * scale };
      return lowerTopLevelList(event.body.body, innerCtx) as Event[];
    }

    case "Ramp": {
      const fromGain = DYNAMIC_GAIN[event.from] ?? 0.65;
      const toGain = DYNAMIC_GAIN[event.to] ?? 0.65;
      // Count audible events at top level of the ramp body (not recursing into nested wrappers)
      const count = countAudibleEvents(event.body.body);
      // Lower each child, assigning the interpolated dynamic override per audible event
      return lowerRampBody(event.body.body, ctx, fromGain, toGain, count);
    }

    // ---- Passthrough block-bearing nodes ----

    case "Repeat":
      return [{ ...event, body: lowerBlock(event.body, ctx) }];

    case "Annotated": {
      const lowered = lowerEvent(event.target, ctx);
      // If the inner event flattened to multiple, wrap each one in annotations
      return lowered.map((inner) => ({
        ...event,
        target: inner as typeof event.target,
      }));
    }

    case "AnnotatedBlock":
      return [{ ...event, target: lowerBlock(event.target, ctx) }];

    // ---- Leaf events: tag with context ----

    case "Note":
      return [tagNote(event, ctx)];

    case "Chord":
      return [tagChord(event, ctx)];

    case "Rest":
      return [tagRest(event, ctx)];

    case "Slide":
      return [tagSlide(event, ctx)];

    // ---- Non-audible events: pass through ----
    default:
      return [event];
  }
}

// ---- Ramp body lowering ----

/**
 * Count audible events (Note/Chord/Rest/Slide) at the top-level of a body,
 * not recursing into nested wrappers (each wrapper counts as a single unit for
 * outer ramp interpolation, but we treat each emitted leaf individually).
 *
 * For ramp purposes, we count the events that will eventually be tagged —
 * we need to traverse into wrappers to count leaves.
 */
function countAudibleEvents(body: TopLevel[]): number {
  let count = 0;
  for (const node of body) {
    count += countAudibleInTopLevel(node);
  }
  return count;
}

function countAudibleInTopLevel(node: TopLevel): number {
  switch (node.kind) {
    case "Note":
    case "Chord":
    case "Rest":
    case "Slide":
      return 1;
    case "With":
    case "Envelope":
    case "Tuplet":
    case "Ramp":
    case "Repeat":
      return countAudibleEvents(node.body.body);
    case "Annotated":
      return countAudibleInTopLevel(node.target as TopLevel);
    case "AnnotatedBlock":
      return countAudibleEvents(node.target.body);
    case "VoiceDecl":
      return countAudibleEvents(node.body.body);
    case "Binding":
      if (node.body.kind === "Block") return countAudibleEvents(node.body.body);
      return node.body.events.filter(
        (e) => e.kind === "Note" || e.kind === "Chord" || e.kind === "Rest" || e.kind === "Slide",
      ).length;
    default:
      return 0;
  }
}

/**
 * Lower a ramp body, assigning per-event dynamic overrides via linear interpolation.
 */
function lowerRampBody(
  body: TopLevel[],
  ctx: LowerContext,
  fromGain: number,
  toGain: number,
  totalCount: number,
): Event[] {
  const result: Event[] = [];
  // Use a mutable counter to assign sequential indices across all events
  const state = { index: 0, total: totalCount };
  for (const node of body) {
    result.push(...lowerRampTopLevel(node, ctx, fromGain, toGain, state));
  }
  return result;
}

function interpolateDynamic(from: number, to: number, i: number, total: number): number {
  if (total <= 1) return from;
  return from + (to - from) * (i / (total - 1));
}

function lowerRampTopLevel(
  node: TopLevel,
  ctx: LowerContext,
  fromGain: number,
  toGain: number,
  state: { index: number; total: number },
): Event[] {
  if (!isEvent(node)) return [node as Event];

  return lowerRampEvent(node as Event, ctx, fromGain, toGain, state);
}

function lowerRampEvent(
  event: Event,
  ctx: LowerContext,
  fromGain: number,
  toGain: number,
  state: { index: number; total: number },
): Event[] {
  switch (event.kind) {
    case "Note":
    case "Chord":
    case "Rest":
    case "Slide": {
      const dynamic = interpolateDynamic(fromGain, toGain, state.index, state.total);
      state.index += 1;
      const innerCtx: LowerContext = { ...ctx, dynamicOverride: dynamic };
      return lowerEvent(event, innerCtx);
    }

    // Wrapper nodes: recurse into them while advancing ramp index
    case "With": {
      const newFxChain: Call[] = [...event.effects, ...ctx.fxChain];
      const innerCtx: LowerContext = { ...ctx, fxChain: newFxChain };
      const result: Event[] = [];
      for (const child of event.body.body) {
        result.push(...lowerRampTopLevel(child, innerCtx, fromGain, toGain, state));
      }
      return result;
    }

    case "Envelope": {
      const innerCtx: LowerContext = { ...ctx, envelope: event.call };
      const result: Event[] = [];
      for (const child of event.body.body) {
        result.push(...lowerRampTopLevel(child, innerCtx, fromGain, toGain, state));
      }
      return result;
    }

    case "Tuplet": {
      const n = event.n;
      const m = event.m ?? n - 1;
      const scale = m / n;
      const innerCtx: LowerContext = { ...ctx, durationScale: ctx.durationScale * scale };
      const result: Event[] = [];
      for (const child of event.body.body) {
        result.push(...lowerRampTopLevel(child, innerCtx, fromGain, toGain, state));
      }
      return result;
    }

    case "Ramp": {
      // Nested ramp: inner ramp overrides dynamics for its own events
      // Count inner events, then process with inner ramp's own interpolation
      const innerFromGain = DYNAMIC_GAIN[event.from] ?? 0.65;
      const innerToGain = DYNAMIC_GAIN[event.to] ?? 0.65;
      const innerCount = countAudibleEvents(event.body.body);
      // We need to advance the outer state.index by innerCount positions
      const innerState = { index: 0, total: innerCount };
      const result: Event[] = [];
      for (const child of event.body.body) {
        result.push(...lowerRampTopLevel(child, ctx, innerFromGain, innerToGain, innerState));
      }
      state.index += innerCount;
      return result;
    }

    case "Repeat": {
      const result: Event[] = [];
      for (const child of event.body.body) {
        result.push(...lowerRampTopLevel(child, ctx, fromGain, toGain, state));
      }
      return result;
    }

    case "Annotated": {
      const lowered = lowerRampEvent(event.target, ctx, fromGain, toGain, state);
      return lowered.map((inner) => ({
        ...event,
        target: inner as typeof event.target,
      }));
    }

    case "AnnotatedBlock": {
      const result: Event[] = [];
      for (const child of event.target.body) {
        result.push(...lowerRampTopLevel(child, ctx, fromGain, toGain, state));
      }
      return result;
    }

    default:
      return [event];
  }
}

// ---- Tag leaf events ----

function tagNote(note: NoteEvent, ctx: LowerContext): NoteEvent {
  const tagged: NoteEvent = { ...note };
  if (ctx.fxChain.length > 0) tagged.fxChain = ctx.fxChain;
  if (ctx.envelope !== undefined) tagged.envelope = ctx.envelope;
  if (ctx.durationScale !== 1.0) tagged.durationScale = ctx.durationScale;
  if (ctx.dynamicOverride !== undefined) tagged.effectiveDynamic = ctx.dynamicOverride;
  return tagged;
}

function tagChord(chord: ChordEvent, ctx: LowerContext): ChordEvent {
  const tagged: ChordEvent = { ...chord };
  if (ctx.fxChain.length > 0) tagged.fxChain = ctx.fxChain;
  if (ctx.envelope !== undefined) tagged.envelope = ctx.envelope;
  if (ctx.durationScale !== 1.0) tagged.durationScale = ctx.durationScale;
  if (ctx.dynamicOverride !== undefined) tagged.effectiveDynamic = ctx.dynamicOverride;
  return tagged;
}

function tagRest(rest: RestEvent, ctx: LowerContext): RestEvent {
  const tagged: RestEvent = { ...rest };
  if (ctx.fxChain.length > 0) tagged.fxChain = ctx.fxChain;
  if (ctx.envelope !== undefined) tagged.envelope = ctx.envelope;
  if (ctx.durationScale !== 1.0) tagged.durationScale = ctx.durationScale;
  if (ctx.dynamicOverride !== undefined) tagged.effectiveDynamic = ctx.dynamicOverride;
  return tagged;
}

function tagSlide(slide: SlideEvent, ctx: LowerContext): SlideEvent {
  const tagged: SlideEvent = { ...slide };
  if (ctx.fxChain.length > 0) {
    tagged.fxChain = ctx.fxChain;
    tagged.source = { ...slide.source, fxChain: ctx.fxChain };
    tagged.destination = { ...slide.destination, fxChain: ctx.fxChain };
  }
  if (ctx.envelope !== undefined) {
    tagged.envelope = ctx.envelope;
    tagged.source = { ...tagged.source, envelope: ctx.envelope };
    tagged.destination = { ...tagged.destination, envelope: ctx.envelope };
  }
  if (ctx.durationScale !== 1.0) {
    tagged.durationScale = ctx.durationScale;
    tagged.source = { ...tagged.source, durationScale: ctx.durationScale };
    tagged.destination = { ...tagged.destination, durationScale: ctx.durationScale };
  }
  if (ctx.dynamicOverride !== undefined) {
    tagged.source = { ...tagged.source, effectiveDynamic: ctx.dynamicOverride };
    tagged.destination = { ...tagged.destination, effectiveDynamic: ctx.dynamicOverride };
  }
  return tagged;
}

// ---- Type guard ----

function isEvent(node: TopLevel): boolean {
  return (
    node.kind === "Note" ||
    node.kind === "Chord" ||
    node.kind === "Slide" ||
    node.kind === "Rest" ||
    node.kind === "Sustain" ||
    node.kind === "Tie" ||
    node.kind === "Dynamic" ||
    node.kind === "Ramp" ||
    node.kind === "Repeat" ||
    node.kind === "With" ||
    node.kind === "Envelope" ||
    node.kind === "Tuplet" ||
    node.kind === "Bar" ||
    node.kind === "MotifRef" ||
    node.kind === "Call" ||
    node.kind === "Annotated" ||
    node.kind === "AnnotatedBlock"
  );
}

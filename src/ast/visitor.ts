import type {
  AnnotatedBlock,
  AnnotatedEvent,
  Binding,
  Block,
  ChordEvent,
  Composition,
  Directive,
  EnvelopeExpr,
  Event,
  EventList,
  InstrumentDef,
  NoteEvent,
  RampExpr,
  RepeatExpr,
  RestEvent,
  SlideEvent,
  TopLevel,
  TupletExpr,
  UseDecl,
  VoiceDecl,
  WithExpr,
} from "./nodes.js";

export type Visitor = {
  Composition?: (n: Composition) => void;
  TopLevel?: (n: TopLevel) => void;
  UseDecl?: (n: UseDecl) => void;
  Directive?: (n: Directive) => void;
  Binding?: (n: Binding) => void;
  VoiceDecl?: (n: VoiceDecl) => void;
  InstrumentDef?: (n: InstrumentDef) => void;
  Event?: (n: Event) => void;
  Note?: (n: NoteEvent) => void;
  Chord?: (n: ChordEvent) => void;
  Slide?: (n: SlideEvent) => void;
  Rest?: (n: RestEvent) => void;
  Ramp?: (n: RampExpr) => void;
  Repeat?: (n: RepeatExpr) => void;
  With?: (n: WithExpr) => void;
  Envelope?: (n: EnvelopeExpr) => void;
  Tuplet?: (n: TupletExpr) => void;
  Annotated?: (n: AnnotatedEvent) => void;
  AnnotatedBlock?: (n: AnnotatedBlock) => void;
  Block?: (n: Block) => void;
  EventList?: (n: EventList) => void;
};

export function walk(root: Composition, v: Visitor): void {
  v.Composition?.(root);
  for (const t of root.body) walkTopLevel(t, v);
}

function walkTopLevel(n: TopLevel, v: Visitor): void {
  v.TopLevel?.(n);
  switch (n.kind) {
    case "UseDecl":
      v.UseDecl?.(n);
      return;
    case "Tempo":
    case "Time":
    case "Key":
    case "Instrument":
    case "Detune":
    case "Version":
      v.Directive?.(n);
      return;
    case "Binding":
      v.Binding?.(n);
      walkExprLike(n.body, v);
      return;
    case "VoiceDecl":
      v.VoiceDecl?.(n);
      v.Block?.(n.body);
      for (const t of n.body.body) walkTopLevel(t, v);
      return;
    case "InstrumentDef":
      v.InstrumentDef?.(n);
      return;
    default:
      walkEvent(n, v);
  }
}

function walkExprLike(n: Block | EventList, v: Visitor): void {
  if (n.kind === "Block") {
    v.Block?.(n);
    for (const t of n.body) walkTopLevel(t, v);
  } else {
    v.EventList?.(n);
    for (const e of n.events) walkEvent(e, v);
  }
}

function walkEvent(n: Event, v: Visitor): void {
  v.Event?.(n);
  switch (n.kind) {
    case "Note":
      v.Note?.(n);
      return;
    case "Chord":
      v.Chord?.(n);
      return;
    case "Slide":
      v.Slide?.(n);
      walkEvent(n.source, v);
      walkEvent(n.destination, v);
      return;
    case "Rest":
      v.Rest?.(n);
      return;
    case "Sustain":
    case "Tie":
      return;
    case "Dynamic":
      return;
    case "Ramp":
      v.Ramp?.(n);
      v.Block?.(n.body);
      for (const t of n.body.body) walkTopLevel(t, v);
      return;
    case "Repeat":
      v.Repeat?.(n);
      v.Block?.(n.body);
      for (const t of n.body.body) walkTopLevel(t, v);
      return;
    case "With":
      v.With?.(n);
      v.Block?.(n.body);
      for (const t of n.body.body) walkTopLevel(t, v);
      return;
    case "Envelope":
      v.Envelope?.(n);
      v.Block?.(n.body);
      for (const t of n.body.body) walkTopLevel(t, v);
      return;
    case "Tuplet":
      v.Tuplet?.(n);
      v.Block?.(n.body);
      for (const t of n.body.body) walkTopLevel(t, v);
      return;
    case "Bar":
    case "MotifRef":
    case "Call":
      return;
    case "Annotated":
      v.Annotated?.(n);
      walkEvent(n.target, v);
      return;
    case "AnnotatedBlock":
      v.AnnotatedBlock?.(n);
      v.Block?.(n.target);
      for (const t of n.target.body) walkTopLevel(t, v);
      return;
  }
}

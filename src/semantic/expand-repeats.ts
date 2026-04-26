import type { Block, ChordEvent, Composition, Event, NoteEvent, TopLevel } from "../ast/nodes.js";

// ---- Public API ----

/**
 * Expand all RepeatExpr nodes and event-level `repeat` fields into flat copies.
 * Pure AST→AST transform; returns a new Composition (body replaced in-place).
 */
export function expandRepeats(ast: Composition): Composition {
  return {
    ...ast,
    body: expandTopLevelList(ast.body),
  };
}

// ---- Top-level list ----

function expandTopLevelList(body: TopLevel[]): TopLevel[] {
  const result: TopLevel[] = [];
  for (const node of body) {
    result.push(...expandTopLevel(node));
  }
  return result;
}

function expandTopLevel(node: TopLevel): TopLevel[] {
  switch (node.kind) {
    case "VoiceDecl":
      return [
        {
          ...node,
          body: expandBlock(node.body),
        },
      ];

    case "Binding":
      if (node.body.kind === "Block") {
        return [{ ...node, body: expandBlock(node.body) }];
      }
      // EventList body
      return [
        {
          ...node,
          body: {
            ...node.body,
            events: expandEventList(node.body.events),
          },
        },
      ];

    default:
      if (isEvent(node)) {
        return expandEvent(node as Event);
      }
      return [node];
  }
}

// ---- Block ----

function expandBlock(block: Block): Block {
  return {
    ...block,
    body: expandTopLevelList(block.body),
  };
}

// ---- Event list ----

function expandEventList(events: Event[]): Event[] {
  const result: Event[] = [];
  for (const ev of events) {
    result.push(...expandEvent(ev));
  }
  return result;
}

// ---- Single event ----

function expandEvent(event: Event): Event[] {
  switch (event.kind) {
    case "Repeat": {
      // RepeatExpr { count, body }: splice N copies of expanded body in place
      const expanded = expandBlock(event.body);
      const copies: TopLevel[] = [];
      for (let i = 0; i < event.count; i++) {
        copies.push(...expanded.body);
      }
      // All items in a Repeat body are Events (the parser only allows events inside repeat blocks)
      return copies as Event[];
    }

    case "Note": {
      if (event.repeat !== undefined && event.repeat > 1) {
        const { repeat: _, ...withoutRepeat } = event;
        const result: NoteEvent[] = [];
        for (let i = 0; i < event.repeat; i++) {
          result.push({ ...withoutRepeat });
        }
        return result;
      }
      if (event.repeat !== undefined) {
        const { repeat: _, ...withoutRepeat } = event;
        return [{ ...withoutRepeat }];
      }
      return [event];
    }

    case "Chord": {
      if (event.repeat !== undefined && event.repeat > 1) {
        const { repeat: _, ...withoutRepeat } = event;
        const result: ChordEvent[] = [];
        for (let i = 0; i < event.repeat; i++) {
          result.push({ ...withoutRepeat });
        }
        return result;
      }
      if (event.repeat !== undefined) {
        const { repeat: _, ...withoutRepeat } = event;
        return [{ ...withoutRepeat }];
      }
      return [event];
    }

    // Recurse into block-bearing nodes
    case "With":
      return [{ ...event, body: expandBlock(event.body) }];
    case "Envelope":
      return [{ ...event, body: expandBlock(event.body) }];
    case "Tuplet":
      return [{ ...event, body: expandBlock(event.body) }];
    case "Ramp":
      return [{ ...event, body: expandBlock(event.body) }];
    case "Annotated":
      return [{ ...event, target: expandEvent(event.target)[0] ?? event.target }];
    case "AnnotatedBlock":
      return [{ ...event, target: expandBlock(event.target) }];

    // Slide: don't recurse into source/dest independently
    // All other events: pass through
    default:
      return [event];
  }
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

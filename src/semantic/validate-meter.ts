import type {
  Block,
  Composition,
  DurationToken,
  Event,
  TimeDirective,
  TopLevel,
} from "../ast/nodes.js";
import { ValidationError } from "../errors.js";

// ---- Public API ----

/**
 * Walk the AST and validate that bar markers align with the active time signature.
 * Returns a list of warnings (never throws, never mutates AST).
 */
export function validateMeter(ast: Composition): ValidationError[] {
  const ctx = new MeterContext();
  ctx.walkTopLevelList(ast.body);
  // Flush any trailing events after the last bar (no bar = no check)
  return ctx.warnings;
}

// ---- Duration from token ----

function tokenDuration(token: DurationToken): number {
  let value = 1 / token.divisor;
  let increment = value / 2;
  for (let i = 0; i < token.dots; i++) {
    value += increment;
    increment /= 2;
  }
  if (token.triplet) value *= 2 / 3;
  return value;
}

// ---- Measure length from time sig ----

function measureLength(numerator: number, denominator: number): number {
  // e.g. 4/4: 4 * (1/4) = 1.0; 6/8: 6 * (1/8) = 0.75
  return numerator / denominator;
}

const EPSILON = 1e-6;

// ---- Walker context ----

class MeterContext {
  warnings: ValidationError[] = [];
  private timeSig: TimeDirective | null = null;
  private runningSum = 0;

  walkTopLevelList(body: TopLevel[]): void {
    for (const node of body) {
      this.walkTopLevel(node);
    }
  }

  private walkTopLevel(node: TopLevel): void {
    switch (node.kind) {
      case "Time":
        // New time directive: reset running sum (no validation of partial bar at sig change)
        this.timeSig = node;
        this.runningSum = 0;
        break;

      case "VoiceDecl":
        // Walk inside voices with a fresh sub-context
        this.walkBlock(node.body);
        break;

      case "Binding":
        // Walk binding bodies
        if (node.body.kind === "Block") {
          this.walkBlock(node.body);
        } else {
          for (const ev of node.body.events) {
            this.walkEvent(ev);
          }
        }
        break;

      default:
        if (isEvent(node)) {
          this.walkEvent(node as Event);
        }
        break;
    }
  }

  private walkBlock(block: Block): void {
    this.walkTopLevelList(block.body);
  }

  private walkEvent(event: Event): void {
    switch (event.kind) {
      case "Note":
        if (event.duration !== undefined) {
          this.runningSum += tokenDuration(event.duration);
        }
        break;

      case "Chord":
        if (event.duration !== undefined) {
          this.runningSum += tokenDuration(event.duration);
        }
        break;

      case "Rest":
        if (event.duration !== undefined) {
          this.runningSum += tokenDuration(event.duration);
        }
        break;

      case "Slide":
        // Count the source note's duration (slide contributes one event's worth)
        if (event.source.duration !== undefined) {
          this.runningSum += tokenDuration(event.source.duration);
        }
        break;

      case "Bar": {
        // Validate bar: compare running sum to expected measure length
        if (this.timeSig !== null) {
          const expected = measureLength(this.timeSig.numerator, this.timeSig.denominator);
          const diff = Math.abs(this.runningSum - expected);
          if (diff > EPSILON) {
            this.warnings.push(
              new ValidationError(
                `bar has ${this.runningSum.toFixed(6)} beats but time signature expects ${expected.toFixed(6)}`,
                event.span,
                "warning",
              ),
            );
          }
        }
        this.runningSum = 0;
        break;
      }

      // Recurse into block-bearing events
      case "Repeat":
        this.walkBlock(event.body);
        break;
      case "With":
        this.walkBlock(event.body);
        break;
      case "Envelope":
        this.walkBlock(event.body);
        break;
      case "Tuplet":
        this.walkBlock(event.body);
        break;
      case "Ramp":
        this.walkBlock(event.body);
        break;
      case "Annotated":
        this.walkEvent(event.target);
        break;
      case "AnnotatedBlock":
        this.walkBlock(event.target);
        break;

      default:
        break;
    }
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

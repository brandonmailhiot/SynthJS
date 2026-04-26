import type {
  Annotation,
  Arg,
  Binding,
  Block,
  Call,
  Composition,
  Event,
  InstrumentDef,
  TopLevel,
  UseDecl,
} from "../ast/nodes.js";
import { ResolveError } from "../errors.js";
import { isMode } from "../modes.js";
import { didYouMean } from "./did-you-mean.js";
import type { LoadedModule } from "./module-loader.js";
import {
  ANNOTATION_REGISTRY,
  isKnownAnnotation,
  validateAnnotationArgs,
} from "./registries/annotations.js";
import { EFFECT_REGISTRY, isKnownEffect, validateEffectArgs } from "./registries/effects.js";
import {
  isEnvelopeName,
  isPrimitiveOscillator,
  validateEnvelopeCall,
  validateFilterCall,
} from "./registries/instruments.js";
import { SymbolTable } from "./symbol-table.js";

// ---- Public types ----

export type ResolveResult = {
  ast: Composition;
  symbolTable: SymbolTable;
};

// ---- Arg conversion helpers ----

type ArgInput =
  | { kind: "NumberArg"; value: number }
  | { kind: "StringArg"; value: string }
  | { kind: "NamedArg"; name: string; value: ArgInput };

function toArgInput(a: Arg): ArgInput | null {
  if (a.kind === "NumberArg") return { kind: "NumberArg", value: a.value };
  if (a.kind === "StringArg") return { kind: "StringArg", value: a.value };
  if (a.kind === "NamedArg") {
    const inner = toArgInput(a.value);
    if (inner === null) return null;
    return { kind: "NamedArg", name: a.name, value: inner };
  }
  // PitchArg, IdentArg — not supported in registry validation
  return null;
}

function argsToInputs(args: Arg[]): ArgInput[] {
  const out: ArgInput[] = [];
  for (const a of args) {
    const inp = toArgInput(a);
    if (inp !== null) out.push(inp);
  }
  return out;
}

// ---- Cycle detection ----

/** Collect all MotifRef / Call names directly reachable from a binding body (non-recursive). */
function collectDirectRefs(binding: Binding): Set<string> {
  const refs = new Set<string>();
  collectRefsInTopLevel(binding, refs);
  return refs;
}

function collectRefsInTopLevel(node: TopLevel, refs: Set<string>): void {
  switch (node.kind) {
    case "Binding":
      collectRefsInExpr(node.body, refs);
      break;
    case "VoiceDecl":
      collectRefsInBlock(node.body, refs);
      break;
    default:
      // Directives, UseDecl, InstrumentDef, Events — handled via event path
      if (isEvent(node)) collectRefsInEvent(node, refs);
  }
}

function isEvent(node: TopLevel): node is Event {
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

function collectRefsInExpr(
  expr: Block | { kind: "EventList"; events: Event[] },
  refs: Set<string>,
): void {
  if (expr.kind === "Block") {
    collectRefsInBlock(expr, refs);
  } else {
    for (const e of expr.events) collectRefsInEvent(e, refs);
  }
}

function collectRefsInBlock(block: Block, refs: Set<string>): void {
  for (const t of block.body) collectRefsInTopLevel(t, refs);
}

function collectRefsInEvent(event: Event, refs: Set<string>): void {
  switch (event.kind) {
    case "MotifRef":
      refs.add(event.name);
      break;
    case "Call":
      refs.add(event.name);
      break;
    case "Repeat":
    case "With":
    case "Envelope":
    case "Tuplet":
    case "Ramp":
      collectRefsInBlock(event.body, refs);
      break;
    case "Annotated":
      collectRefsInEvent(event.target, refs);
      break;
    case "AnnotatedBlock":
      collectRefsInBlock(event.target, refs);
      break;
    case "Slide":
      collectRefsInEvent(event.source, refs);
      collectRefsInEvent(event.destination, refs);
      break;
    default:
      break;
  }
}

function detectCycles(bindings: Map<string, Binding>): void {
  // Build adjacency: name -> direct motif ref names that are also bindings
  const graph = new Map<string, Set<string>>();
  for (const [name, binding] of bindings) {
    const refs = collectDirectRefs(binding);
    // Only keep refs to other bindings (ignore instrument refs, etc.)
    const edges = new Set<string>();
    const isParameterized = binding.params !== undefined && binding.params.length > 0;
    for (const r of refs) {
      if (!bindings.has(r)) continue;
      // Parameterized bindings may contain a call to themselves as a call site
      // embedded by the parser (e.g. `arp(root) = ... \narp(c4)`). This is not
      // a true recursive cycle — it represents an inlined call with concrete args
      // and is resolved at lower-pitch time. Skip self-loops for parameterized bindings.
      if (isParameterized && r === name) continue;
      edges.add(r);
    }
    graph.set(name, edges);
  }

  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  for (const name of bindings.keys()) color.set(name, WHITE);

  const stack: string[] = [];

  function dfs(node: string): void {
    color.set(node, GRAY);
    stack.push(node);
    for (const neighbor of graph.get(node) ?? []) {
      const c = color.get(neighbor) ?? WHITE;
      if (c === GRAY) {
        // Found cycle — reconstruct path
        const cycleStart = stack.indexOf(neighbor);
        const cyclePath = [...stack.slice(cycleStart), neighbor].join(" -> ");
        // Find a span for the error (use the binding's span)
        const b = bindings.get(node);
        const span = b?.span ?? { start: 0, end: 0, line: 1, column: 1 };
        throw new ResolveError(`motif cycle detected: ${cyclePath}`, span);
      }
      if (c === WHITE) dfs(neighbor);
    }
    stack.pop();
    color.set(node, BLACK);
  }

  for (const name of bindings.keys()) {
    if ((color.get(name) ?? WHITE) === WHITE) dfs(name);
  }
}

// ---- Suggestion helper ----

function withSuggestion(base: string, suggestion: string | null): string {
  if (suggestion === null) return base;
  return `${base}; did you mean '${suggestion}'?`;
}

// ---- Annotation validation ----

function validateAnnotation(ann: Annotation): void {
  const keys = Object.keys(ANNOTATION_REGISTRY);
  if (!isKnownAnnotation(ann.name)) {
    const suggestion = didYouMean(ann.name, keys);
    throw new ResolveError(
      withSuggestion(`unknown annotation '${ann.name}'`, suggestion),
      ann.span,
      suggestion ?? undefined,
    );
  }
  const inputs = argsToInputs(ann.args);
  const err = validateAnnotationArgs(ann.name, inputs);
  if (err !== null) {
    throw new ResolveError(err, ann.span);
  }
}

// ---- Effect validation ----

function validateEffectCall(call: Call): void {
  const effectNames = Object.keys(EFFECT_REGISTRY);
  if (!isKnownEffect(call.name)) {
    const suggestion = didYouMean(call.name, effectNames);
    throw new ResolveError(
      withSuggestion(`unknown effect '${call.name}'`, suggestion),
      call.span,
      suggestion ?? undefined,
    );
  }
  const inputs = argsToInputs(call.args);
  const err = validateEffectArgs(call.name, inputs);
  if (err !== null) {
    throw new ResolveError(err, call.span);
  }
}

// ---- Envelope validation ----

function validateEnvelope(call: Call): void {
  const envelopeNames = ["adsr", "linear", "percussive"];
  if (!isEnvelopeName(call.name)) {
    const suggestion = didYouMean(call.name, envelopeNames);
    throw new ResolveError(
      withSuggestion(`unknown envelope '${call.name}'`, suggestion),
      call.span,
      suggestion ?? undefined,
    );
  }
  const inputs = argsToInputs(call.args);
  const err = validateEnvelopeCall(call.name, inputs);
  if (err !== null) {
    throw new ResolveError(err, call.span);
  }
}

// ---- Filter validation ----

function validateFilter(call: Call): void {
  const filterNames = ["lowpass", "highpass", "bandpass", "notch"];
  if (!filterNames.includes(call.name)) {
    const suggestion = didYouMean(call.name, filterNames);
    throw new ResolveError(
      withSuggestion(`unknown filter '${call.name}'`, suggestion),
      call.span,
      suggestion ?? undefined,
    );
  }
  const inputs = argsToInputs(call.args);
  const err = validateFilterCall(call.name, inputs);
  if (err !== null) {
    throw new ResolveError(err, call.span);
  }
}

// ---- Instrument def validation ----

function validateInstrumentDef(def: InstrumentDef): void {
  for (const field of def.fields) {
    switch (field.kind) {
      case "Oscillator": {
        if (!isPrimitiveOscillator(field.value)) {
          const primitives = ["sine", "square", "sawtooth", "triangle"];
          const suggestion = didYouMean(field.value, primitives);
          throw new ResolveError(
            withSuggestion(
              `unknown oscillator '${field.value}'; must be a primitive oscillator`,
              suggestion,
            ),
            field.span,
            suggestion ?? undefined,
          );
        }
        break;
      }
      case "EnvelopeField": {
        validateEnvelope(field.call);
        break;
      }
      case "FilterField": {
        validateFilter(field.call);
        break;
      }
      case "DetuneField":
        // No validation needed
        break;
      case "PitchSweepField":
        if (field.duration < 0) {
          throw new ResolveError(
            `pitch_sweep duration must be non-negative, got ${field.duration}`,
            field.span,
          );
        }
        break;
    }
  }
}

// ---- Main walker ----

class Resolver {
  readonly table: SymbolTable;
  // All top-level bindings collected for cycle detection
  private topLevelBindings = new Map<string, Binding>();

  constructor(table: SymbolTable) {
    this.table = table;
  }

  resolveComposition(ast: Composition): void {
    // Pass 1: collect all top-level bindings and instrument defs into symbol table
    for (const node of ast.body) {
      if (node.kind === "Binding") {
        try {
          this.table.define(node.name, node);
        } catch {
          // Already defined — let the walk raise naturally, or we silently ignore re-defs
          // (symbol table already throws; we re-throw with a span)
          throw new ResolveError(`'${node.name}' already defined`, node.span);
        }
        this.topLevelBindings.set(node.name, node);
      } else if (node.kind === "InstrumentDef") {
        try {
          this.table.define(node.name, node);
        } catch {
          throw new ResolveError(`'${node.name}' already defined`, node.span);
        }
      }
    }

    // Pass 2: cycle detection on top-level bindings
    detectCycles(this.topLevelBindings);

    // Pass 3: walk and validate everything
    for (const node of ast.body) {
      this.resolveTopLevel(node);
    }
  }

  private resolveTopLevel(node: TopLevel): void {
    switch (node.kind) {
      case "UseDecl":
        // Handled by resolveWithImports
        break;
      case "Binding":
        this.resolveExpr(node.body);
        break;
      case "VoiceDecl": {
        // Validate annotations on the voice
        for (const ann of node.annotations) validateAnnotation(ann);
        // Push child scope for voice-local bindings
        this.table.pushScope();
        // Collect voice-local bindings first
        for (const t of node.body.body) {
          if (t.kind === "Binding") {
            try {
              this.table.define(t.name, t);
            } catch {
              throw new ResolveError(`'${t.name}' already defined`, t.span);
            }
          } else if (t.kind === "InstrumentDef") {
            try {
              this.table.define(t.name, t);
            } catch {
              throw new ResolveError(`'${t.name}' already defined`, t.span);
            }
          }
        }
        // Walk voice body
        for (const t of node.body.body) {
          this.resolveTopLevel(t);
        }
        this.table.popScope();
        break;
      }
      case "InstrumentDef":
        validateInstrumentDef(node);
        break;
      case "Tempo":
      case "Time":
      case "Detune":
      case "Version":
        break;
      case "Key":
        if (!isMode(node.mode)) {
          const suggestion = didYouMean(node.mode, [
            "major",
            "minor",
            "dorian",
            "phrygian",
            "lydian",
            "mixolydian",
            "locrian",
          ]);
          throw new ResolveError(`unknown mode '${node.mode}'`, node.span, suggestion ?? undefined);
        }
        break;
      case "Instrument":
        this.resolveInstrumentDirective(node.name, node.span);
        break;
      default:
        // Events at top level
        if (isEvent(node)) this.resolveEvent(node);
    }
  }

  private resolveInstrumentDirective(
    name: string,
    span: { start: number; end: number; line: number; column: number },
  ): void {
    if (isPrimitiveOscillator(name)) return;
    // Check if it's a defined custom instrument
    const sym = this.table.lookup(name);
    if (sym !== null && sym.kind === "InstrumentDef") return;
    // Unknown instrument
    const candidates = [...["sine", "square", "sawtooth", "triangle"], ...this.table.listAll()];
    const suggestion = didYouMean(name, candidates);
    throw new ResolveError(
      withSuggestion(`unknown instrument '${name}'`, suggestion),
      span,
      suggestion ?? undefined,
    );
  }

  private resolveExpr(expr: Binding["body"]): void {
    if (expr.kind === "Block") {
      this.resolveBlock(expr);
    } else {
      for (const e of expr.events) this.resolveEvent(e);
    }
  }

  private resolveBlock(block: Block): void {
    for (const t of block.body) this.resolveTopLevel(t);
  }

  private resolveEvent(event: Event): void {
    switch (event.kind) {
      case "Note":
        for (const ann of event.annotations) validateAnnotation(ann);
        break;
      case "Chord":
        for (const ann of event.annotations) validateAnnotation(ann);
        break;
      case "Rest":
        for (const ann of event.annotations) validateAnnotation(ann);
        break;
      case "Annotated":
        for (const ann of event.annotations) validateAnnotation(ann);
        this.resolveEvent(event.target);
        break;
      case "AnnotatedBlock":
        for (const ann of event.annotations) validateAnnotation(ann);
        this.resolveBlock(event.target);
        break;
      case "MotifRef": {
        const sym = this.table.lookup(event.name);
        if (sym === null) {
          const suggestion = didYouMean(event.name, this.table.listAll());
          throw new ResolveError(
            withSuggestion(`undefined motif '${event.name}'`, suggestion),
            event.span,
            suggestion ?? undefined,
          );
        }
        break;
      }
      case "Call": {
        const sym = this.table.lookup(event.name);
        if (sym === null) {
          const suggestion = didYouMean(event.name, this.table.listAll());
          throw new ResolveError(
            withSuggestion(`undefined motif '${event.name}'`, suggestion),
            event.span,
            suggestion ?? undefined,
          );
        }
        // Validate it's a parameterized binding
        if (sym.kind === "Binding" && (sym.params === undefined || sym.params.length === 0)) {
          throw new ResolveError(`'${event.name}' is not parameterized`, event.span);
        }
        break;
      }
      case "With":
        for (const eff of event.effects) validateEffectCall(eff);
        this.resolveBlock(event.body);
        break;
      case "Envelope":
        validateEnvelope(event.call);
        this.resolveBlock(event.body);
        break;
      case "Repeat":
        this.resolveBlock(event.body);
        break;
      case "Tuplet":
        this.resolveBlock(event.body);
        break;
      case "Ramp":
        this.resolveBlock(event.body);
        break;
      case "Slide":
        this.resolveEvent(event.source);
        this.resolveEvent(event.destination);
        break;
      case "Sustain":
      case "Tie":
      case "Dynamic":
      case "Bar":
        break;
    }
  }
}

// ---- Public API ----

export function resolve(ast: Composition): ResolveResult {
  const table = new SymbolTable();
  const resolver = new Resolver(table);
  resolver.resolveComposition(ast);
  return { ast, symbolTable: table };
}

export async function resolveWithImports(
  ast: Composition,
  modules: Map<string, LoadedModule>,
): Promise<ResolveResult> {
  const table = new SymbolTable();

  // Process \use declarations first
  for (const node of ast.body) {
    if (node.kind !== "UseDecl") continue;
    const useDecl = node as UseDecl;

    // Find the loaded module for this path
    const mod = findModule(modules, useDecl.path);
    if (mod === null) {
      throw new ResolveError(`module not found: '${useDecl.path}'`, useDecl.span);
    }

    // Collect exported bindings from the module
    const exported = collectExports(mod.ast);

    if (useDecl.selected !== undefined && useDecl.selected.length > 0) {
      // Selective import: \use "path" (a, b)
      for (const name of useDecl.selected) {
        const binding = exported.get(name);
        if (binding === undefined) {
          throw new ResolveError(`'${name}' not found in module '${useDecl.path}'`, useDecl.span);
        }
        if (table.lookup(name) !== null) {
          throw new ResolveError(`import conflict: '${name}' already defined`, useDecl.span);
        }
        table.define(name, binding);
      }
    } else if (useDecl.alias !== undefined) {
      // Aliased import: \use "path" as alias
      for (const [name, binding] of exported) {
        const qualifiedName = `${useDecl.alias}.${name}`;
        if (table.lookup(qualifiedName) !== null) {
          throw new ResolveError(
            `import conflict: '${qualifiedName}' already defined`,
            useDecl.span,
          );
        }
        table.define(qualifiedName, binding);
      }
    } else {
      // Plain import: \use "path"
      for (const [name, binding] of exported) {
        if (table.lookup(name) !== null) {
          throw new ResolveError(`import conflict: '${name}' already defined`, useDecl.span);
        }
        table.define(name, binding);
      }
    }
  }

  const resolver = new Resolver(table);
  resolver.resolveComposition(ast);
  return { ast, symbolTable: table };
}

function findModule(modules: Map<string, LoadedModule>, path: string): LoadedModule | null {
  // Try direct key match first
  const direct = modules.get(path);
  if (direct !== undefined) return direct;
  // Normalize ./foo -> foo and ../dir/foo -> dir/foo for suffix matching
  const normalized = path.replace(/^(\.\/)+/, "").replace(/^(\.\.\/)+([\s\S]*)$/, "$2");
  for (const [key, mod] of modules) {
    if (key.endsWith(path) || key.endsWith(`/${path}`) || key.endsWith(`/${normalized}`)) {
      return mod;
    }
  }
  return null;
}

function collectExports(ast: Composition): Map<string, Binding | InstrumentDef> {
  const result = new Map<string, Binding | InstrumentDef>();
  for (const node of ast.body) {
    if (node.kind === "Binding") result.set(node.name, node);
    else if (node.kind === "InstrumentDef") result.set(node.name, node);
  }
  return result;
}

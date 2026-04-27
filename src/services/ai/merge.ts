/**
 * Merge an AI-emitted DSL fragment into the current composition source by
 * splicing top-level blocks rather than regenerating the whole piece.
 *
 * This lets the AI return only the voices, instrument defs, or directives
 * that actually changed — saving tokens and regeneration time on every
 * follow-up turn — while preserving everything else verbatim.
 *
 * Block identity is determined by `(kind, name)`:
 *   - voice <name> { … }            keyed by name
 *   - instrument define <name> { … }  keyed by name
 *   - <name>(<params>) = …          binding, keyed by name
 *   - \\tempo / \\time / \\key / \\version  keyed by kind (one per source)
 *   - \\use "<path>"                keyed by path
 *
 * Behavior:
 *   - When the AI block matches an existing block by key, the existing
 *     source range is replaced with the AI block's source range.
 *   - When the AI block has no match, it is appended at the end.
 *   - Top-level events, dynamics, and other inline content in the AI
 *     output are skipped (they belong inside voices).
 *   - When the AI source fails to parse, returns the AI output unchanged
 *     so the caller can fall back to the prior full-rewrite path.
 */

import type { TopLevel } from "../../ast/nodes.js";
import type { SourceSpan } from "../../errors.js";
import { lex } from "../../lexer/lexer.js";
import { parse } from "../../parser/parser.js";

export type MergeResult = {
  /** Final merged DSL source. */
  text: string;
  /** Names of blocks that replaced an existing block in the current source. */
  replaced: string[];
  /** Names of blocks appended because no existing match was found. */
  added: string[];
  /** Top-level items in the AI output that were ignored (e.g. stray events). */
  skipped: number;
};

function nodeKey(node: TopLevel): string | null {
  switch (node.kind) {
    case "VoiceDecl":
      return `voice:${node.name}`;
    case "InstrumentDef":
      return `instrument:${node.name}`;
    case "Binding":
      return `binding:${node.name}`;
    case "Version":
      return "directive:version";
    case "Tempo":
      return "directive:tempo";
    case "Time":
      return "directive:time";
    case "Key":
      return "directive:key";
    case "UseDecl":
      return `use:${(node as { path: string }).path}`;
    default:
      return null;
  }
}

function nodeLabel(node: TopLevel): string {
  switch (node.kind) {
    case "VoiceDecl":
      return `voice ${node.name}`;
    case "InstrumentDef":
      return `instrument ${node.name}`;
    case "Binding":
      return `motif ${node.name}`;
    case "Version":
      return "\\version";
    case "Tempo":
      return "\\tempo";
    case "Time":
      return "\\time";
    case "Key":
      return "\\key";
    case "UseDecl":
      return `\\use "${(node as { path: string }).path}"`;
    default:
      return node.kind;
  }
}

export function mergeBlocks(currentSource: string, aiOutput: string): MergeResult {
  // Parse the current source. If it fails, we have nothing to merge into;
  // fall back to the AI output as a full replacement.
  let currentAst: ReturnType<typeof parse>;
  try {
    currentAst = parse(lex(currentSource));
  } catch {
    return { text: aiOutput, replaced: [], added: [], skipped: 0 };
  }
  let aiAst: ReturnType<typeof parse>;
  try {
    aiAst = parse(lex(aiOutput));
  } catch {
    // AI emitted something that doesn't parse — pass through unchanged so
    // the caller can decide what to do.
    return { text: aiOutput, replaced: [], added: [], skipped: 0 };
  }

  // Map every keyed top-level node in the current source to its span.
  const currentBySpan = new Map<string, SourceSpan>();
  for (const node of currentAst.body) {
    const key = nodeKey(node);
    if (key) currentBySpan.set(key, node.span);
  }

  type Edit = { start: number; end: number; text: string };
  const edits: Edit[] = [];
  const appended: string[] = [];
  const replaced: string[] = [];
  const added: string[] = [];
  let skipped = 0;

  for (const node of aiAst.body) {
    const key = nodeKey(node);
    if (!key) {
      skipped++;
      continue;
    }
    const aiText = aiOutput.slice(node.span.start, node.span.end);
    const existing = currentBySpan.get(key);
    if (existing) {
      edits.push({ start: existing.start, end: existing.end, text: aiText });
      replaced.push(nodeLabel(node));
    } else {
      appended.push(aiText);
      added.push(nodeLabel(node));
    }
  }

  // Apply replacements in reverse-source order so earlier indices stay valid.
  edits.sort((a, b) => b.start - a.start);
  let merged = currentSource;
  for (const e of edits) {
    merged = merged.slice(0, e.start) + e.text + merged.slice(e.end);
  }
  if (appended.length > 0) {
    merged = `${merged.trimEnd()}\n\n${appended.join("\n\n")}\n`;
  }

  return { text: merged, replaced, added, skipped };
}

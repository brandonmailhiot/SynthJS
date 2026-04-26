import type { EffectInvocation } from "../ir/nodes.js";
import type { AudioContextLike, AudioNodeLike } from "./audio-context.js";
import { buildEffect } from "./effects.js";

export function buildFxChain(
  ctx: AudioContextLike,
  fxChain: EffectInvocation[],
  source: AudioNodeLike,
): AudioNodeLike {
  if (fxChain.length === 0) return source;
  let currentOutput = source;
  for (const effect of fxChain) {
    const node = buildEffect(ctx, effect);
    currentOutput.connect(node.input);
    currentOutput = node.output;
  }
  return currentOutput;
}

/**
 * Build the fx chain as a free-standing graph fragment. The caller is
 * responsible for connecting each event's source to `input` and connecting
 * `output` to a downstream node. Lets multiple events share one chain instead
 * of constructing a fresh ConvolverNode per note.
 */
export function buildFxChainNodes(
  ctx: AudioContextLike,
  fxChain: EffectInvocation[],
): { input: AudioNodeLike; output: AudioNodeLike } | null {
  if (fxChain.length === 0) return null;
  let entry: AudioNodeLike | null = null;
  let current: AudioNodeLike | null = null;
  for (const effect of fxChain) {
    const node = buildEffect(ctx, effect);
    if (!entry) entry = node.input;
    if (current) current.connect(node.input);
    current = node.output;
  }
  if (!entry || !current) return null;
  return { input: entry, output: current };
}

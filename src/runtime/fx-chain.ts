import type { EffectInvocation } from "../ir/nodes.js";
import type { AudioContextLike, AudioNodeLike } from "./audio-context.js";
import { buildEffect } from "./effects.js";

export function buildFxChain(
  ctx: AudioContextLike,
  fxChain: EffectInvocation[],
  source: AudioNodeLike,
): AudioNodeLike {
  if (fxChain.length === 0) return source;
  let current = source;
  for (const effect of fxChain) {
    const node = buildEffect(ctx, effect);
    current.connect(node);
    current = node;
  }
  return current;
}

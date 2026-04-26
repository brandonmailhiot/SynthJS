import { CHORDS_SOURCE } from "./chords.js";
import { DRUMS_SAMPLED_SOURCE } from "./drums-sampled.js";
import { DRUMS_SOURCE } from "./drums.js";
import { FX_SOURCE } from "./fx.js";
import { INSTRUMENTS_SOURCE } from "./instruments.js";
import { SCALES_SOURCE } from "./scales.js";

export const STDLIB: Record<string, string> = {
  "@stdlib/scales": SCALES_SOURCE,
  "@stdlib/chords": CHORDS_SOURCE,
  "@stdlib/drums": DRUMS_SOURCE,
  "@stdlib/drums-sampled": DRUMS_SAMPLED_SOURCE,
  "@stdlib/instruments": INSTRUMENTS_SOURCE,
  "@stdlib/fx": FX_SOURCE,
};

export function isStdlibPath(path: string): boolean {
  return Object.hasOwn(STDLIB, path);
}

export function getStdlibSource(path: string): string | undefined {
  return STDLIB[path];
}

export { SCALES_SOURCE } from "./scales.js";
export { CHORDS_SOURCE } from "./chords.js";
export { DRUMS_SOURCE } from "./drums.js";
export { DRUMS_SAMPLED_SOURCE } from "./drums-sampled.js";
export { INSTRUMENTS_SOURCE } from "./instruments.js";
export { FX_SOURCE } from "./fx.js";
export { STDLIB_SAMPLES } from "./samples-data.js";

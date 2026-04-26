import type { ArticulationKind } from "../ir/nodes.js";

export type ArticulationAdjustment = {
  playDuration: number;
  gainBoost: number;
};

export function applyArticulation(
  marks: ArticulationKind[],
  baseDuration: number,
): ArticulationAdjustment {
  let playDuration = baseDuration;
  let gainBoost = 1.0;

  for (const mark of marks) {
    switch (mark) {
      case ".":
        playDuration = baseDuration * 0.5;
        break;
      case "_":
        playDuration = baseDuration; // tenuto: full duration, no gap
        break;
      case ">":
        gainBoost = 1.2;
        break;
      case "^":
        playDuration = baseDuration * 0.6;
        gainBoost = 1.3;
        break;
    }
  }

  return { playDuration, gainBoost };
}
